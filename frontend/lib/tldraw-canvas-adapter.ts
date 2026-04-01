import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShapeId,
} from "@tldraw/tldraw";

import type { CanvasAdapter, CanvasFixture } from "@/lib/canvas-adapter";
import { executeCanvasPlan } from "@/lib/canvas-executor";
import { serializeCanvasScene } from "@/lib/canvas-scene";
import { captureCanvasScreenshot } from "@/lib/canvas-snapshot";

const DEFAULT_GEO_WIDTH = 220;
const DEFAULT_GEO_HEIGHT = 110;

const clearTldrawScene = (editor: Editor) => {
  const shapeIds = editor.getCurrentPageShapes().map((shape) => shape.id);
  if (shapeIds.length > 0) {
    editor.deleteShapes(shapeIds);
  }
};

const seedTldrawFixture = (editor: Editor, fixture: CanvasFixture) => {
  if (fixture.clearExisting !== false) {
    clearTldrawScene(editor);
  }

  editor.createShapes(
    fixture.shapes.map((shape) => {
      const id = shape.id
        ? (shape.id as unknown as TLShapeId)
        : createShapeId();
      const base = {
        id,
        parentId: editor.getCurrentPageId(),
        x: shape.x,
        y: shape.y,
      };

      if (shape.type === "text") {
        return {
          ...base,
          type: "text",
          props: {
            autoSize: false,
            color: shape.color ?? "black",
            font: "sans",
            richText: toRichText(shape.text),
            scale: 1,
            size: "m",
            textAlign: "start",
            w: shape.w ?? 180,
          },
        };
      }

      return {
        ...base,
        type: "geo",
        props: {
          align: "middle",
          color: shape.color ?? "blue",
          dash: "solid",
          fill: "none",
          font: "draw",
          geo: shape.shape ?? "rectangle",
          growY: 0,
          h: shape.h ?? DEFAULT_GEO_HEIGHT,
          labelColor: "black",
          richText: toRichText(shape.text),
          scale: 1,
          size: "m",
          url: "",
          verticalAlign: "middle",
          w: shape.w ?? DEFAULT_GEO_WIDTH,
        },
      };
    }),
  );
};

export const createTldrawCanvasAdapter = ({
  editor,
  persistenceKey,
}: {
  editor: Editor;
  persistenceKey?: string;
}): CanvasAdapter => ({
  isReady: () => true,
  serializeScene: () => serializeCanvasScene(editor),
  captureImage: () => captureCanvasScreenshot(editor),
  applyPlan: (plan) => executeCanvasPlan(editor, plan),
  clearScene: async () => {
    clearTldrawScene(editor);
  },
  seedFixture: async (fixture) => {
    seedTldrawFixture(editor, fixture);
  },
  loadPersistedScene: async () => {},
  removePersistedScene: () => {
    if (typeof window !== "undefined" && persistenceKey) {
      window.localStorage.removeItem(persistenceKey);
    }
  },
  refresh: () => {},
});
