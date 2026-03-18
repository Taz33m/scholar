import LandingPage from "@/components/landing-page";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const waitlistRedirected = resolvedSearchParams.waitlist === "1";

  return <LandingPage waitlistRedirected={waitlistRedirected} />;
}
