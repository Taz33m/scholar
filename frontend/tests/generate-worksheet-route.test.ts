import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/worksheet", () => ({
  generateWorksheet: vi.fn(),
}));

import { POST } from "@/app/api/generate-worksheet/route";
import { generateWorksheet } from "@/lib/gemini/worksheet";

const generateWorksheetMock = vi.mocked(generateWorksheet);

describe("POST /api/generate-worksheet", () => {
  beforeEach(() => {
    generateWorksheetMock.mockReset();
  });

  it("returns 400 for validation errors", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate-worksheet", {
        method: "POST",
        body: JSON.stringify({ topic: "a" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Topic is required");
    expect(generateWorksheetMock).not.toHaveBeenCalled();
  });

  it("returns 500 for generator failures", async () => {
    generateWorksheetMock.mockRejectedValue(new Error("Gemini unavailable"));

    const response = await POST(
      new Request("http://localhost/api/generate-worksheet", {
        method: "POST",
        body: JSON.stringify({ topic: "stoichiometry" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("Gemini unavailable");
  });
});
