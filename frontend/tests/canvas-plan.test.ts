import { describe, expect, it } from "vitest";

import { canvasPlanSchema, normalizeCanvasPlan } from "@/lib/canvas-plan";

describe("canvasPlanSchema", () => {
  it("accepts a valid mixed-operation plan", () => {
    const parsed = canvasPlanSchema.parse({
      summary: "Circled the key idea and added a follow-up node.",
      operations: [
        {
          type: "emphasize",
          targetShapeRef: "shape:idea",
          style: "circle",
          region: {
            x: 0.2,
            y: 0.1,
            w: 0.4,
            h: 0.3,
          },
        },
        {
          type: "create_node",
          tempId: "follow-up",
          text: "Next step",
          shape: "rectangle",
          x: 420,
          y: 220,
        },
        {
          type: "connect",
          fromShapeRef: "shape:idea",
          toShapeRef: "follow-up",
          label: "leads to",
        },
      ],
    });

    expect(parsed.operations).toHaveLength(3);
  });

  it("rejects malformed emphasize regions", () => {
    expect(() =>
      canvasPlanSchema.parse({
        summary: "Broken region",
        operations: [
          {
            type: "emphasize",
            targetShapeRef: "shape:image",
            style: "highlight",
            region: {
              x: 1.2,
              y: 0.1,
              w: 0.4,
              h: 0.3,
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects malformed operations", () => {
    expect(() =>
      canvasPlanSchema.parse({
        summary: "Broken plan",
        operations: [
          {
            type: "connect",
            fromShapeRef: "shape:a",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects unsupported operation types", () => {
    expect(() =>
      canvasPlanSchema.parse({
        summary: "Broken plan",
        operations: [
          {
            type: "spray_paint",
            targetShapeRef: "shape:a",
          },
        ],
      }),
    ).toThrow();
  });

  it("drops malformed operations instead of failing the whole plan", () => {
    const normalized = normalizeCanvasPlan({
      summary: "Mixed quality output",
      operations: [
        {
          type: "annotate",
          targetShapeRef: "shape:idea",
          text: "Key concept",
          placement: "above",
        },
        {
          type: "annotate",
          targetShapeRef: "shape:broken",
        },
      ],
    });

    expect(normalized.operations).toHaveLength(1);
    expect(normalized.operations[0].type).toBe("annotate");
  });
});
