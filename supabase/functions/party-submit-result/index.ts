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

function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", bytes).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

type SubmitPayload = {
  roomCode: string;
  sessionId: string;
  participantToken: string;
  result: {
    testType: "ipc";
    octant: string;
    scores: { dom: number; lov: number };
    answers: Array<{ questionIndex: number; optionIndex: number }>;
    completedAt: string;
  };
};

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const body = (await req.json()) as SubmitPayload;
    const roomCode = normalizeRoomCode(body.roomCode);
    const sessionId = String(body.sessionId || "").trim();
    const participantToken = String(body.participantToken || "").trim();

    if (!roomCode || !sessionId || !participantToken) {
      return jsonResponse({ error: "roomCode, sessionId and participantToken are required" }, 400);
    }

    const db = getServiceClient();

    const { data: room, error: roomError } = await db
      .from("party_rooms")
      .select("id, status")
      .eq("room_code", roomCode)
      .maybeSingle();

    if (roomError || !room) return jsonResponse({ error: roomError?.message || "Room not found" }, 404);
    if (room.status !== "testing") return jsonResponse({ error: "Room is not in testing state" }, 409);

    const tokenHash = await sha256(participantToken);
    const { data: member, error: memberError } = await db
      .from("party_room_members")
      .select("id, nickname")
      .eq("room_id", room.id)
      .eq("participant_token_hash", tokenHash)
      .is("left_at", null)
      .maybeSingle();

    if (memberError || !member) {
      return jsonResponse({ error: memberError?.message || "Invalid participant token" }, 401);
    }

    const { error: resultError } = await db.from("party_test_results").insert({
      room_id: room.id,
      session_id: sessionId,
      member_id: member.id,
      nickname: member.nickname,
      result: body.result
    });

    if (resultError) {
      if (resultError.code === "23505") return jsonResponse({ error: "Result already submitted" }, 409);
      return jsonResponse({ error: resultError.message }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
