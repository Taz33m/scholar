import { describe, expect, it, vi } from "vitest";

import {
  dispatchTextTurn,
  shouldRequestMicrophone,
} from "@/lib/voice-agent-controller";

describe("voice agent text controller", () => {
  it("does not require microphone access in text mode", () => {
    expect(shouldRequestMicrophone("text")).toBe(false);
    expect(shouldRequestMicrophone("voice")).toBe(true);
  });

  it("records the prompt and sends a text turn through the live session", () => {
    const sendClientContent = vi.fn();
    const rememberUserUtterance = vi.fn();
    const clearActiveInput = vi.fn();

    const prompt = dispatchTextTurn({
      prompt: "  Generate a practice quiz about photosynthesis.  ",
      session: {
        sendClientContent,
      } as never,
      status: "connected",
      rememberUserUtterance,
      clearActiveInput,
    });

    expect(prompt).toBe("Generate a practice quiz about photosynthesis.");
    expect(rememberUserUtterance).toHaveBeenCalledWith(
      "Generate a practice quiz about photosynthesis.",
    );
    expect(clearActiveInput).toHaveBeenCalledTimes(1);
    expect(sendClientContent).toHaveBeenCalledWith({
      turns: "Generate a practice quiz about photosynthesis.",
      turnComplete: true,
    });
  });

  it("fails clearly when no connected live session is available", () => {
    expect(() =>
      dispatchTextTurn({
        prompt: "Generate flashcards",
        session: null,
        status: "idle",
        rememberUserUtterance: vi.fn(),
        clearActiveInput: vi.fn(),
      }),
    ).toThrow("Voice agent must be connected before sending a text prompt.");
  });
});
