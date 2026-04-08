import { describe, expect, it } from "vitest";

import {
  finalizeTranscriptPreviewText,
  mergeTranscriptPreviewText,
} from "@/lib/transcript-preview";

describe("mergeTranscriptPreviewText", () => {
  it("accepts cumulative transcript updates", () => {
    expect(
      mergeTranscriptPreviewText("What specific", "What specific areas"),
    ).toBe("What specific areas");
  });

  it("appends spaced chunks into one sentence", () => {
    let transcript = "";

    for (const chunk of ["What", " specific", " areas", " are you", " most"]) {
      transcript = mergeTranscriptPreviewText(transcript, chunk);
    }

    expect(transcript).toBe("What specific areas are you most");
  });

  it("preserves mid-word continuation chunks", () => {
    let transcript = "";

    for (const chunk of ["Hi, I'm interes", "te", "d in learning more"]) {
      transcript = mergeTranscriptPreviewText(transcript, chunk);
    }

    expect(transcript).toBe("Hi, I'm interested in learning more");
  });

  it("ignores duplicate suffix chunks after newer text already exists", () => {
    expect(
      mergeTranscriptPreviewText("What specific areas", "areas"),
    ).toBe("What specific areas");
  });
});

describe("finalizeTranscriptPreviewText", () => {
  it("trims outer whitespace from the assembled transcript", () => {
    expect(finalizeTranscriptPreviewText("  What specific areas  ")).toBe(
      "What specific areas",
    );
  });
});
