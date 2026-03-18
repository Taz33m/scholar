'use client';

import dynamic from "next/dynamic";

const LandingExcalidrawDemoClient = dynamic(
  () =>
    import("@/components/landing-excalidraw-demo-client").then(
      (mod) => mod.LandingExcalidrawDemoClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="text-center">
          <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-brand-gray-medium/20 border-t-brand-gray-dark" />
          <p className="text-lg text-brand-gray-medium">Loading board...</p>
        </div>
      </div>
    ),
  },
);

export function LandingExcalidrawDemo({
  activeSceneIndex,
}: {
  activeSceneIndex: number;
}) {
  return <LandingExcalidrawDemoClient activeSceneIndex={activeSceneIndex} />;
}
