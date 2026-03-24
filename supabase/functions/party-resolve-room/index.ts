// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name) || "";
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getServiceClient() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
}

function normalizeRoomCode(code: string | null | undefined): string {
  return (code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const body = await req.json();
    const roomCode = normalizeRoomCode(body.roomCode);
    const roomName = String(body.roomName || "").trim();

    if (!roomCode && !roomName) {
      return jsonResponse({ error: "roomCode or roomName is required" }, 400);
    }

    const db = getServiceClient();

    let roomQuery = db
      .from("party_rooms")
      .select("id, room_code, room_name, status, host_user_id, current_session_id")
      .order("created_at", { ascending: false })
      .limit(1);

    if (roomCode) roomQuery = roomQuery.eq("room_code", roomCode);
    else roomQuery = roomQuery.ilike("room_name", roomName);

    const { data: room, error: roomError } = await roomQuery.maybeSingle();
    if (roomError) return jsonResponse({ error: roomError.message }, 500);
    if (!room) return jsonResponse({ error: "Room not found" }, 404);

    const { data: participants, error: participantError } = await db
      .from("party_room_members")
      .select("id, nickname, is_host")
      .eq("room_id", room.id)
      .is("left_at", null)
      .order("joined_at", { ascending: true });

    if (participantError) return jsonResponse({ error: participantError.message }, 500);

    let session = null;
    if (room.current_session_id) {
      const { data: fetchedSession } = await db
        .from("party_test_sessions")
        .select("id, test_type, started_at, ended_at")
        .eq("id", room.current_session_id)
        .maybeSingle();
      session = fetchedSession || null;
    }

    const { data: results, error: resultError } = await db
      .from("party_test_results")
      .select("id, nickname, result, created_at")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true });

    if (resultError) return jsonResponse({ error: resultError.message }, 500);

    return jsonResponse({ room, session, participants: participants || [], results: results || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
