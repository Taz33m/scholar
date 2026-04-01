'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type {
  ExcalidrawInitialDataState,
  LibraryItem,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { canvasRef } from "@/lib/canvas-adapter";
import {
  BUNDLED_EXCALIDRAW_LIBRARIES,
  loadBundledExcalidrawLibraryBlobs,
} from "@/lib/excalidraw-default-libraries";
import {
  type CanvasExcalidrawApi,
  createExcalidrawCanvasAdapter,
  persistExcalidrawScene,
  readPersistedExcalidrawScene,
  type ExcalidrawElementLike,
  type ExcalidrawSceneState,
} from "@/lib/excalidraw-canvas-adapter";

const EXCALIDRAW_UI_OPTIONS = {
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
    image: true,
  },
  welcomeScreen: false,
} as const;

interface CanvasExcalidrawProps {
  persistenceKey?: string;
  isActive?: boolean;
}

interface ExcalidrawLibraryDebugState {
  count: number;
  names: string[];
}

function LibraryMenuIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.75 6.75A1.75 1.75 0 0 1 6.5 5h10A1.5 1.5 0 0 1 18 6.5v11A1.5 1.5 0 0 1 16.5 19h-10A1.75 1.75 0 0 1 4.75 17.25Z" />
      <path d="M7.5 8.5h7" />
      <path d="M7.5 12h7" />
      <path d="M7.5 15.5H12" />
      <path d="M18 7.25h1.25A1.75 1.75 0 0 1 21 9v7.5A1.5 1.5 0 0 1 19.5 18H18" />
    </svg>
  );
}

export function CanvasExcalidraw({
  persistenceKey,
  isActive = false,
}: CanvasExcalidrawProps) {
  const safePersistenceKey = persistenceKey
    ? persistenceKey.replace("geminilearn-canvas", "geminilearn-excalidraw")
    : "geminilearn-excalidraw";

  const initialScene = useMemo<ExcalidrawSceneState>(() => {
    const persisted = readPersistedExcalidrawScene(safePersistenceKey);
    if (!persisted) {
      return {
        appState: {
          viewBackgroundColor: "#ffffff",
        },
        elements: [],
        files: {},
      };
    }

    return {
      appState: {
        viewBackgroundColor: "#ffffff",
        ...persisted.appState,
      },
      elements: persisted.elements,
      files: persisted.files,
    };
  }, [safePersistenceKey]);

  const initialData = useMemo(
    () => (): ExcalidrawInitialDataState => ({
      ...initialScene,
      appState: {
        viewBackgroundColor: "#ffffff",
        ...initialScene.appState,
      },
    }),
    [initialScene],
  );

  const apiRef = useRef<CanvasExcalidrawApi | null>(null);
  const sceneRef = useRef<ExcalidrawSceneState>(initialScene);
  const hydratedLibraryApisRef = useRef<Set<string>>(new Set());
  const [libraryDebugState, setLibraryDebugState] =
    useState<ExcalidrawLibraryDebugState>({
      count: 0,
      names: [],
    });

  const adapter = useMemo(
    () =>
      createExcalidrawCanvasAdapter({
        apiRef,
        persistenceKey: safePersistenceKey,
        sceneRef,
      }),
    [safePersistenceKey],
  );

  const openLibrarySidebar = useCallback(() => {
    apiRef.current?.toggleSidebar?.({
      name: "default",
      tab: "library",
      force: true,
    });
  }, []);

  useEffect(() => {
    sceneRef.current = initialScene;
  }, [initialScene]);

  useEffect(() => {
    canvasRef.current = adapter;
    return () => {
      if (canvasRef.current === adapter) {
        canvasRef.current = null;
      }
    };
  }, [adapter]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    adapter.refresh();
  }, [adapter, isActive]);

  useEffect(() => {
    let isCancelled = false;
    let frameId = 0;

    const populateLibraries = async () => {
      if (isCancelled) {
        return;
      }

      const nextApi = apiRef.current;
      const hydrationKey = nextApi?.id || safePersistenceKey;
      if (!nextApi?.updateLibrary) {
        frameId = window.requestAnimationFrame(() => {
          void populateLibraries();
        });
        return;
      }

      if (hydratedLibraryApisRef.current.has(hydrationKey)) {
        return;
      }

      hydratedLibraryApisRef.current.add(hydrationKey);

      try {
        const librarySources = await loadBundledExcalidrawLibraryBlobs();
        if (isCancelled || librarySources.length === 0) {
          hydratedLibraryApisRef.current.delete(hydrationKey);
          return;
        }

        setLibraryDebugState({
          count: 0,
          names: librarySources
            .map((entry) => entry.definition.name)
            .slice(0, BUNDLED_EXCALIDRAW_LIBRARIES.length),
        });

        for (const entry of librarySources) {
          if (isCancelled) {
            return;
          }

          await nextApi.updateLibrary({
            libraryItems: entry.blob,
            merge: true,
            defaultStatus: "published",
          });
        }
      } catch (error) {
        hydratedLibraryApisRef.current.delete(hydrationKey);
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to populate Excalidraw libraries.", error);
        }
      }
    };

    void populateLibraries();

    return () => {
      isCancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [safePersistenceKey]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
      return;
    }

    const debugHandle = {
      getLibraryState: () => libraryDebugState,
      openLibrarySidebar: () =>
        apiRef.current?.toggleSidebar?.({
          name: "default",
          tab: "library",
          force: true,
        }) ?? false,
      getAppState: () => apiRef.current?.getAppState?.() ?? null,
    };

    const debugWindow = window as Window & {
      __geminilearnExcalidraw?: typeof debugHandle;
    };
    debugWindow.__geminilearnExcalidraw = debugHandle;

    return () => {
      if (debugWindow.__geminilearnExcalidraw === debugHandle) {
        delete debugWindow.__geminilearnExcalidraw;
      }
    };
  }, [libraryDebugState]);

  return (
    <div
      className="scholar-excalidraw scholar-excalidraw--workspace h-full w-full"
      data-library-count={libraryDebugState.count}
      data-library-ready={libraryDebugState.count > 0 ? "true" : "false"}
    >
      <Excalidraw
        key={safePersistenceKey}
        autoFocus={false}
        detectScroll={false}
        initialData={initialData}
        excalidrawAPI={(api) => {
          const nextApi = api as CanvasExcalidrawApi;
          apiRef.current = nextApi;
        }}
        handleKeyboardGlobally={false}
        onChange={(elements, appState, files) => {
          sceneRef.current = {
            appState: appState as Record<string, unknown>,
            elements: elements as unknown as ExcalidrawElementLike[],
            files: files as Record<string, unknown>,
          };
          persistExcalidrawScene({
            persistenceKey: safePersistenceKey,
            scene: sceneRef.current,
          });
        }}
        onLibraryChange={(libraryItems) => {
          setLibraryDebugState({
            count: libraryItems.length,
            names: libraryItems
              .map((item: LibraryItem) => item.name ?? item.id)
              .filter((value): value is string => Boolean(value))
              .slice(0, 24),
          });
        }}
        theme="light"
        UIOptions={EXCALIDRAW_UI_OPTIONS}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.Item
            icon={<LibraryMenuIcon />}
            aria-label="Library"
            onSelect={openLibrarySidebar}
          >
            Library
          </MainMenu.Item>
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
