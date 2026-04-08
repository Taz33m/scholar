import { GoogleGenAI } from "@google/genai";

export interface ExtractUploadedFileContextInput {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

export interface ExtractUploadedFileContextResult {
  title: string;
  summary: string;
  extractedText: string | null;
}

const FILE_CONTEXT_MODEL =
  process.env.GEMINI_UPLOADED_FILE_MODEL ?? "gemini-2.5-flash";

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
};

const stripCodeFences = (value: string) =>
  value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const extractUploadedFileContext = async ({
  dataBase64,
  fileName,
  mimeType,
}: ExtractUploadedFileContextInput): Promise<ExtractUploadedFileContextResult> => {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: FILE_CONTEXT_MODEL,
    contents: [
      {
        inlineData: {
          mimeType,
          data: dataBase64,
        },
      },
      {
        text: [
          "Analyze this student-uploaded academic file.",
          "Return strict JSON with keys: title, summary, extractedText.",
          "title: concise worksheet/document title.",
          "summary: 1-2 sentence description of what the file covers.",
          "extractedText: the most instructionally important readable text from the file, capped around 5000 characters.",
          "If the file is a worksheet, preserve the actual question wording when possible.",
          "If some text is unreadable, do best effort and omit uncertainty filler.",
        ].join("\n"),
      },
    ],
  });

  const rawText = stripCodeFences(response.text ?? "");
  if (!rawText) {
    throw new Error("Model returned empty uploaded file response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Model returned invalid uploaded file JSON");
  }

  const candidate = parsed as Record<string, unknown>;
  const fallbackTitle =
    fileName.replace(/\.[^.]+$/, "").trim() || "Uploaded file";

  return {
    title: toNonEmptyString(candidate.title) ?? fallbackTitle,
    summary:
      toNonEmptyString(candidate.summary) ??
      "Uploaded study file available for tutoring.",
    extractedText: toNonEmptyString(candidate.extractedText),
  };
};
