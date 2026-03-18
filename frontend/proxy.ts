import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === "production";

  if (pathname.startsWith("/sessions")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("waitlist", "1");
    return NextResponse.redirect(redirectUrl);
  }

  if (
    isProduction &&
    pathname.startsWith("/api/") &&
    pathname !== "/api/waitlist"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sessions/:path*", "/api/:path*"],
};
