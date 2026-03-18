import { describe, expect, it } from "vitest";

import { executeCanvasPlan } from "@/lib/canvas-executor";

import { createFakeCanvasEditor } from "./utils/fake-canvas-editor";

describe("executeCanvasPlan", () => {
  it("applies whiteboard annotation, emphasis, creation, and connectors", async () => {
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

    const result = await executeCanvasPlan(editor as never, {
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
    });

    expect(result.operationCount).toBe(4);
    expect(editor.snapshot()).toHaveLength(5);
    expect(editor.getSelectedShapeIds().length).toBe(4);
    expect(editor.snapshot().some((shape) => shape.type === "text")).toBe(true);
    expect(
      editor
        .snapshot()
        .some(
          (shape) =>
            shape.type === "arrow" &&
            (shape.props as { kind?: string }).kind === "arc",
        ),
    ).toBe(true);
  });

  it("uses the native highlight shape for highlight emphasis", async () => {
    const editor = createFakeCanvasEditor([
      {
        id: "shape:main",
        type: "geo",
        x: 80,
        y: 120,
        props: {
          h: 80,
          richText: { content: [{ content: [{ text: "Important term" }] }] },
          w: 200,
        },
      },
    ]);

    await executeCanvasPlan(editor as never, {
      summary: "Highlighted the term.",
      operations: [
        {
          type: "emphasize",
          targetShapeRef: "shape:main",
          style: "highlight",
        },
      ],
    });

    expect(editor.snapshot().some((shape) => shape.type === "highlight")).toBe(
      true,
    );
  });

  it("supports precise region highlights within large shapes", async () => {
    const editor = createFakeCanvasEditor([
      {
        id: "shape:image",
        type: "image",
        x: 40,
        y: 60,
        props: {
          w: 400,
          h: 300,
        },
      },
    ]);

    await executeCanvasPlan(editor as never, {
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
    });

    const highlight = editor
      .snapshot()
      .find((shape) => shape.type === "highlight");

    expect(highlight).toBeDefined();
    const bounds = editor.getShapePageBounds(highlight!.id);
    expect(bounds).toBeDefined();
    expect(bounds!.w).toBeLessThan(200);
    expect(bounds!.h).toBeLessThan(80);
    expect(bounds!.x).toBeGreaterThan(120);
    expect(bounds!.y).toBeGreaterThan(100);
  });

  it("supports text replacement, moves, and deletes", async () => {
    const editor = createFakeCanvasEditor([
      {
        id: "shape:label",
        type: "text",
        x: 100,
        y: 80,
        props: {
          richText: { content: [{ content: [{ text: "Old label" }] }] },
          w: 160,
        },
      },
      {
        id: "shape:wrong",
        type: "geo",
        x: 240,
        y: 180,
        props: {
          h: 90,
          richText: { content: [{ content: [{ text: "Wrong branch" }] }] },
          w: 140,
        },
      },
    ]);

    await executeCanvasPlan(editor as never, {
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
    });

    const shapes = editor.snapshot();
    expect(shapes).toHaveLength(1);
    expect(shapes[0].x).toBe(360);
    expect(shapes[0].y).toBe(120);
    expect(JSON.stringify(shapes[0].props.richText)).toContain("Correct label");
  });

  it("rolls back the whole plan when an operation is invalid", async () => {
    const editor = createFakeCanvasEditor([
      {
        id: "shape:main",
        type: "geo",
        x: 120,
        y: 140,
        props: {
          h: 100,
          richText: { content: [{ content: [{ text: "Main idea" }] }] },
          w: 180,
        },
      },
    ]);

    await expect(() =>
      executeCanvasPlan(editor as never, {
        summary: "Broken plan",
        operations: [
          {
            type: "create_node",
            tempId: "new-node",
            text: "Should rollback",
            shape: "rectangle",
            x: 300,
            y: 220,
          },
          {
            type: "connect",
            fromShapeRef: "shape:main",
            toShapeRef: "missing-shape",
          },
        ],
      }),
    ).rejects.toThrow("Canvas shape not found");

    expect(editor.snapshot()).toHaveLength(1);
    expect(editor.getSelectedShapeIds()).toHaveLength(0);
  });
});
