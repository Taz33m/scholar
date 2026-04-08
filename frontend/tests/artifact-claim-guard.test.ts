import { describe, expect, it } from "vitest";

import {
  getClaimedArtifactKind,
  looksLikeArtifactSuccessClaim,
  stripArtifactClaimSentences,
} from "@/lib/artifact-claim-guard";

describe("artifact claim guard", () => {
  it("detects deep dive success claims", () => {
    const text =
      "I've created a detailed deep dive for you to explore the process.";
    expect(looksLikeArtifactSuccessClaim(text)).toBe(true);
    expect(getClaimedArtifactKind(text)).toBe("deepdive");
  });

  it("detects visualization success claims", () => {
    const text =
      "I've generated a visualization for you that labels the mitochondrion.";
    expect(getClaimedArtifactKind(text)).toBe("visualization");
  });

  it("ignores normal tutor explanations", () => {
    const text =
      "Meiosis is the process that creates gametes and increases genetic variation.";
    expect(looksLikeArtifactSuccessClaim(text)).toBe(false);
    expect(getClaimedArtifactKind(text)).toBe(null);
  });

  it("strips artifact claim sentences but keeps real tutoring text", () => {
    const text =
      "Meiosis is a fascinating topic about cell division that's crucial for reproduction. I've created a comprehensive deep dive for you. Take a look at the main phases first and let me know if any concepts are unclear before we start the review!";

    expect(stripArtifactClaimSentences(text)).toBe(
      "Meiosis is a fascinating topic about cell division that's crucial for reproduction. Take a look at the main phases first and let me know if any concepts are unclear before we start the review!",
    );
  });
});
