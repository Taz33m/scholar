"use client";

import { useEffect, useRef } from "react";

import { hasSupabaseAuthConfig } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function parseHashParams(hash: string) {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    type: params.get("type"),
  };
}

export function LoginHashResolver() {
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    if (hasAttemptedRef.current) {
      return;
    }

    hasAttemptedRef.current = true;

    async function resolveHashSession() {
      if (!hasSupabaseAuthConfig()) {
        return;
      }

      const { accessToken, refreshToken, type } = parseHashParams(window.location.hash);

      if (!accessToken || !refreshToken || type !== "magiclink") {
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const sessionResult = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionResult.error) {
          throw sessionResult.error;
        }

        window.location.replace("/auth/callback");
      } catch (error) {
        console.error("[student-access] failed to resolve magic link hash", error);
        window.location.replace("/login?error=unavailable");
      }
    }

    void resolveHashSession();
  }, []);

  return null;
}
