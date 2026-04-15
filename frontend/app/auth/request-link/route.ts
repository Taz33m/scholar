import { NextResponse } from "next/server";

import { getDemoStudentUser } from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { NO_STORE_HEADERS } from "@/lib/student-access/http";
import { requestLinkPayloadSchema } from "@/lib/student-access/schemas";
import { canRequestStudentAccess } from "@/lib/student-access/provisioning";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

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

  if (isStudentAccessDemoModeEnabled()) {
    const demoStudentEmail = getDemoStudentUser().email.trim().toLowerCase();

    if (result.data.email === demoStudentEmail) {
      if (parsed.mode === "form") {
        return NextResponse.redirect(new URL("/student", request.url), {
          headers: NO_STORE_HEADERS,
          status: 303,
        });
      }

      return NextResponse.json(
        { demo: true, ok: true, redirectTo: "/student" },
        { headers: NO_STORE_HEADERS },
      );
    }

    if (parsed.mode === "form") {
      return NextResponse.redirect(new URL(buildErrorRedirect("no-access"), request.url), {
        headers: NO_STORE_HEADERS,
        status: 303,
      });
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const shouldSendMagicLink = await canRequestStudentAccess(supabase, result.data.email);

    if (shouldSendMagicLink) {
      const requestUrl = new URL(request.url);
      const shouldUseLocalhostDirectLink =
        parsed.mode === "form" &&
        process.env.NODE_ENV !== "production" &&
        isLocalhostHost(requestUrl.hostname);
      const redirectUrl = new URL(
        shouldUseLocalhostDirectLink ? "/login" : "/auth/callback",
        request.url,
      );

      if (shouldUseLocalhostDirectLink) {
        const generatedLinkResult = await supabase.auth.admin.generateLink({
          email: result.data.email,
          options: {
            redirectTo: redirectUrl.toString(),
          },
          type: "magiclink",
        });

        if (generatedLinkResult.error || !generatedLinkResult.data.properties?.action_link) {
          throw generatedLinkResult.error ?? new Error("Unable to generate localhost magic link.");
        }

        return NextResponse.redirect(generatedLinkResult.data.properties.action_link, {
          headers: NO_STORE_HEADERS,
          status: 303,
        });
      }

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
