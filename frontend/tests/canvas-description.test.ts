import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mocks.generateContent,
    },
  })),
}));

import { describeCanvas } from "@/lib/gemini/canvas-description";

describe("describeCanvas", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("retries transient 503 canvas description failures and returns the next success", async () => {
    mocks.generateContent
      .mockRejectedValueOnce(
        new Error(
          '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
        ),
      )
      .mockResolvedValueOnce({
        text: "A highlighted box labeled Main idea.",
      });

    const result = await describeCanvas(
      "data:image/png;base64,abc123",
      "cell biology",
    );

    expect(result).toBe("A highlighted box labeled Main idea.");
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient failures", async () => {
    mocks.generateContent.mockRejectedValueOnce(
      new Error("Invalid argument: unsupported mime type"),
    );

    await expect(
      describeCanvas("data:image/png;base64,abc123"),
    ).rejects.toThrow("Failed to describe canvas: Invalid argument: unsupported mime type");
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });
});
