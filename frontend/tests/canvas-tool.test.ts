import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio", () => ({
  playToolCue: vi.fn(),
}));

import { createAdkTools } from "@/lib/adk-tools";

import { createFakeCanvasAdapter } from "./utils/fake-canvas-adapter";

const createToolSet = (canvasAdapter: object | null) =>
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
    getCanvasAdapter: () => canvasAdapter as never,
    getConversationContext: () => "We are reviewing cell division.",
    setContentView: vi.fn(),
  });

describe("get_canvas_snapshot tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a compact description instead of raw image data", async () => {
    const canvas = createFakeCanvasAdapter({
      shapes: [
        {
          id: "shape:main",
          type: "geo",
          text: "Cell diagram",
          x: 120,
          y: 140,
          w: 180,
          h: 100,
          color: "blue",
        },
      ],
    });
    canvas.setImageData("data:image/png;base64,very-large-image");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        description: "A labeled cell diagram with a nucleus and membrane.",
      }),
    }) as unknown as typeof fetch;

    const tools = createToolSet(canvas.adapter);

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
    const canvas = createFakeCanvasAdapter({
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
    canvas.setImageData("data:image/png;base64,very-large-image");

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

    const tools = createToolSet(canvas.adapter);
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
    expect(canvas.snapshot()).toHaveLength(3);
  });

  it("reroutes inspection-only requests to snapshot instead of mutating the canvas", async () => {
    const canvas = createFakeCanvasAdapter({
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
    canvas.setImageData("data:image/png;base64,very-large-image");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        description: "A diagram showing one main labeled idea.",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const tools = createToolSet(canvas.adapter);
    const tool = tools.find((entry) => entry.name === "edit_canvas");

    const beforeCount = canvas.snapshot().length;
    const result = await tool!.execute({
      goal: "Can you explain what is on the canvas?",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/canvas/describe", expect.any(Object));
    expect(result.success).toBe(true);
    expect(result.reroutedToSnapshot).toBe(true);
    expect(result.message).toContain("No canvas edits applied");
    expect(canvas.snapshot().length).toBe(beforeCount);
  });

  it("treats fully skipped executions as a failed canvas edit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        plan: {
          summary: "Tried to update the canvas.",
          operations: [
            {
              type: "replace_text",
              targetShapeRef: "shape:missing",
              text: "Correct label",
            },
          ],
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const tools = createToolSet({
      isReady: () => true,
      serializeScene: () => ({
        shapes: [],
      }),
      captureImage: async () => "data:image/png;base64,very-large-image",
      applyPlan: async () => ({
        summary: "No safe canvas changes could be applied.",
        operationCount: 1,
        appliedOperationCount: 0,
        changedShapeIds: [],
        skippedOperations: [
          {
            operationIndex: 0,
            operationType: "replace_text",
            reason: "Unknown canvas shape reference: shape:missing",
            targetShapeRef: "shape:missing",
          },
        ],
      }),
      clearScene: async () => {},
      seedFixture: async () => {},
      loadPersistedScene: async () => {},
      removePersistedScene: () => {},
      refresh: () => {},
    });
    const tool = tools.find((entry) => entry.name === "edit_canvas");

    const result = await tool!.execute({
      goal: "Fix the missing label.",
    });

    expect(result.success).toBe(false);
    expect(result.appliedOperations).toBe(0);
    expect(result.skippedOperationCount).toBe(1);
    expect(result.message).toContain("No canvas changes applied");
  });
});
