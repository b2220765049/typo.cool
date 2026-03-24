// @ts-nocheck
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const db = getServiceClient();
    const now = new Date().toISOString();

    // Mark expired active rooms archived first.
    const { error: markError } = await db
      .from("party_rooms")
      .update({ status: "archived" })
      .lt("expires_at", now)
      .in("status", ["open", "locked", "testing", "completed"]);

    if (markError) {
      return jsonResponse({ error: markError.message }, 500);
    }

    // Hard delete archived rooms older than 7 days after expiry.
    const retentionThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: purgeError } = await db
      .from("party_rooms")
      .delete()
      .eq("status", "archived")
      .lt("expires_at", retentionThreshold);

    if (purgeError) {
      return jsonResponse({ error: purgeError.message }, 500);
    }

    return jsonResponse({ ok: true, processedAt: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
