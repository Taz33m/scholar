import { describe, expect, it } from "vitest";

import {
  hasRenderableAssistantText,
  inferArtifactRequestRecovery,
} from "@/lib/artifact-request-recovery";

describe("inferArtifactRequestRecovery", () => {
  it("recovers explicit flashcard requests", () => {
    expect(
      inferArtifactRequestRecovery(
        "Please generate flashcards on meiosis.",
        "Meiosis lecture concepts",
      ),
    ).toEqual({
      toolName: "generate_flashcards",
      args: {
        topic: "Meiosis lecture concepts",
      },
    });
  });

  it("recovers explicit quiz requests with contextual topic", () => {
    expect(
      inferArtifactRequestRecovery(
        "Okay, great. Now I think I'm ready for a quiz on these concepts. Please make the quiz.",
        "Marketing mix and the 4Ps conceptual overview",
      ),
    ).toEqual({
      toolName: "generate_quiz",
      args: {
        topic: "Marketing mix and the 4Ps conceptual overview",
      },
    });
  });

  it("ignores non-artifact tutoring prompts", () => {
    expect(
      inferArtifactRequestRecovery(
        "Can you explain meiosis to me?",
        "Meiosis lecture concepts",
      ),
    ).toBeNull();
  });
});

describe("hasRenderableAssistantText", () => {
  it("rejects markdown-only placeholder text", () => {
    expect(hasRenderableAssistantText("**")).toBe(false);
    expect(hasRenderableAssistantText("####")).toBe(false);
    expect(hasRenderableAssistantText("---")).toBe(false);
  });

  it("accepts normal tutoring text", () => {
    expect(hasRenderableAssistantText("Let's make a quiz on meiosis.")).toBe(
      true,
    );
  });
});
