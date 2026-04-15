import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatBlogDate, getAllBlogPosts, getBlogPostBySlug } from "@/lib/blog";
import { getSiteUrl } from "@/lib/site";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return {
      title: "Blog",
    };
  }

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt,
      authors: [post.authorName],
      images: [
        {
          url: "/logo.png",
          width: 1024,
          height: 1024,
          alt: "Apple Scholar logo",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.description,
      images: ["/logo.png"],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: {
      "@type": "Organization",
      name: post.authorName,
    },
    publisher: {
      "@type": "Organization",
      name: "Apple Scholar",
      logo: {
        "@type": "ImageObject",
        url: getSiteUrl("/logo.png"),
      },
    },
    mainEntityOfPage: getSiteUrl(`/blog/${post.slug}`),
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ed_0%,#fbfbf8_42%,#ffffff_100%)] text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-slate-200/80 bg-white/90 px-5 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
          <Link href="/blog" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
              AS
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">
                Apple Scholar Journal
              </p>
              <p className="truncate text-xs text-slate-500">
                Back to the essay index
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

        <section className="mt-8 overflow-hidden rounded-[2.5rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f8fafc_44%,#eef2ff_100%)] px-6 py-8 shadow-[0_30px_100px_rgba(15,23,42,0.08)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)] lg:items-start">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                Apple Scholar Journal
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <time dateTime={post.publishedAt}>
                  {formatBlogDate(post.publishedAt)}
                </time>
                <span aria-hidden>•</span>
                <span>{post.readTimeMinutes} min read</span>
                <span aria-hidden>•</span>
                <span>{post.authorName}</span>
              </div>

              <h1 className="mt-5 font-[family-name:var(--font-display)] text-4xl leading-tight text-slate-950 sm:text-5xl lg:text-[3.8rem]">
                {post.title}
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
                {post.description}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <aside className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-[0_22px_70px_rgba(15,23,42,0.28)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                Core idea
              </p>
              <blockquote className="mt-4 text-2xl leading-9 text-white">
                &ldquo;{post.closing}&rdquo;
              </blockquote>
              <p className="mt-6 text-sm leading-6 text-slate-300">
                The best tutoring is not a performance of expertise. It is a design problem:
                how to create conditions in which a student can notice, question, test, and
                understand something for themselves.
              </p>
            </aside>
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <article className="rounded-[2rem] border border-slate-200 bg-white px-6 py-8 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:px-8 sm:py-10">
            <div className="space-y-6 border-b border-slate-200 pb-10">
              {post.intro.map((paragraph, index) => (
                <p
                  key={paragraph}
                  className={
                    index === 0
                      ? "text-xl leading-9 text-slate-800 sm:text-2xl"
                      : "text-[1.04rem] leading-8 text-slate-700"
                  }
                >
                  {paragraph}
                </p>
              ))}
            </div>

            <section className="mt-12">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                    In practice
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    What this looks like in tutoring
                  </h2>
                </div>
                <p className="max-w-xl text-sm leading-6 text-slate-500">
                  These are the moves that shift a session away from explanation as delivery
                  and toward explanation as guided thinking.
                </p>
              </div>

              <div className="mt-8 space-y-8">
                {post.principles.map((principle, index) => (
                  <section
                    key={principle.title}
                    className="grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                        {principle.title}
                      </h3>
                      <p className="mt-3 text-[1.02rem] leading-8 text-slate-600">
                        {principle.body}
                      </p>
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="mt-14 rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-6 sm:px-7">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-900">
                So what tutoring becomes
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {post.practiceTakeaways.map((takeaway) => (
                  <div
                    key={takeaway}
                    className="rounded-[1.35rem] border border-amber-200 bg-white/70 px-4 py-4 text-base leading-7 text-slate-700"
                  >
                    {takeaway}
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-14 rounded-[2rem] bg-slate-950 px-6 py-8 text-white sm:px-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                A concise way to say it
              </p>
              <blockquote className="mt-5 max-w-4xl text-2xl leading-10 text-white sm:text-[2rem]">
                &ldquo;{post.closing}&rdquo;
              </blockquote>
            </section>
          </article>

          <aside className="lg:pt-2">
            <div className="space-y-6 lg:sticky lg:top-28">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Article notes
                </p>
                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500">Published</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {formatBlogDate(post.publishedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Read time</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {post.readTimeMinutes} minutes
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Author</dt>
                    <dd className="mt-1 font-medium text-slate-900">{post.authorName}</dd>
                  </div>
                </dl>

                <div className="mt-6 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-800">
                  If this resonates
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-700">
                  Apple Scholar is building tutoring sessions that turn live explanation into
                  boards, study guides, and follow-through materials students can keep using.
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  <Link
                    href="/?waitlist=1"
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Join the waitlist
                  </Link>
                  <Link
                    href="/blog"
                    className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-slate-950"
                  >
                    Back to the blog
                  </Link>
                </div>
              </section>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
