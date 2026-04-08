import { NextResponse } from "next/server";

import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
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
  try {
    const url = new URL(request.url);

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.redirect(new URL("/student", request.url), {
        headers: NO_STORE_HEADERS,
        status: 303,
      });
    }

    const supabase = await createSupabaseServerClient();
    const verificationInput = callbackQuerySchema.safeParse({
      token_hash: url.searchParams.get("token_hash"),
      type: url.searchParams.get("type"),
    });

    let user = null;

    if (verificationInput.success) {
      const verificationResult = await supabase.auth.verifyOtp({
        token_hash: verificationInput.data.token_hash,
        type: verificationInput.data.type,
      });

      if (verificationResult.error || !verificationResult.data.user) {
        await supabase.auth.signOut();
        return redirectTo(request, "error=invalid-link");
      }

      user = verificationResult.data.user;
    } else {
      const userResult = await supabase.auth.getUser();

      if (userResult.error || !userResult.data.user) {
        await supabase.auth.signOut();
        return redirectTo(request, "error=invalid-link");
      }

      user = userResult.data.user;
    }

    const accessResult = await provisionStudentAccess(user);

    if (!accessResult.hasAccess) {
      await supabase.auth.signOut();
      return redirectTo(request, "error=no-access");
    }

    return NextResponse.redirect(new URL("/student", request.url), {
      headers: NO_STORE_HEADERS,
      status: 303,
    });
  } catch (error) {
    console.error("[student-access] callback failed", error);

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.redirect(new URL("/student", request.url), {
        headers: NO_STORE_HEADERS,
        status: 303,
      });
    }

    return redirectTo(request, "error=unavailable");
  }
}
