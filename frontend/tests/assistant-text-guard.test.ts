import { describe, expect, it } from "vitest";

import { looksLikeInternalPlanningText } from "@/lib/assistant-text-guard";

describe("looksLikeInternalPlanningText", () => {
  it("filters leaked visualization tool planning text", () => {
    const leakedText = `**Visualizing Mitochondria's Structures**

I've decided to proceed with the \`generate_visualization\` tool to create a detailed diagram of a mitochondrion. My plan is to set the \`topic\` as "Mitochondria," and craft a descriptive \`imageDescription\` focusing on key labeled structures.`;

    expect(looksLikeInternalPlanningText(leakedText)).toBe(true);
  });

  it("allows a normal tutor-facing artifact response", () => {
    expect(
      looksLikeInternalPlanningText(
        "I made a visualization of the mitochondrion that highlights the membrane, cristae, and matrix. Start by comparing how each part supports energy production.",
      ),
    ).toBe(false);
  });
});
