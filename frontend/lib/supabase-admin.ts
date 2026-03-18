import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminClient: SupabaseClient | null = null;

function getSupabaseServerKey() {
  const value =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!value) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is not configured",
    );
  }

  return value;
}

function getRequiredEnv(name: "SUPABASE_URL") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export function hasSupabaseAdminConfig() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.SUPABASE_SECRET_KEY?.trim()),
  );
}

export function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  supabaseAdminClient = createClient(
    getRequiredEnv("SUPABASE_URL"),
    getSupabaseServerKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return supabaseAdminClient;
}
