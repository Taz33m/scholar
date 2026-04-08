function getRequiredEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  throw new Error(`${names.join(" or ")} is not configured`);
}

export function getSupabaseUrl() {
  return getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
}

export function getSupabaseServerAuthKey() {
  return getRequiredEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  );
}

export function getPublicSupabaseUrl() {
  return getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getPublicSupabaseAnonKey() {
  return getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function hasSupabaseAuthConfig() {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.trim()) &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
        process.env.SUPABASE_ANON_KEY?.trim()),
  );
}
