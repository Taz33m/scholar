import { NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "@/lib/student-access/http";
import { requestLinkPayloadSchema } from "@/lib/student-access/schemas";
import { canRequestStudentAccess } from "@/lib/student-access/provisioning";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return {
      mode: "json" as const,
      payload: await request.json(),
    };
  }

  const formData = await request.formData();

  return {
    mode: "form" as const,
    payload: {
      email: formData.get("email"),
    },
  };
}

function buildLoginRedirect(status: string) {
  const url = new URL("/login", "http://localhost");
  url.searchParams.set("status", status);
  return url.pathname + url.search;
}

function buildErrorRedirect(error: string) {
  const url = new URL("/login", "http://localhost");
  url.searchParams.set("error", error);
  return url.pathname + url.search;
}

export async function POST(request: Request) {
  const parsed = await parsePayload(request).catch(() => null);

  if (!parsed) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = requestLinkPayloadSchema.safeParse(parsed.payload);

  if (!result.success) {
    if (parsed.mode === "form") {
      return NextResponse.redirect(new URL(buildErrorRedirect("invalid-email"), request.url), {
        headers: NO_STORE_HEADERS,
        status: 303,
      });
    }

    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const shouldSendMagicLink = await canRequestStudentAccess(supabase, result.data.email);

    if (shouldSendMagicLink) {
      const redirectUrl = new URL("/auth/callback", request.url);
      const signInResult = await supabase.auth.signInWithOtp({
        email: result.data.email,
        options: {
          emailRedirectTo: redirectUrl.toString(),
        },
      });

      if (signInResult.error) {
        throw signInResult.error;
      }
    }
  } catch (error) {
    console.error("[student-access] magic link request failed", error);

    if (parsed.mode === "form") {
      return NextResponse.redirect(new URL(buildErrorRedirect("unavailable"), request.url), {
        headers: NO_STORE_HEADERS,
        status: 303,
      });
    }

    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  if (parsed.mode === "form") {
    return NextResponse.redirect(new URL(buildLoginRedirect("check-email"), request.url), {
      headers: NO_STORE_HEADERS,
      status: 303,
    });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
