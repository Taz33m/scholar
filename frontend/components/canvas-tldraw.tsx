'use client';

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import "@tldraw/tldraw/tldraw.css";
import type { Editor } from "@tldraw/tldraw";

import { canvasRef } from "@/lib/canvas-adapter";
import { createTldrawCanvasAdapter } from "@/lib/tldraw-canvas-adapter";

const Tldraw = dynamic(
  () => import("@tldraw/tldraw").then((mod) => mod.Tldraw),
  {
    ssr: false,
  },
);

interface CanvasTldrawProps {
  persistenceKey?: string;
  isActive?: boolean;
}

export function CanvasTldraw({
  persistenceKey,
}: CanvasTldrawProps) {
  const [editor, setEditor] = useState<Editor | null>(null);

  const adapter = useMemo(
    () =>
      editor
        ? createTldrawCanvasAdapter({
            editor,
            persistenceKey,
          })
        : null,
    [editor, persistenceKey],
  );

  useEffect(() => {
    canvasRef.current = adapter;
    return () => {
      if (canvasRef.current === adapter) {
        canvasRef.current = null;
      }
    };
  }, [adapter]);

  return (
    <div className="h-full w-full">
      <Tldraw
        persistenceKey={persistenceKey}
        onMount={(editorInstance) => setEditor(editorInstance)}
      />
    </div>
  );
}

