import { NextResponse } from "next/server";

import { DEV_STUDENT_EMAIL_COOKIE, isLocalDevStudentAuthEnabled } from "@/lib/student-access/dev-auth";
import { NO_STORE_HEADERS } from "@/lib/student-access/http";
import { requestLinkPayloadSchema } from "@/lib/student-access/schemas";
import { canRequestStudentAccess } from "@/lib/student-access/provisioning";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function buildRedirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), {
    headers: NO_STORE_HEADERS,
    status: 303,
  });
}

export async function POST(request: Request) {
  if (!isLocalDevStudentAuthEnabled()) {
    return buildRedirect(request, "/login?error=unavailable");
  }

  const formData = await request.formData().catch(() => null);
  const result = requestLinkPayloadSchema.safeParse({
    email: formData?.get("email"),
  });

  if (!result.success) {
    return buildRedirect(request, "/login?error=invalid-email");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const hasAccess = await canRequestStudentAccess(supabase, result.data.email);

    if (!hasAccess) {
      return buildRedirect(request, "/login?error=no-access");
    }

    const response = buildRedirect(request, "/student");
    response.cookies.set(DEV_STUDENT_EMAIL_COOKIE, result.data.email, {
      httpOnly: true,
      maxAge: 60 * 60 * 8,
      path: "/",
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    console.error("[student-access] local dev sign-in failed", error);
    return buildRedirect(request, "/login?error=unavailable");
  }
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  response.cookies.set(DEV_STUDENT_EMAIL_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
