import { LoginHashResolver } from "./login-hash-resolver";

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
              Access happens through a secure magic link. Manual email entry is disabled on this page.
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
        </section>
      </div>
    </main>
  );
}
