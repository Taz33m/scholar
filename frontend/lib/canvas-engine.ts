export type CanvasEngine = "tldraw" | "excalidraw";

export const DEFAULT_CANVAS_ENGINE: CanvasEngine = "excalidraw";

export const resolveCanvasEngine = (): CanvasEngine => {
  return process.env.NEXT_PUBLIC_CANVAS_ENGINE === "excalidraw"
    ? "excalidraw"
    : DEFAULT_CANVAS_ENGINE;
};
