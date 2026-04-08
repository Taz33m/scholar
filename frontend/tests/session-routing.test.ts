import { describe, expect, it } from "vitest";

import {
  isGeneratedTutorSessionId,
  shouldMintFreshSessionForRoute,
} from "@/lib/session-routing";

describe("session routing", () => {
  it("recognizes generated tutor session ids", () => {
    expect(isGeneratedTutorSessionId("session-1775273089369-sj5310")).toBe(
      true,
    );
    expect(isGeneratedTutorSessionId("local-dev")).toBe(false);
  });

  it("mints a fresh session for unknown non-generated routes", () => {
    expect(
      shouldMintFreshSessionForRoute({
        sessionId: "local-dev",
        hasMatchingSession: false,
        hasPendingSeed: false,
      }),
    ).toBe(true);

    expect(
      shouldMintFreshSessionForRoute({
        sessionId: "stale-bookmark",
        hasMatchingSession: false,
        hasPendingSeed: false,
      }),
    ).toBe(true);
  });

  it("does not mint a fresh session when there is already a match, pending seed, or generated id", () => {
    expect(
      shouldMintFreshSessionForRoute({
        sessionId: "session-1775273089369-sj5310",
        hasMatchingSession: false,
        hasPendingSeed: false,
      }),
    ).toBe(false);

    expect(
      shouldMintFreshSessionForRoute({
        sessionId: "local-dev",
        hasMatchingSession: true,
        hasPendingSeed: false,
      }),
    ).toBe(false);

    expect(
      shouldMintFreshSessionForRoute({
        sessionId: "local-dev",
        hasMatchingSession: false,
        hasPendingSeed: true,
      }),
    ).toBe(false);
  });
});
