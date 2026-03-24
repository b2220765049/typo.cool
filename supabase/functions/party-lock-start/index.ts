import { handleOptions, jsonResponse, normalizeRoomCode } from "../_shared/cors.ts";
import { getServiceClient, requireUser } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    await requireUser(authHeader);

    const body = await req.json();
    const roomCode = normalizeRoomCode(body.roomCode);
    if (!roomCode) {
      return jsonResponse({ error: "roomCode is required" }, 400);
    }

    const db = getServiceClient();
    const { data: sessionId, error } = await db.rpc("party_lock_and_start", { in_room_code: roomCode });
    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
