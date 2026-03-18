export interface LiveCloseLike {
  code?: number;
  reason?: string;
}

const TRANSIENT_CLOSE_CODES = new Set([1006, 1011, 1012, 1013]);

const TRANSIENT_REASON_PATTERNS = [
  /network/i,
  /timeout/i,
  /temporar/i,
  /unavailable/i,
  /reset/i,
  /restart/i,
  /try again/i,
];

export const shouldRetryLiveClose = (
  event: LiveCloseLike,
  options?: { resumeRequested?: boolean },
) => {
  if (options?.resumeRequested) {
    return true;
  }

  const code = typeof event.code === "number" ? event.code : 0;
  if (TRANSIENT_CLOSE_CODES.has(code)) {
    return true;
  }

  const reason = typeof event.reason === "string" ? event.reason.trim() : "";
  if (!reason) {
    return false;
  }

  return TRANSIENT_REASON_PATTERNS.some((pattern) => pattern.test(reason));
};

export const getLiveDisconnectMessage = (event: LiveCloseLike) => {
  const reason = typeof event.reason === "string" ? event.reason.trim() : "";
  return reason
    ? `Voice agent disconnected unexpectedly: ${reason}`
    : "Voice agent disconnected unexpectedly.";
};
