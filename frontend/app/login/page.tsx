import type { Metadata } from "next";

import { hasSupabaseServerAuthConfig } from "@/lib/supabase/config";

import { LoginHashResolver } from "./login-hash-resolver";

export const metadata: Metadata = {
  title: "Student Access",
  robots: {
    index: false,
    follow: false,
  },
};

function getStatusContent(status: string | undefined, error: string | undefined) {
  if (error === "no-access") {
    return {
      message:
        "We couldn't confirm student access for this email yet. Use an assigned course email or ask your professor to add you.",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Access not available",
    };
  }

  if (error === "unavailable") {
    return {
      message: "Magic-link sign-in is temporarily unavailable. Please try a fresh link in a moment.",
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      title: "Sign-in unavailable",
    };
  }

  if (error === "invalid-email") {
    return {
      message: "Student access is magic-link only. Use the secure link that was sent to you.",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Magic-link only",
    };
  }

  if (error === "invalid-link") {
    return {
      message: "That sign-in link is no longer valid. Open a fresh magic link to continue.",
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      title: "Link expired",
    };
  }

  if (status === "ready") {
    return {
      message: "Access confirmed. Student home is coming soon.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      title: "You’re signed in",
    };
  }

  if (status === "check-email") {
    return {
      message: "Check your email for a secure sign-in link.",
      tone: "border-sky-200 bg-sky-50 text-sky-900",
      title: "Check your email",
    };
  }

  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const showLocalMagicLinkForm =
    process.env.NODE_ENV !== "production" && hasSupabaseServerAuthConfig();
  const resolvedSearchParams = await searchParams;
  const status =
    typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : undefined;
  const error =
    typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : undefined;
  const content = getStatusContent(status, error);
  const defaultTone = "border-slate-200 bg-white text-slate-900";
  const panel = content ?? {
    message:
      "Use the secure magic link sent to your assigned email. This page no longer supports manual sign-in.",
    tone: defaultTone,
    title: "Magic-link access",
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#fff8ef_100%)] px-6 py-16 text-slate-900">
      <LoginHashResolver />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-500">
            Apple Scholar
          </p>
          <div className="space-y-2">
            <h1 className="font-display text-4xl text-slate-950">Student access</h1>
            <p className="max-w-lg text-base leading-7 text-slate-600">
              {showLocalMagicLinkForm
                ? "Access happens through a secure magic link. On localhost, use the form below to request a fresh link from this browser."
                : "Access happens through a secure magic link. Manual email entry is disabled on this page."}
            </p>
          </div>
        </div>

        <section className={`rounded-[2rem] border p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ${panel.tone}`}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">{panel.title}</h2>
          <p className="mt-3 text-sm leading-6">{panel.message}</p>
          <div className="mt-6 rounded-[1.5rem] border border-slate-200/80 bg-slate-50/80 px-5 py-4 text-sm leading-6 text-slate-600">
            Need a fresh link?
            <br />
            Ask your professor or the Apple Scholar team to send a new magic link for your assigned student email.
          </div>

          {showLocalMagicLinkForm ? (
            <form
              action="/auth/request-link"
              method="post"
              className="mt-6 rounded-[1.5rem] border border-sky-200 bg-sky-50/80 p-5 text-sm text-slate-700"
            >
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-900">
                  Localhost Magic Link
                </h3>
                <p className="leading-6 text-slate-600">
                  Request the link from this browser, then open the newest email in this same
                  browser. Terminal-triggered links will fail because the verifier cookie stays in
                  the terminal session instead of the browser.
                </p>
                <p className="leading-6 text-slate-600">
                  If Supabase localhost auth is being stubborn, use the dev-only button below to
                  enter the seeded student workspace directly.
                </p>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Student Email
                </span>
                <input
                  type="email"
                  name="email"
                  required
                  defaultValue="tazeemmahashin@gmail.com"
                  className="w-full rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                />
              </label>

              <button
                type="submit"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Send Fresh Link
              </button>

              <button
                type="submit"
                formAction="/auth/dev-local"
                formMethod="post"
                className="mt-3 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Open Local Student Workspace
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}
