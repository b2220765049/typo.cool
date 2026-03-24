# Typo Party Edge Functions

These function names are used by the website page `party/index.html`.

## Security rules

- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Supabase project secrets.
- Do not return internal stack traces to clients.
- Enforce host auth for create/start/end operations.
- Apply request throttling by IP + room key for guest join and result submit.

## Required functions

1. `party-create-room` (auth required)
- Input:
```json
{ "roomName": "cuma-aksami", "hostNickname": "Emre", "maxParticipants": 12 }
```
- Behavior:
  - Verify JWT user exists.
  - Create room row with generated room code.
  - Insert host member row with `is_host=true`.
  - Create a random participant token for host, store only hash in DB.
- Output:
```json
{
  "room": { "id": "uuid", "room_code": "AB12CD", "room_name": "cuma-aksami", "status": "open", "host_user_id": "uuid" },
  "participants": [{ "nickname": "Emre", "is_host": true }],
  "results": [],
  "session": null,
  "participantToken": "plain-token-for-client"
}
```

2. `party-resolve-room` (public)
- Input:
```json
{ "roomCode": "AB12CD", "roomName": "cuma-aksami", "participantToken": "optional" }
```
- Behavior:
  - Resolve active room by code first, name fallback.
  - Return room snapshot: room, session, participant list, current results.
  - Do not reveal token hashes.

3. `party-join-room` (public)
- Input:
```json
{ "roomCode": "AB12CD", "roomName": "cuma-aksami", "nickname": "Merve" }
```
- Behavior:
  - Reject if room is locked/testing/completed.
  - Enforce max participant limit.
  - Call RPC `party_join_room_guest(...)` with hashed token.
- Output:
```json
{
  "room": { "id": "uuid", "room_code": "AB12CD", "room_name": "cuma-aksami", "status": "open", "host_user_id": "uuid" },
  "participants": [{ "nickname": "Emre", "is_host": true }, { "nickname": "Merve", "is_host": false }],
  "results": [],
  "session": null,
  "participantToken": "plain-token-for-client"
}
```

4. `party-lock-start` (auth required)
- Input:
```json
{ "roomCode": "AB12CD" }
```
- Behavior:
  - Verify caller is host.
  - Atomically lock and start IPC via `party_lock_and_start(roomCode)`.
  - Return updated snapshot.

5. `party-submit-result` (public)
- Input:
```json
{
  "roomCode": "AB12CD",
  "sessionId": "uuid",
  "participantToken": "plain-token",
  "result": {
    "testType": "ipc",
    "octant": "NO",
    "scores": { "dom": 3, "lov": 5 },
    "answers": [{ "questionIndex": 0, "optionIndex": 1 }],
    "completedAt": "2026-03-24T20:00:00.000Z"
  }
}
```
- Behavior:
  - Verify token hash matches a current member.
  - Verify session belongs to room and is active.
  - Upsert once per member+session (reject duplicate submit).
  - Broadcast via Realtime-enabled table insert.

6. `party-end-session` (auth required)
- Input:
```json
{ "roomCode": "AB12CD" }
```
- Behavior:
  - Verify caller is host.
  - Mark room completed and set `ended_at` on session.
  - Return updated snapshot.

7. `party-cleanup-expired` (scheduled)
- Behavior:
  - Delete archived/expired room data by `expires_at` threshold.
  - Keep only minimal audit events if needed.

## Recommended environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PARTY_JOIN_RATE_LIMIT_PER_MINUTE`
- `PARTY_SUBMIT_RATE_LIMIT_PER_MINUTE`
- `PARTY_ROOM_TTL_HOURS`
