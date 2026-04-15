const SECRET_PATTERN =
  /\b(?:api[_-]?key|token|secret|password|magic link|bearer)\b/i;
const URL_WITH_QUERY_PATTERN = /https?:\/\/\S+\?\S+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const SENSITIVE_LABEL_PATTERN =
  /\b(?:anxiety|depression|adhd|bipolar|panic attack|medical diagnosis|race|religion|sexual orientation|disability)\b/i;

const compactWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const redactStudentMemoryText = (value: string | null | undefined) => {
  const normalized = compactWhitespace(value ?? "");
  if (!normalized) {
    return "";
  }

  if (SECRET_PATTERN.test(normalized) || SENSITIVE_LABEL_PATTERN.test(normalized)) {
    return "";
  }

  return normalized
    .replace(URL_WITH_QUERY_PATTERN, "[redacted-url]")
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]");
};

export const isStudentMemorySafeText = (value: string | null | undefined) => {
  const normalized = compactWhitespace(value ?? "");
  if (!normalized) {
    return false;
  }

  return !SECRET_PATTERN.test(normalized) && !SENSITIVE_LABEL_PATTERN.test(normalized);
};
