import type { Metadata } from "next";
import Link from "next/link";

import { formatBlogDate, getAllBlogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Writing from Apple Scholar about tutoring, pedagogy, student thinking, and how better learning environments are designed.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "Apple Scholar Blog",
    description:
      "Writing from Apple Scholar about tutoring, pedagogy, student thinking, and how better learning environments are designed.",
    type: "website",
    url: "/blog",
    images: [
      {
        url: "/logo.png",
        width: 1024,
        height: 1024,
        alt: "Apple Scholar logo",
      },
    ],
  },
};

const libraryThemes = [
  {
    title: "Tutoring as guidance",
    body: "Notes on tutoring models that build student judgment instead of dependence.",
  },
  {
    title: "Learning design",
    body: "Writing about project-based learning, flipped classrooms, and better study environments.",
  },
  {
    title: "Artifacts that last",
    body: "How live sessions should turn into diagrams, quizzes, and study materials students can reuse.",
  },
];

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  const featuredPost = posts[0];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ed_0%,#fbfbf8_45%,#ffffff_100%)] text-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-slate-200/80 bg-white/90 px-5 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
              AS
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">
                Apple Scholar
              </p>
              <p className="truncate text-xs text-slate-500">
                Essays on tutoring, learning, and student thinking
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Home
            </Link>
            <Link
              href="/?waitlist=1"
              className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Join the waitlist
            </Link>
          </div>
        </header>

        <section className="mt-8 overflow-hidden rounded-[2.5rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f8fafc_48%,#eef2ff_100%)] px-6 py-8 shadow-[0_30px_100px_rgba(15,23,42,0.08)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                Apple Scholar Journal
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-slate-950 sm:text-5xl lg:text-[3.6rem]">
                Writing about tutoring that helps students think for themselves
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                This is the public writing desk behind Apple Scholar: essays on live tutoring,
                project-based learning, flipped classrooms, and the kinds of study artifacts
                that make understanding last.
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                {featuredPost.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <article className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-[0_22px_70px_rgba(15,23,42,0.28)] sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                Featured essay
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                <time dateTime={featuredPost.publishedAt}>
                  {formatBlogDate(featuredPost.publishedAt)}
                </time>
                <span aria-hidden>•</span>
                <span>{featuredPost.readTimeMinutes} min read</span>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                {featuredPost.title}
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300">
                {featuredPost.excerpt}
              </p>
              <Link
                href={`/blog/${featuredPost.slug}`}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Read the essay
                <span aria-hidden>→</span>
              </Link>
            </article>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <article className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-10">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                New
              </span>
              <time dateTime={featuredPost.publishedAt}>
                {formatBlogDate(featuredPost.publishedAt)}
              </time>
              <span aria-hidden>•</span>
              <span>{featuredPost.readTimeMinutes} min read</span>
            </div>

            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              <Link
                href={`/blog/${featuredPost.slug}`}
                className="transition hover:text-slate-700"
              >
                {featuredPost.title}
              </Link>
            </h2>

            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              {featuredPost.description}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {featuredPost.intro.slice(0, 2).map((paragraph) => (
                <p
                  key={paragraph}
                  className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-5 text-base leading-7 text-slate-600"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2">
              {featuredPost.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-8">
              <Link
                href={`/blog/${featuredPost.slug}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 transition hover:text-slate-700"
              >
                Continue reading
                <span aria-hidden>→</span>
              </Link>
            </div>
          </article>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                What this library is for
              </p>
              <div className="mt-5 space-y-4">
                {libraryThemes.map((theme) => (
                  <div
                    key={theme.title}
                    className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <h3 className="text-sm font-semibold text-slate-950">
                      {theme.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {theme.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-800">
                Through-line
              </p>
              <blockquote className="mt-4 text-xl leading-8 text-slate-900">
                &ldquo;{featuredPost.closing}&rdquo;
              </blockquote>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
