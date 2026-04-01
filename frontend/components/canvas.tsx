'use client';

import dynamic from "next/dynamic";

import { resolveCanvasEngine } from "@/lib/canvas-engine";

const CanvasTldraw = dynamic(
  () => import("@/components/canvas-tldraw").then((mod) => mod.CanvasTldraw),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gradient-to-br from-white via-white to-white">
        <div className="text-center">
          <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-brand-gray-medium/20 border-t-brand-gray-dark" />
          <p className="text-lg text-brand-gray-medium">Loading canvas...</p>
        </div>
      </div>
    ),
  },
);

const CanvasExcalidraw = dynamic(
  () =>
    import("@/components/canvas-excalidraw").then(
      (mod) => mod.CanvasExcalidraw,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gradient-to-br from-white via-white to-white">
        <div className="text-center">
          <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-brand-gray-medium/20 border-t-brand-gray-dark" />
          <p className="text-lg text-brand-gray-medium">Loading canvas...</p>
        </div>
      </div>
    ),
  },
);

interface CanvasProps {
  persistenceKey?: string;
  isActive?: boolean;
}

export default function Canvas({ persistenceKey, isActive = false }: CanvasProps) {
  const engine = resolveCanvasEngine();

  if (engine === "excalidraw") {
    return (
      <CanvasExcalidraw
        isActive={isActive}
        persistenceKey={persistenceKey}
      />
    );
  }

  return <CanvasTldraw isActive={isActive} persistenceKey={persistenceKey} />;
}
