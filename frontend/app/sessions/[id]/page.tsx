import type { Metadata } from "next";

import SessionWorkspace from "@/components/session-workspace";

interface SessionPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ title?: string | string[] }>;
}

export const metadata: Metadata = {
  title: "Session",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const titleValue = resolvedSearchParams?.title;
  const seedTitle = typeof titleValue === "string" ? titleValue : null;

  return <SessionWorkspace key={`${id}:${seedTitle ?? ""}`} sessionId={id} seedTitle={seedTitle} />;
}
