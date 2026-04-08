import { describe, expect, it } from "vitest";

import {
  getLiveDisconnectMessage,
  sanitizeLiveErrorMessage,
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
    ).toBe(true);
    expect(
      shouldRetryLiveClose({
        code: 1000,
        reason: "Operation is not implemented, or supported, or enabled.",
      }),
    ).toBe(true);
  });

  it("formats disconnect messages from the close reason", () => {
    expect(
      getLiveDisconnectMessage({ reason: "Operation is not implemented" }),
    ).toBe("Voice agent disconnected unexpectedly.");
    expect(getLiveDisconnectMessage({ reason: "" })).toBe(
      "Voice agent disconnected unexpectedly.",
    );
  });

  it("sanitizes noisy live-session error messages", () => {
    expect(
      sanitizeLiveErrorMessage(
        "Operation is not implemented, or supported, or enabled.",
      ),
    ).toBe("Voice agent disconnected unexpectedly.");
  });
});
