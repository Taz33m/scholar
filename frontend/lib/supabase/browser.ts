import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseAnonKey, getPublicSupabaseUrl } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient(
    getPublicSupabaseUrl(),
    getPublicSupabaseAnonKey(),
  );

  return browserClient;
}
