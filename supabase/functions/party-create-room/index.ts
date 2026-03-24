// @ts-nocheck
import { handleOptions, jsonResponse, normalizeRoomCode, randomToken, sha256 } from "../_shared/cors.ts";
import { getServiceClient, requireUser } from "../_shared/client.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const user = await requireUser(authHeader);
    const body = await req.json();

    const roomName = String(body.roomName || "").trim();
    const hostNickname = String(body.hostNickname || "").trim();
    const maxParticipants = Number(body.maxParticipants || 12);

    if (!roomName || !hostNickname) {
      return jsonResponse({ error: "roomName and hostNickname are required" }, 400);
    }

    const db = getServiceClient();

    let roomCode = "";
    for (let i = 0; i < 8; i += 1) {
      const candidate = normalizeRoomCode((Math.random().toString(36).slice(2, 8)).toUpperCase());
      const { data: exists } = await db
        .from("party_rooms")
        .select("id")
        .eq("room_code", candidate)
        .in("status", ["open", "locked", "testing"])
        .maybeSingle();

      if (!exists) {
        roomCode = candidate;
        break;
      }
    }

    if (!roomCode) {
      return jsonResponse({ error: "Failed to allocate room code" }, 500);
    }

    const { data: room, error: roomError } = await db
      .from("party_rooms")
      .insert({
        room_code: roomCode,
        room_name: roomName,
        host_user_id: user.id,
        status: "open",
        max_participants: Math.max(2, Math.min(200, maxParticipants))
      })
      .select("id, room_code, room_name, status, host_user_id")
      .single();

    if (roomError || !room) {
      return jsonResponse({ error: roomError?.message || "Room creation failed" }, 500);
    }

    const participantToken = randomToken();
    const participantTokenHash = await sha256(participantToken);

    const { error: memberError } = await db.from("party_room_members").insert({
      room_id: room.id,
      nickname: hostNickname,
      user_id: user.id,
      participant_token_hash: participantTokenHash,
      is_host: true
    });

    if (memberError) {
      return jsonResponse({ error: memberError.message }, 500);
    }

    return jsonResponse({
      room,
      participants: [{ nickname: hostNickname, is_host: true }],
      results: [],
      session: null,
      participantToken
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
