import { describe, expect, it } from "vitest";

import {
  isStudentMemorySafeText,
  redactStudentMemoryText,
} from "@/lib/student-memory/redaction";

describe("student memory redaction", () => {
  it("redacts direct identifiers and URL query secrets", () => {
    expect(
      redactStudentMemoryText(
        "Email me at student@example.com or call 555-123-4567. https://example.com/reset?step=review",
      ),
    ).toBe(
      "Email me at [redacted-email] or call [redacted-phone]. [redacted-url]",
    );
  });

  it("drops text that includes secrets or sensitive labels", () => {
    expect(
      redactStudentMemoryText("The student mentioned anxiety and shared an api key."),
    ).toBe("");
    expect(isStudentMemorySafeText("The student mentioned anxiety.")).toBe(false);
    expect(isStudentMemorySafeText("Practice more FTC deception questions.")).toBe(true);
  });
});
