import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/uploaded-file", () => ({
  extractUploadedFileContext: vi.fn(),
}));

import { POST } from "@/app/api/extract-uploaded-file/route";
import { extractUploadedFileContext } from "@/lib/gemini/uploaded-file";

const extractUploadedFileContextMock = vi.mocked(extractUploadedFileContext);

describe("POST /api/extract-uploaded-file", () => {
  beforeEach(() => {
    extractUploadedFileContextMock.mockReset();
  });

  it("returns 400 for invalid input", async () => {
    const response = await POST(
      new Request("http://localhost/api/extract-uploaded-file", {
        method: "POST",
        body: JSON.stringify({
          fileName: "",
          mimeType: "application/pdf",
          dataBase64: "short",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(extractUploadedFileContextMock).not.toHaveBeenCalled();
  });

  it("returns extracted file context", async () => {
    extractUploadedFileContextMock.mockResolvedValue({
      title: "Uploaded Worksheet",
      summary: "Probability practice worksheet.",
      extractedText: "1. Define independent events.",
    });

    const response = await POST(
      new Request("http://localhost/api/extract-uploaded-file", {
        method: "POST",
        body: JSON.stringify({
          fileName: "probability.pdf",
          mimeType: "application/pdf",
          dataBase64: "a".repeat(40),
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      title: "Uploaded Worksheet",
      summary: "Probability practice worksheet.",
    });
  });
});
