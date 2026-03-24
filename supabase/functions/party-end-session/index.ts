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

function getUserClient(authHeader: string) {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });
}

async function requireUser(authHeader: string): Promise<{ id: string; email?: string }> {
  if (!authHeader) throw new Error("Unauthorized");
  const { data, error } = await getUserClient(authHeader).auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return { id: data.user.id, email: data.user.email || undefined };
}

function normalizeRoomCode(code: string | null | undefined): string {
  return (code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    await requireUser(authHeader);

    const body = await req.json();
    const roomCode = normalizeRoomCode(body.roomCode);
    if (!roomCode) return jsonResponse({ error: "roomCode is required" }, 400);

    const db = getServiceClient();
    const { data: sessionId, error } = await db.rpc("party_end_session", { in_room_code: roomCode });
    if (error) return jsonResponse({ error: error.message }, 400);

    return jsonResponse({ sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
