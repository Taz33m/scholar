import { describe, expect, it } from "vitest";

import {
  getLiveDisconnectMessage,
  shouldRetryLiveClose,
} from "@/lib/live-reconnect-policy";

describe("live reconnect policy", () => {
  it("retries resumable and transient closes only", () => {
    expect(
      shouldRetryLiveClose(
        { code: 1000, reason: "normal close" },
        { resumeRequested: true },
      ),
    ).toBe(true);

    expect(shouldRetryLiveClose({ code: 1012, reason: "" })).toBe(true);
    expect(
      shouldRetryLiveClose({
        code: 1000,
        reason: "temporary network interruption",
      }),
    ).toBe(true);
    expect(
      shouldRetryLiveClose({ code: 1000, reason: "Operation is not implemented" }),
    ).toBe(false);
  });

  it("formats disconnect messages from the close reason", () => {
    expect(
      getLiveDisconnectMessage({ reason: "Operation is not implemented" }),
    ).toBe(
      "Voice agent disconnected unexpectedly: Operation is not implemented",
    );
    expect(getLiveDisconnectMessage({ reason: "" })).toBe(
      "Voice agent disconnected unexpectedly.",
    );
  });
});
