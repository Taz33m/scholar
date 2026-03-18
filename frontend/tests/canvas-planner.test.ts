import { describe, expect, it } from "vitest";

import {
  buildEmptySceneCanvasFallbackPlan,
  enforceGoalDrivenCanvasRequirements,
  sanitizeCanvasPlanReferences,
} from "@/lib/gemini/canvas-planner";

describe("enforceGoalDrivenCanvasRequirements", () => {
  it("adds an annotation when the goal explicitly requests a label and the plan omitted it", () => {
    const plan = enforceGoalDrivenCanvasRequirements(
      "Circle the main idea and label it Important.",
      {
        summary: "Circled the main idea and labeled it Important.",
        operations: [
          {
            type: "emphasize",
            targetShapeRef: "shape:main",
            style: "circle",
          },
        ],
      },
    );

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[1]).toEqual({
      type: "annotate",
      targetShapeRef: "shape:main",
      text: "Important",
      placement: "below",
    });
  });

  it("does not duplicate labeling when the plan already contains the requested text", () => {
    const plan = enforceGoalDrivenCanvasRequirements(
      "Circle the main idea and label it Important.",
      {
        summary: "Circled the main idea and labeled it Important.",
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
    );

    expect(plan.operations).toHaveLength(2);
  });

  it("drops operations that reference unknown temp ids before they are created", () => {
    const plan = sanitizeCanvasPlanReferences(
      {
        summary: "Tried to draw a linked list.",
        operations: [
          {
            type: "emphasize",
            targetShapeRef: "node1",
            style: "circle",
          },
          {
            type: "create_node",
            tempId: "node2",
            text: "Node 2",
            shape: "rectangle",
            x: 240,
            y: 160,
          },
        ],
      },
      {
        shapes: [],
      },
    );

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0].type).toBe("create_node");
  });

  it("builds a deterministic linked-list sketch when the board is empty", () => {
    const plan = buildEmptySceneCanvasFallbackPlan(
      "Use the canvas like a whiteboard and draw a simple linked list with head and tail labels.",
      {
        shapes: [],
      },
    );

    expect(plan).not.toBeNull();
    expect(plan?.operations.filter((operation) => operation.type === "create_node"))
      .toHaveLength(3);
    expect(plan?.operations.filter((operation) => operation.type === "connect"))
      .toHaveLength(2);
    expect(
      plan?.operations.some(
        (operation) =>
          operation.type === "annotate" && operation.text === "Head",
      ),
    ).toBe(true);
    expect(
      plan?.operations.some(
        (operation) =>
          operation.type === "annotate" && operation.text === "Tail",
      ),
    ).toBe(true);
  });
});
