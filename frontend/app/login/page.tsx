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
      message: "Sign-in is temporarily unavailable. Please try again in a moment.",
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      title: "Sign-in unavailable",
    };
  }

  if (error === "invalid-email") {
    return {
      message: "Enter a valid email address to request your sign-in link.",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Invalid email",
    };
  }

  if (error === "invalid-link") {
    return {
      message: "That sign-in link is no longer valid. Request a new email to continue.",
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

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-500">
            Apple Scholar
          </p>
          <div className="space-y-2">
            <h1 className="font-display text-4xl text-slate-950">Student access</h1>
            <p className="max-w-lg text-base leading-7 text-slate-600">
              Sign in with your assigned student email to unlock Apple Scholar when the student
              home ships.
            </p>
          </div>
        </div>

        {content ? (
          <section className={`rounded-3xl border px-5 py-4 ${content.tone}`}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">{content.title}</h2>
            <p className="mt-2 text-sm leading-6">{content.message}</p>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <form action="/auth/request-link" method="post" className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Student email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Email me a sign-in link
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
