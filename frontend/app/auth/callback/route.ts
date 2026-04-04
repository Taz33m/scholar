import { NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "@/lib/student-access/http";
import { callbackQuerySchema } from "@/lib/student-access/schemas";
import { provisionStudentAccess } from "@/lib/student-access/provisioning";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirectTo(request: Request, search: string) {
  const url = new URL("/login", request.url);

  if (search) {
    const parsed = new URLSearchParams(search);

    for (const [key, value] of parsed.entries()) {
      url.searchParams.set(key, value);
    }
  }

  const response = NextResponse.redirect(url, {
    headers: NO_STORE_HEADERS,
    status: 303,
  });

  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = callbackQuerySchema.safeParse({
    token_hash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
  });

  if (!result.success) {
    return redirectTo(request, "error=invalid-link");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const verificationResult = await supabase.auth.verifyOtp({
      token_hash: result.data.token_hash,
      type: result.data.type,
    });

    if (verificationResult.error || !verificationResult.data.user) {
      await supabase.auth.signOut();
      return redirectTo(request, "error=invalid-link");
    }

    const accessResult = await provisionStudentAccess(verificationResult.data.user);

    if (!accessResult.hasAccess) {
      await supabase.auth.signOut();
      return redirectTo(request, "error=no-access");
    }

    return redirectTo(request, "status=ready");
  } catch (error) {
    console.error("[student-access] callback failed", error);
    return redirectTo(request, "error=unavailable");
  }
}
