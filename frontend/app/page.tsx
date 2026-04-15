import type { Metadata } from "next";

import LandingPage from "@/components/landing-page";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Scholar",
  description:
    "Apple Scholar combines live tutoring, whiteboarding, and study materials in one workspace so students can learn difficult subjects with more confidence.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Scholar",
    description:
      "Apple Scholar combines live tutoring, whiteboarding, and study materials in one workspace so students can learn difficult subjects with more confidence.",
    type: "website",
    url: "/",
    siteName: SITE_NAME,
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
    title: "Scholar",
    description:
      "Apple Scholar combines live tutoring, whiteboarding, and study materials in one workspace so students can learn difficult subjects with more confidence.",
    images: ["/logo.png"],
  },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const waitlistRedirected = resolvedSearchParams.waitlist === "1";

  return (
    <>
      <LandingPage waitlistRedirected={waitlistRedirected} />
    </>
  );
}
