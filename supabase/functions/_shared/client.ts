import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEnv } from "./cors.ts";

export function getServiceClient(): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
}

export function getUserClient(authHeader: string): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
    global: {
      headers: {
        Authorization: authHeader
      }
    },
    auth: { persistSession: false }
  });
}

export async function requireUser(authHeader: string): Promise<{ id: string; email?: string }> {
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const userClient = getUserClient(authHeader);
  const { data, error } = await userClient.auth.getUser();

  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  return { id: data.user.id, email: data.user.email || undefined };
}
