-- Typo Party core schema + security baseline
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.party_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  room_name text not null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'locked', 'testing', 'completed', 'archived')),
  max_participants integer not null default 12 check (max_participants between 2 and 200),
  current_session_id uuid,
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create unique index if not exists party_rooms_room_code_active_idx
  on public.party_rooms(room_code)
  where status in ('open', 'locked', 'testing');

create index if not exists party_rooms_host_status_idx on public.party_rooms(host_user_id, status);

create table if not exists public.party_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  nickname text not null,
  user_id uuid references auth.users(id) on delete set null,
  participant_token_hash text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create unique index if not exists party_room_members_room_nickname_idx
  on public.party_room_members(room_id, nickname)
  where left_at is null;

create unique index if not exists party_room_members_room_user_idx
  on public.party_room_members(room_id, user_id)
  where user_id is not null and left_at is null;

create table if not exists public.party_test_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  test_type text not null default 'ipc' check (test_type in ('ipc')),
  started_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null
);

create table if not exists public.party_test_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  session_id uuid not null references public.party_test_sessions(id) on delete cascade,
  member_id uuid not null references public.party_room_members(id) on delete cascade,
  nickname text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists party_test_results_unique_submit_idx
  on public.party_test_results(session_id, member_id);

create table if not exists public.party_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.party_rooms(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.party_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_party_rooms_updated_at on public.party_rooms;
create trigger trg_party_rooms_updated_at
before update on public.party_rooms
for each row execute procedure public.party_touch_updated_at();

-- Utility: create random room code in base32-like alphabet.
create or replace function public.party_generate_room_code(len integer default 6)
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out_code text := '';
  i integer := 0;
begin
  if len < 4 then
    len := 4;
  end if;
  while i < len loop
    out_code := out_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    i := i + 1;
  end loop;
  return out_code;
end;
$$;

-- Guests join through this RPC (security definer) to keep table writes controlled.
create or replace function public.party_join_room_guest(
  in_room_code text,
  in_room_name text,
  in_nickname text,
  in_participant_token_hash text
)
returns table (
  room_id uuid,
  room_code text,
  room_name text,
  room_status text,
  member_id uuid,
  is_host boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.party_rooms;
  active_count integer;
  inserted_member public.party_room_members;
begin
  if coalesce(trim(in_nickname), '') = '' then
    raise exception 'Nickname is required';
  end if;

  select * into target_room
  from public.party_rooms pr
  where (
      (coalesce(trim(in_room_code), '') <> '' and pr.room_code = upper(trim(in_room_code)))
      or
      (coalesce(trim(in_room_name), '') <> '' and lower(pr.room_name) = lower(trim(in_room_name)))
    )
    and pr.status in ('open', 'locked', 'testing')
  order by pr.created_at desc
  limit 1;

  if target_room.id is null then
    raise exception 'Room not found';
  end if;

  if target_room.status <> 'open' then
    raise exception 'Room is locked';
  end if;

  select count(*) into active_count
  from public.party_room_members prm
  where prm.room_id = target_room.id and prm.left_at is null;

  if active_count >= target_room.max_participants then
    raise exception 'Room capacity full';
  end if;

  insert into public.party_room_members (
    room_id,
    nickname,
    user_id,
    participant_token_hash,
    is_host
  )
  values (
    target_room.id,
    trim(in_nickname),
    auth.uid(),
    in_participant_token_hash,
    false
  )
  returning * into inserted_member;

  insert into public.party_events (room_id, actor_user_id, event_type, payload)
  values (
    target_room.id,
    auth.uid(),
    'guest_join',
    jsonb_build_object('nickname', inserted_member.nickname)
  );

  return query
  select
    target_room.id,
    target_room.room_code,
    target_room.room_name,
    target_room.status,
    inserted_member.id,
    inserted_member.is_host;
end;
$$;

-- Host locks room and starts IPC session atomically.
create or replace function public.party_lock_and_start(in_room_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.party_rooms;
  session_id uuid;
begin
  select * into target_room
  from public.party_rooms
  where room_code = upper(trim(in_room_code))
  limit 1;

  if target_room.id is null then
    raise exception 'Room not found';
  end if;

  if target_room.host_user_id <> auth.uid() then
    raise exception 'Only host can start';
  end if;

  if target_room.status not in ('open', 'locked') then
    raise exception 'Room cannot start in current state';
  end if;

  insert into public.party_test_sessions(room_id, test_type, started_by)
  values (target_room.id, 'ipc', auth.uid())
  returning id into session_id;

  update public.party_rooms
  set
    status = 'testing',
    current_session_id = session_id,
    starts_at = now()
  where id = target_room.id;

  insert into public.party_events(room_id, actor_user_id, event_type, payload)
  values (target_room.id, auth.uid(), 'host_started_test', jsonb_build_object('session_id', session_id));

  return session_id;
end;
$$;

-- Host can explicitly end session.
create or replace function public.party_end_session(in_room_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.party_rooms;
  sid uuid;
begin
  select * into target_room
  from public.party_rooms
  where room_code = upper(trim(in_room_code))
  limit 1;

  if target_room.id is null then
    raise exception 'Room not found';
  end if;

  if target_room.host_user_id <> auth.uid() then
    raise exception 'Only host can end session';
  end if;

  sid := target_room.current_session_id;

  update public.party_rooms
  set status = 'completed'
  where id = target_room.id;

  update public.party_test_sessions
  set ended_at = now(), ended_by = auth.uid()
  where id = sid and ended_at is null;

  insert into public.party_events(room_id, actor_user_id, event_type, payload)
  values (target_room.id, auth.uid(), 'host_ended_session', jsonb_build_object('session_id', sid));

  return sid;
end;
$$;

alter table public.party_rooms enable row level security;
alter table public.party_room_members enable row level security;
alter table public.party_test_sessions enable row level security;
alter table public.party_test_results enable row level security;
alter table public.party_events enable row level security;

-- Rooms: everyone can read active rooms, only host inserts/updates own room rows.
create policy if not exists party_rooms_select_active
on public.party_rooms
for select
using (status in ('open', 'locked', 'testing', 'completed'));

create policy if not exists party_rooms_insert_host
on public.party_rooms
for insert
to authenticated
with check (host_user_id = auth.uid());

create policy if not exists party_rooms_update_host
on public.party_rooms
for update
to authenticated
using (host_user_id = auth.uid())
with check (host_user_id = auth.uid());

-- Members: read members for active rooms; direct inserts disabled for anon.
create policy if not exists party_room_members_select_active
on public.party_room_members
for select
using (
  exists (
    select 1 from public.party_rooms pr
    where pr.id = party_room_members.room_id
      and pr.status in ('open', 'locked', 'testing', 'completed')
  )
);

create policy if not exists party_room_members_insert_auth
on public.party_room_members
for insert
to authenticated
with check (
  exists (
    select 1 from public.party_rooms pr
    where pr.id = party_room_members.room_id
      and pr.status = 'open'
  )
);

-- Sessions/results/events are visible to room participants/host only.
create policy if not exists party_sessions_select_for_room_members
on public.party_test_sessions
for select
using (
  exists (
    select 1
    from public.party_room_members prm
    where prm.room_id = party_test_sessions.room_id
      and prm.left_at is null
  )
  or exists (
    select 1
    from public.party_rooms pr
    where pr.id = party_test_sessions.room_id
      and pr.host_user_id = auth.uid()
  )
);

create policy if not exists party_test_results_select_for_room_members
on public.party_test_results
for select
using (
  exists (
    select 1
    from public.party_room_members prm
    where prm.room_id = party_test_results.room_id
      and prm.left_at is null
  )
  or exists (
    select 1
    from public.party_rooms pr
    where pr.id = party_test_results.room_id
      and pr.host_user_id = auth.uid()
  )
);

create policy if not exists party_events_select_host_only
on public.party_events
for select
to authenticated
using (
  exists (
    select 1 from public.party_rooms pr
    where pr.id = party_events.room_id
      and pr.host_user_id = auth.uid()
  )
);

-- Optional grants for RPC usage from edge functions.
grant execute on function public.party_join_room_guest(text, text, text, text) to anon, authenticated;
grant execute on function public.party_lock_and_start(text) to authenticated;
grant execute on function public.party_end_session(text) to authenticated;
