import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  openAiFallback: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mocks.generateContent,
    },
  })),
}));

vi.mock("@/lib/openai/visualization", () => ({
  generateVisualization: mocks.openAiFallback,
}));

import { generateVisualization } from "@/lib/gemini/visualization";

describe("generateVisualization", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
    mocks.openAiFallback.mockReset();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  it("extracts image data from generatedImages responses", async () => {
    mocks.generateContent.mockResolvedValue({
      generatedImages: [
        {
          image: {
            imageBytes: "abc123",
            mimeType: "image/png",
          },
        },
      ],
    });

    const result = await generateVisualization({
      imageDescription: "A labeled mitosis diagram",
    });

    expect(result).toEqual({
      imageData: "data:image/png;base64,abc123",
    });
    expect(mocks.openAiFallback).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when Gemini image generation is quota exhausted", async () => {
    mocks.generateContent.mockRejectedValue(
      new Error(
        '{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}',
      ),
    );
    mocks.openAiFallback.mockResolvedValue({
      imageData: "data:image/png;base64,fallback123",
    });

    const result = await generateVisualization({
      imageDescription: "A labeled mitosis diagram",
    });

    expect(mocks.openAiFallback).toHaveBeenCalledWith({
      imageDescription: "A labeled mitosis diagram",
    });
    expect(result).toEqual({
      imageData: "data:image/png;base64,fallback123",
    });
  });
});
