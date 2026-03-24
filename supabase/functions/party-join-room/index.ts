// @ts-nocheck
import { handleOptions, jsonResponse, normalizeRoomCode, randomToken, sha256 } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const body = await req.json();
    const roomCode = normalizeRoomCode(body.roomCode);
    const roomName = String(body.roomName || "").trim();
    const nickname = String(body.nickname || "").trim();

    if (!nickname) {
      return jsonResponse({ error: "nickname is required" }, 400);
    }

    if (!roomCode && !roomName) {
      return jsonResponse({ error: "roomCode or roomName is required" }, 400);
    }

    const db = getServiceClient();

    let roomQuery = db
      .from("party_rooms")
      .select("id, room_code, room_name, status, host_user_id, max_participants")
      .order("created_at", { ascending: false })
      .limit(1);

    if (roomCode) {
      roomQuery = roomQuery.eq("room_code", roomCode);
    } else {
      roomQuery = roomQuery.ilike("room_name", roomName);
    }

    const { data: room, error: roomError } = await roomQuery.maybeSingle();

    if (roomError || !room) {
      return jsonResponse({ error: roomError?.message || "Room not found" }, 404);
    }

    if (room.status !== "open") {
      return jsonResponse({ error: "Room is locked" }, 409);
    }

    const { count } = await db
      .from("party_room_members")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .is("left_at", null);

    if ((count || 0) >= room.max_participants) {
      return jsonResponse({ error: "Room capacity full" }, 409);
    }

    const participantToken = randomToken();
    const participantTokenHash = await sha256(participantToken);

    const { error: joinError } = await db.rpc("party_join_room_guest", {
      in_room_code: room.room_code,
      in_room_name: room.room_name,
      in_nickname: nickname,
      in_participant_token_hash: participantTokenHash
    });

    if (joinError) {
      return jsonResponse({ error: joinError.message }, 500);
    }

    const { data: participants } = await db
      .from("party_room_members")
      .select("nickname, is_host")
      .eq("room_id", room.id)
      .is("left_at", null)
      .order("joined_at", { ascending: true });

    return jsonResponse({
      room,
      participants: participants || [],
      results: [],
      session: null,
      participantToken
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
