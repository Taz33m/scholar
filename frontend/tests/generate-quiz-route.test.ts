import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/quiz", () => ({
  generateQuiz: vi.fn(),
}));

import { POST } from "@/app/api/generate-quiz/route";
import { generateQuiz } from "@/lib/gemini/quiz";

const generateQuizMock = vi.mocked(generateQuiz);

describe("POST /api/generate-quiz", () => {
  beforeEach(() => {
    generateQuizMock.mockReset();
  });

  it("returns 400 for validation errors", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate-quiz", {
        method: "POST",
        body: JSON.stringify({ topic: "a" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Topic is required");
    expect(generateQuizMock).not.toHaveBeenCalled();
  });

  it("returns 500 for generator failures", async () => {
    generateQuizMock.mockRejectedValue(new Error("Gemini unavailable"));

    const response = await POST(
      new Request("http://localhost/api/generate-quiz", {
        method: "POST",
        body: JSON.stringify({ topic: "mitosis" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("Gemini unavailable");
  });
});
