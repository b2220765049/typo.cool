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

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const db = getServiceClient();
    const now = new Date().toISOString();

    const { error: markError } = await db
      .from("party_rooms")
      .update({ status: "archived" })
      .lt("expires_at", now)
      .in("status", ["open", "locked", "testing", "completed"]);

    if (markError) return jsonResponse({ error: markError.message }, 500);

    const retentionThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: purgeError } = await db
      .from("party_rooms")
      .delete()
      .eq("status", "archived")
      .lt("expires_at", retentionThreshold);

    if (purgeError) return jsonResponse({ error: purgeError.message }, 500);

    return jsonResponse({ ok: true, processedAt: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
