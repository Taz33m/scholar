import { describe, expect, it } from "vitest";

import {
  assistantTurnHasArtifactBacking,
  validateAssistantTurnText,
} from "@/lib/assistant-turn-guard";

describe("assistantTurnHasArtifactBacking", () => {
  it("accepts same-turn function call backing", () => {
    expect(
      assistantTurnHasArtifactBacking("deepdive", {
        text: "I've created a deep dive for you.",
        functionCallNames: ["generate_deep_dive"],
      }),
    ).toBe(true);
  });

  it("accepts same-turn successful tool results", () => {
    expect(
      assistantTurnHasArtifactBacking("visualization", {
        text: "I've generated a visualization for you.",
        toolResults: [{ toolName: "generate_visualization", success: true }],
      }),
    ).toBe(true);
  });

  it("rejects missing backing", () => {
    expect(
      assistantTurnHasArtifactBacking("deepdive", {
        text: "I've created a deep dive for you.",
        functionCallNames: [],
        toolResults: [],
      }),
    ).toBe(false);
  });

  it("can ignore function-call-only backing when validating pre-tool speech", () => {
    expect(
      assistantTurnHasArtifactBacking("deepdive", {
        text: "I've created a deep dive for you.",
        functionCallNames: ["generate_deep_dive"],
        allowFunctionCallBacking: false,
      }),
    ).toBe(false);
  });
});

describe("validateAssistantTurnText", () => {
  it("passes normal tutoring text through unchanged", () => {
    const result = validateAssistantTurnText({
      text: "Meiosis is a fundamental biological process.",
    });

    expect(result.text).toBe("Meiosis is a fundamental biological process.");
    expect(result.shouldDropAudio).toBe(false);
    expect(result.shouldUseFallback).toBe(false);
  });

  it("preserves valid backed artifact claims", () => {
    const result = validateAssistantTurnText({
      text: "I've created a comprehensive deep dive for you.",
      functionCallNames: ["generate_deep_dive"],
    });

    expect(result.text).toBe("I've created a comprehensive deep dive for you.");
    expect(result.hasBacking).toBe(true);
    expect(result.shouldDropAudio).toBe(false);
  });

  it("strips unsupported artifact claims and drops audio", () => {
    const result = validateAssistantTurnText({
      text: "Meiosis is a fundamental biological process! I've created a comprehensive deep dive for you. Take a look at the main phases first.",
    });

    expect(result.text).toBe(
      "Meiosis is a fundamental biological process! Take a look at the main phases first.",
    );
    expect(result.shouldDropAudio).toBe(true);
    expect(result.shouldUseFallback).toBe(false);
  });

  it("strips pre-tool artifact claims even when a function call already exists", () => {
    const result = validateAssistantTurnText({
      text: "I've created a comprehensive deep dive for you.",
      functionCallNames: ["generate_deep_dive"],
      allowFunctionCallBacking: false,
    });

    expect(result.text).toBe("");
    expect(result.shouldDropAudio).toBe(true);
    expect(result.shouldUseFallback).toBe(true);
  });
});
