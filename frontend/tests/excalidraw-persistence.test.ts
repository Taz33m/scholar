import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: {
    IMMEDIATELY: "IMMEDIATELY",
    NEVER: "NEVER",
  },
  convertToExcalidrawElements: vi.fn(() => []),
  exportToBlob: vi.fn(),
}));

import { buildLocalStorageFallbackExcalidrawScene } from "@/lib/excalidraw-canvas-adapter";

describe("Excalidraw persistence fallback", () => {
  it("removes file-backed image elements from the localStorage fallback scene", () => {
    const fallback = buildLocalStorageFallbackExcalidrawScene({
      version: 1,
      appState: {
        scrollX: 12,
        scrollY: 24,
      },
      elements: [
        {
          id: "image-1",
          type: "image",
          x: 120,
          y: 140,
          fileId: "file-1",
        },
        {
          id: "text-1",
          type: "text",
          x: 240,
          y: 280,
          text: "Important note",
        },
      ],
      files: {
        "file-1": {
          id: "file-1",
          dataURL: "data:image/png;base64,very-large-image",
        },
      },
    });

    expect(fallback.files).toEqual({});
    expect(fallback.elements).toEqual([
      {
        id: "text-1",
        type: "text",
        x: 240,
        y: 280,
        text: "Important note",
      },
    ]);
  });

  it("preserves non-file-backed elements and app state", () => {
    const fallback = buildLocalStorageFallbackExcalidrawScene({
      version: 1,
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      elements: [
        {
          id: "shape-1",
          type: "rectangle",
          x: 10,
          y: 20,
          width: 120,
          height: 80,
        },
      ],
      files: {},
    });

    expect(fallback.appState).toEqual({
      viewBackgroundColor: "#ffffff",
    });
    expect(fallback.elements).toHaveLength(1);
    expect(fallback.elements[0].id).toBe("shape-1");
  });
});
