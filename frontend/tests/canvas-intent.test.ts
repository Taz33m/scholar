import { describe, expect, it } from "vitest";

import {
  isCanvasInspectionRequest,
  isExplicitCanvasEditRequest,
} from "@/lib/canvas-intent";

describe("canvas intent detection", () => {
  it("recognizes explicit edit requests", () => {
    expect(
      isExplicitCanvasEditRequest("Circle the main idea and label the mistake."),
    ).toBe(true);
    expect(
      isExplicitCanvasEditRequest("Please clean up this whiteboard and redraw it."),
    ).toBe(true);
  });

  it("recognizes inspection-only requests", () => {
    expect(
      isCanvasInspectionRequest("Can you explain what I drew on the canvas?"),
    ).toBe(true);
    expect(
      isCanvasInspectionRequest("What do you understand from this board?"),
    ).toBe(true);
  });

  it("does not confuse inspection with editing", () => {
    const prompt = "Can you explain what is on the canvas?";
    expect(isCanvasInspectionRequest(prompt)).toBe(true);
    expect(isExplicitCanvasEditRequest(prompt)).toBe(false);
  });
});
