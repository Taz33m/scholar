import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio", () => ({
  playToolCue: vi.fn(),
}));

vi.mock("@/lib/canvas-snapshot", () => ({
  captureCanvasScreenshot: vi.fn(),
}));

import { createAdkTools } from "@/lib/adk-tools";
import { captureCanvasScreenshot } from "@/lib/canvas-snapshot";

import { createFakeCanvasEditor } from "./utils/fake-canvas-editor";

const captureCanvasScreenshotMock = vi.mocked(captureCanvasScreenshot);

const createToolSet = (canvasEditor: object | null) =>
  createAdkTools({
    flashcardActions: {
      setCards: vi.fn(),
      setMode: vi.fn(),
      flipCard: vi.fn(),
      nextCard: vi.fn(),
      previousCard: vi.fn(),
    },
    getFlashcardSession: () => ({
      cards: [],
      currentIndex: 0,
      isFlipped: false,
      mode: "idle",
      generatedAt: null,
    }),
    visualizationActions: {
      setVisualization: vi.fn(),
      setMode: vi.fn(),
      clearVisualization: vi.fn(),
    },
    deepDiveActions: {
      setDeepDive: vi.fn(),
      setMode: vi.fn(),
      clearDeepDive: vi.fn(),
    },
    getCanvasEditor: () => canvasEditor as never,
    getConversationContext: () => "We are reviewing cell division.",
    setContentView: vi.fn(),
  });

describe("get_canvas_snapshot tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a compact description instead of raw image data", async () => {
    captureCanvasScreenshotMock.mockResolvedValue("data:image/png;base64,very-large-image");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        description: "A labeled cell diagram with a nucleus and membrane.",
      }),
    }) as unknown as typeof fetch;

    const tools = createToolSet({});

    const tool = tools.find((entry) => entry.name === "get_canvas_snapshot");
    expect(tool).toBeDefined();

    const result = await tool!.execute({
      conversationContext: "We were discussing cell structure.",
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/canvas/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageData: "data:image/png;base64,very-large-image",
        conversationContext: "We were discussing cell structure.",
      }),
    });
    expect(result.success).toBe(true);
    expect(result.description).toBe(
      "A labeled cell diagram with a nucleus and membrane.",
    );
    expect(result.message).toContain("Canvas contains:");
    expect(result).not.toHaveProperty("imageData");
  });
});

describe("edit_canvas tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a compact summary while applying the planned edit locally", async () => {
    const editor = createFakeCanvasEditor([
      {
        id: "shape:main",
        type: "geo",
        x: 120,
        y: 140,
        props: {
          color: "blue",
          h: 100,
          richText: { content: [{ content: [{ text: "Main idea" }] }] },
          w: 180,
        },
      },
    ]);

    captureCanvasScreenshotMock.mockResolvedValue(
      "data:image/png;base64,very-large-image",
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        plan: {
          summary: "Circled the main idea and added a label.",
          operations: [
            {
              type: "emphasize",
              targetShapeRef: "shape:main",
              style: "circle",
            },
            {
              type: "annotate",
              targetShapeRef: "shape:main",
              text: "Important",
              placement: "above",
            },
          ],
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const tools = createToolSet(editor);
    const tool = tools.find((entry) => entry.name === "edit_canvas");
    expect(tool).toBeDefined();

    const result = await tool!.execute({
      goal: "Circle the main idea and label it as important.",
    });

    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("/api/canvas/plan");
    const body = JSON.parse(String((request[1] as { body: string }).body));
    expect(body.goal).toContain("Circle the main idea");
    expect(body.context).toBe("We are reviewing cell division.");
    expect(body.scene.shapes[0].id).toBe("shape:main");
    expect(body.imageData).toBe("data:image/png;base64,very-large-image");

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Circled the main idea and added a label.");
    expect(result).not.toHaveProperty("imageData");
    expect(result).not.toHaveProperty("scene");
    expect(editor.snapshot().length).toBe(3);
  });

  it("reroutes inspection-only requests to snapshot instead of mutating the canvas", async () => {
    const editor = createFakeCanvasEditor([
      {
        id: "shape:main",
        type: "geo",
        x: 120,
        y: 140,
        props: {
          color: "blue",
          h: 100,
          richText: { content: [{ content: [{ text: "Main idea" }] }] },
          w: 180,
        },
      },
    ]);

    captureCanvasScreenshotMock.mockResolvedValue(
      "data:image/png;base64,very-large-image",
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        description: "A diagram showing one main labeled idea.",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const tools = createToolSet(editor);
    const tool = tools.find((entry) => entry.name === "edit_canvas");

    const beforeCount = editor.snapshot().length;
    const result = await tool!.execute({
      goal: "Can you explain what is on the canvas?",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/canvas/describe", expect.any(Object));
    expect(result.success).toBe(true);
    expect(result.reroutedToSnapshot).toBe(true);
    expect(result.message).toContain("No canvas edits applied");
    expect(editor.snapshot().length).toBe(beforeCount);
  });
});
