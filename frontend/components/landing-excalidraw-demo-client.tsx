'use client';

import { useEffect, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

const LANDING_EXCALIDRAW_UI = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveAsImage: false,
    saveToActiveFile: false,
    toggleTheme: false,
  },
  tools: {
    image: false,
  },
  welcomeScreen: false,
} as const;

const getLessonSceneSkeleton = (
  activeSceneIndex: number,
): ExcalidrawElementSkeleton[] => {
  if (activeSceneIndex < 2) {
    return [];
  }

  const baseShapes: ExcalidrawElementSkeleton[] = [
    {
      type: "rectangle",
      x: 280,
      y: 220,
      width: 180,
      height: 92,
      strokeColor: "#2563eb",
      backgroundColor: "transparent",
      strokeWidth: 2,
      roughness: 0,
      label: {
        text: "Node A",
        fontSize: 28,
      },
    },
    {
      type: "rectangle",
      x: 600,
      y: 220,
      width: 180,
      height: 92,
      strokeColor: "#2563eb",
      backgroundColor: "transparent",
      strokeWidth: 2,
      roughness: 0,
      label: {
        text: "Node B",
        fontSize: 28,
      },
    },
    {
      type: "text",
      text: "→",
      x: 508,
      y: 232,
      fontSize: 44,
      strokeColor: "#0f172a",
      backgroundColor: "transparent",
    },
    {
      type: "text",
      text: "next pointer",
      x: 470,
      y: 320,
      fontSize: 24,
      strokeColor: "#334155",
      backgroundColor: "transparent",
    },
  ];

  if (activeSceneIndex < 3) {
    return baseShapes;
  }

  return [
    ...baseShapes,
    {
      type: "ellipse",
      x: 452,
      y: 204,
      width: 170,
      height: 86,
      strokeColor: "#2563eb",
      backgroundColor: "transparent",
      strokeWidth: 2,
      roughness: 0,
    },
    {
      type: "text",
      text: "this is the link",
      x: 420,
      y: 152,
      fontSize: 22,
      strokeColor: "#0f172a",
      backgroundColor: "transparent",
    },
  ];
};

const getInitialData = (
  activeSceneIndex: number,
): ExcalidrawInitialDataState => ({
  elements: convertToExcalidrawElements(getLessonSceneSkeleton(activeSceneIndex)),
  appState: {
    viewBackgroundColor: "#ffffff",
  },
  files: {},
});

export function LandingExcalidrawDemoClient({
  activeSceneIndex,
}: {
  activeSceneIndex: number;
}) {
  const [excalidrawApi, setExcalidrawApi] =
    useState<ExcalidrawImperativeAPI | null>(null);

  const [initialData] = useState(() => getInitialData(activeSceneIndex));

  useEffect(() => {
    if (!excalidrawApi) {
      return;
    }

    const elements = convertToExcalidrawElements(
      getLessonSceneSkeleton(activeSceneIndex),
    );

    excalidrawApi.updateScene({
      elements,
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    if (elements.length > 0) {
      excalidrawApi.scrollToContent(elements, {
        fitToViewport: true,
        viewportZoomFactor: 0.72,
        animate: false,
        canvasOffsets: {
          top: 24,
          right: 24,
          bottom: 88,
          left: 24,
        },
      });
    }
  }, [activeSceneIndex, excalidrawApi]);

  return (
    <div className="scholar-excalidraw h-full w-full">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={setExcalidrawApi}
        detectScroll={false}
        handleKeyboardGlobally={false}
        autoFocus={false}
        theme="light"
        UIOptions={LANDING_EXCALIDRAW_UI}
      />
    </div>
  );
}
