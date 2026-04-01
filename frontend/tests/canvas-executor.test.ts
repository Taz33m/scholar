import { beforeEach, describe, expect, it, vi } from "vitest";

const { exportToBlobMock } = vi.hoisted(() => ({
  exportToBlobMock: vi.fn(),
}));

vi.mock("@excalidraw/excalidraw", () => {
  const createTextWidth = (text: string) =>
    Math.max(80, Math.min(320, text.length * 8));

  const convertToExcalidrawElements = (skeletons: Array<Record<string, unknown>>) =>
    skeletons.map((skeleton, index) => {
      const type = String(skeleton.type ?? "rectangle");
      const id = String(skeleton.id ?? `${type}:${index + 1}`);

      if (type === "text") {
        const text = String(skeleton.text ?? "");
        return {
          id,
          type,
          x: Number(skeleton.x ?? 0),
          y: Number(skeleton.y ?? 0),
          width: createTextWidth(text),
          height: Number(skeleton.fontSize ?? 20) + 12,
          text,
          strokeColor: String(skeleton.strokeColor ?? "#0f172a"),
          backgroundColor: String(skeleton.backgroundColor ?? "transparent"),
          containerId:
            typeof skeleton.containerId === "string" ? skeleton.containerId : null,
          customData:
            skeleton.customData && typeof skeleton.customData === "object"
              ? { ...(skeleton.customData as Record<string, unknown>) }
              : undefined,
        };
      }

      if (type === "arrow") {
        const points = Array.isArray(skeleton.points)
          ? skeleton.points.map((point) =>
              Array.isArray(point)
                ? [Number(point[0] ?? 0), Number(point[1] ?? 0)]
                : [0, 0],
            )
          : [
              [0, 0],
              [80, 40],
            ];

        const xs = points.map((point) => point[0]);
        const ys = points.map((point) => point[1]);

        return {
          id,
          type,
          x: Number(skeleton.x ?? 0),
          y: Number(skeleton.y ?? 0),
          width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
          height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
          points,
          strokeColor: String(skeleton.strokeColor ?? "#0f172a"),
          backgroundColor: String(skeleton.backgroundColor ?? "transparent"),
          strokeStyle: String(skeleton.strokeStyle ?? "solid"),
          customData:
            skeleton.customData && typeof skeleton.customData === "object"
              ? { ...(skeleton.customData as Record<string, unknown>) }
              : undefined,
        };
      }

      return {
        id,
        type,
        x: Number(skeleton.x ?? 0),
        y: Number(skeleton.y ?? 0),
        width: Number(skeleton.width ?? 180),
        height: Number(skeleton.height ?? 96),
        strokeColor: String(skeleton.strokeColor ?? "#0f172a"),
        backgroundColor: String(skeleton.backgroundColor ?? "transparent"),
        fillStyle: String(skeleton.fillStyle ?? "solid"),
        strokeStyle: String(skeleton.strokeStyle ?? "solid"),
        opacity: Number(skeleton.opacity ?? 100),
        customData:
          skeleton.customData && typeof skeleton.customData === "object"
            ? { ...(skeleton.customData as Record<string, unknown>) }
            : undefined,
        boundElements: Array.isArray(skeleton.boundElements)
          ? skeleton.boundElements.map((entry) => ({ ...(entry as Record<string, unknown>) }))
          : undefined,
      };
    });

  return {
    CaptureUpdateAction: {
      NEVER: "never",
      IMMEDIATELY: "immediately",
    },
    convertToExcalidrawElements,
    exportToBlob: exportToBlobMock,
  };
});

import {
  applyCanvasPlanToExcalidrawScene,
  buildExcalidrawElementsFromFixture,
  captureExcalidrawSceneImage,
  compileCanvasPlanForExcalidraw,
  serializeExcalidrawScene,
} from "@/lib/excalidraw-canvas-adapter";

describe("Excalidraw canvas scene helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    exportToBlobMock.mockResolvedValue(
      new Blob(["png"], { type: "image/png" }),
    );

    class FakeFileReader {
      result: string | null = null;
      onerror: (() => void) | null = null;
      onloadend: (() => void) | null = null;

      readAsDataURL(blob: Blob) {
        this.result = `data:${blob.type};base64,cG5n`;
        this.onloadend?.();
      }
    }

    vi.stubGlobal("FileReader", FakeFileReader as unknown as typeof FileReader);
  });

  it("serializes seeded fixture elements to the canonical logical scene shape", () => {
    const elements = buildExcalidrawElementsFromFixture({
      shapes: [
        {
          id: "shape:main",
          type: "geo",
          text: "Main idea",
          x: 120,
          y: 140,
          w: 180,
          h: 100,
          color: "blue",
        },
        {
          id: "shape:label",
          type: "text",
          text: "Important note",
          x: 380,
          y: 180,
          color: "black",
        },
      ],
    });

    const scene = serializeExcalidrawScene(elements);

    expect(scene.shapes).toEqual([
      expect.objectContaining({
        id: "shape:main",
        type: "geo",
        text: "Main idea",
        style: expect.objectContaining({
          color: "light-blue",
        }),
      }),
      expect.objectContaining({
        id: "shape:label",
        type: "text",
        text: "Important note",
      }),
    ]);
  });

  it("applies whiteboard annotation, emphasis, creation, and connectors as a pure scene transform", () => {
    const initialElements = buildExcalidrawElementsFromFixture({
      shapes: [
        {
          id: "shape:main",
          type: "geo",
          text: "Main idea",
          x: 120,
          y: 140,
          w: 180,
          h: 100,
          color: "blue",
        },
      ],
    });

    const { elements, result } = applyCanvasPlanToExcalidrawScene({
      elements: initialElements,
      plan: {
        summary: "Highlighted the main idea and added the next step.",
        operations: [
          {
            type: "emphasize",
            targetShapeRef: "shape:main",
            style: "circle",
          },
          {
            type: "annotate",
            targetShapeRef: "shape:main",
            text: "Key concept",
            placement: "above",
          },
          {
            type: "create_node",
            tempId: "next-step",
            text: "Next step",
            shape: "rectangle",
            x: 420,
            y: 160,
          },
          {
            type: "connect",
            fromShapeRef: "shape:main",
            toShapeRef: "next-step",
            label: "then",
          },
        ],
      },
    });

    const scene = serializeExcalidrawScene(elements);

    expect(result.operationCount).toBe(4);
    expect(result.appliedOperationCount).toBe(4);
    expect(result.changedShapeIds).toHaveLength(6);
    expect(result.skippedOperations).toHaveLength(0);
    expect(scene.shapes).toHaveLength(5);
    expect(
      scene.shapes.some(
        (shape) => shape.type === "text" && shape.text === "Key concept",
      ),
    ).toBe(true);
    expect(
      scene.shapes.some(
        (shape) => shape.type === "geo" && shape.text === "Next step",
      ),
    ).toBe(true);
    expect(
      scene.shapes.some(
        (shape) => shape.type === "arrow" && shape.text === "then",
      ),
    ).toBe(true);
  });

  it("supports precise region highlights within large shapes", () => {
    const { elements, result } = applyCanvasPlanToExcalidrawScene({
      elements: [
        {
          id: "shape:image",
          type: "image",
          x: 40,
          y: 60,
          width: 400,
          height: 300,
          strokeColor: "#0f172a",
          backgroundColor: "transparent",
        },
      ],
      plan: {
        summary: "Highlighted a specific region in the image.",
        operations: [
          {
            type: "emphasize",
            targetShapeRef: "shape:image",
            style: "highlight",
            region: {
              x: 0.25,
              y: 0.2,
              w: 0.2,
              h: 0.15,
            },
          },
        ],
      },
    });

    const scene = serializeExcalidrawScene(elements);
    const highlight = scene.shapes.find(
      (shape) => shape.id === result.changedShapeIds[0],
    );

    expect(highlight).toBeDefined();
    expect(highlight?.bounds?.w).toBeLessThan(200);
    expect(highlight?.bounds?.h).toBeLessThan(80);
    expect(highlight?.bounds?.x).toBeGreaterThan(120);
    expect(highlight?.bounds?.y).toBeGreaterThan(100);
    expect(highlight?.style?.color).toBe("yellow");
  });

  it("supports text replacement, moves, and deletes", () => {
    const { elements } = applyCanvasPlanToExcalidrawScene({
      elements: buildExcalidrawElementsFromFixture({
        shapes: [
          {
            id: "shape:label",
            type: "text",
            text: "Old label",
            x: 100,
            y: 80,
            w: 160,
          },
          {
            id: "shape:wrong",
            type: "geo",
            text: "Wrong branch",
            x: 240,
            y: 180,
            w: 140,
            h: 90,
          },
        ],
      }),
      plan: {
        summary: "Cleaned up the board.",
        operations: [
          {
            type: "replace_text",
            targetShapeRef: "shape:label",
            text: "Correct label",
          },
          {
            type: "move",
            targetShapeRef: "shape:label",
            x: 360,
            y: 120,
          },
          {
            type: "delete",
            targetShapeRef: "shape:wrong",
          },
        ],
      },
    });

    const scene = serializeExcalidrawScene(elements);

    expect(scene.shapes).toHaveLength(1);
    expect(scene.shapes[0]).toMatchObject({
      id: "shape:label",
      type: "text",
      text: "Correct label",
      bounds: {
        x: 360,
        y: 120,
      },
    });
  });

  it("supports replacing bound container text", () => {
    const { elements, result } = applyCanvasPlanToExcalidrawScene({
      elements: buildExcalidrawElementsFromFixture({
        shapes: [
          {
            id: "shape:bound",
            type: "geo",
            text: "Wrong label",
            x: 160,
            y: 140,
            w: 220,
            h: 110,
            textBinding: "bound",
          },
        ],
      }),
      plan: {
        summary: "Updated the container label.",
        operations: [
          {
            type: "replace_text",
            targetShapeRef: "shape:bound",
            text: "Correct label",
          },
        ],
      },
    });

    const scene = serializeExcalidrawScene(elements);

    expect(result.appliedOperationCount).toBe(1);
    expect(result.skippedOperations).toHaveLength(0);
    expect(scene.shapes).toEqual([
      expect.objectContaining({
        id: "shape:bound",
        type: "geo",
        text: "Correct label",
      }),
    ]);
  });

  it("filters unsupported element types out of the planner-facing scene", () => {
    const scene = serializeExcalidrawScene([
      {
        id: "shape:freehand",
        type: "freedraw",
        x: 20,
        y: 40,
        width: 160,
        height: 80,
      },
      {
        id: "shape:main",
        type: "rectangle",
        x: 120,
        y: 140,
        width: 220,
        height: 110,
        strokeColor: "#2563eb",
        backgroundColor: "transparent",
      },
    ]);

    expect(scene.shapes.map((shape) => shape.id)).toEqual(["shape:main"]);
  });

  it("compiles and applies valid operations while skipping invalid ones", () => {
    const elements = buildExcalidrawElementsFromFixture({
      shapes: [
        {
          id: "shape:main",
          type: "geo",
          text: "Main idea",
          x: 120,
          y: 140,
          w: 180,
          h: 100,
        },
      ],
    });

    const compiled = compileCanvasPlanForExcalidraw({
      elements,
      plan: {
        summary: "Partially valid plan",
        operations: [
          {
            type: "annotate",
            targetShapeRef: "shape:main",
            text: "Important",
            placement: "above",
          },
          {
            type: "connect",
            fromShapeRef: "shape:main",
            toShapeRef: "missing-shape",
          },
        ],
      },
    });

    expect(compiled.operations).toHaveLength(1);
    expect(compiled.skippedOperations).toEqual([
      expect.objectContaining({
        operationIndex: 1,
        operationType: "connect",
        reason: expect.stringContaining("missing-shape"),
      }),
    ]);

    const { elements: nextElements, result } = applyCanvasPlanToExcalidrawScene({
      elements,
      plan: {
        summary: "Partially valid plan",
        operations: [
          {
            type: "annotate",
            targetShapeRef: "shape:main",
            text: "Important",
            placement: "above",
          },
          {
            type: "connect",
            fromShapeRef: "shape:main",
            toShapeRef: "missing-shape",
          },
        ],
      },
    });

    const scene = serializeExcalidrawScene(nextElements);

    expect(result.operationCount).toBe(2);
    expect(result.appliedOperationCount).toBe(1);
    expect(result.skippedOperations).toHaveLength(1);
    expect(result.summary).toContain("Skipped 1 unsupported change");
    expect(
      scene.shapes.some(
        (shape) => shape.type === "text" && shape.text === "Important",
      ),
    ).toBe(true);
  });

  it("exports a PNG data URL for non-empty scenes", async () => {
    const imageData = await captureExcalidrawSceneImage({
      elements: buildExcalidrawElementsFromFixture({
        shapes: [
          {
            id: "shape:main",
            type: "geo",
            text: "Main idea",
            x: 120,
            y: 140,
            w: 180,
            h: 100,
          },
        ],
      }),
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      files: {},
    });

    expect(imageData).toBe("data:image/png;base64,cG5n");
    expect(exportToBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        exportPadding: 12,
        mimeType: "image/png",
      }),
    );
  });

  it("fails cleanly when exporting an empty scene", async () => {
    await expect(
      captureExcalidrawSceneImage({
        elements: [],
        appState: {
          viewBackgroundColor: "#ffffff",
        },
        files: {},
      }),
    ).rejects.toThrow("Canvas is empty");
  });
});
