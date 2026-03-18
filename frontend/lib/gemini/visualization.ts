import { GoogleGenAI } from "@google/genai";
import { generateVisualization as generateOpenAiVisualization } from "@/lib/openai/visualization";

const GEMINI_VISUALIZATION_MODEL =
  process.env.GEMINI_VISUALIZATION_MODEL ?? "gemini-2.5-flash-image";

export interface GenerateVisualizationInput {
  imageDescription: string;
  canvasImageData?: string;
}

export interface GenerateVisualizationResult {
  imageData: string;
}

interface GeminiInlineDataPart {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiInlineDataPart[];
  };
}

interface GeminiPartsLikeResponse {
  parts?: GeminiInlineDataPart[];
  candidates?: GeminiCandidate[];
  response?: {
    parts?: GeminiInlineDataPart[];
  };
  generatedImages?: Array<{
    image?: {
      imageBytes?: string;
      mimeType?: string;
    };
    raiFilteredReason?: string;
  }>;
}

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
};

const extractParts = (response: unknown): GeminiInlineDataPart[] => {
  if (!response || typeof response !== "object") {
    return [];
  }

  const candidate = response as GeminiPartsLikeResponse;
  if (Array.isArray(candidate.parts)) {
    return candidate.parts;
  }

  if (Array.isArray(candidate.candidates?.[0]?.content?.parts)) {
    return candidate.candidates[0].content.parts;
  }

  if (Array.isArray(candidate.response?.parts)) {
    return candidate.response.parts;
  }

  return [];
};

const extractGeneratedImages = (
  response: unknown,
): Array<{
  image?: {
    imageBytes?: string;
    mimeType?: string;
  };
  raiFilteredReason?: string;
}> => {
  if (!response || typeof response !== "object") {
    return [];
  }

  const candidate = response as GeminiPartsLikeResponse;
  return Array.isArray(candidate.generatedImages) ? candidate.generatedImages : [];
};

const hasOpenAiVisualizationFallback = () =>
  typeof process.env.OPENAI_API_KEY === "string" &&
  process.env.OPENAI_API_KEY.trim().length > 0;

const formatErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isQuotaOrCapacityError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("resource_exhausted") ||
    normalized.includes("resource has been exhausted") ||
    normalized.includes("quota") ||
    normalized.includes("429")
  );
};

const shouldFallbackToOpenAi = (error: unknown) => {
  const message = formatErrorMessage(error);
  return (
    isQuotaOrCapacityError(message) ||
    message.includes("Gemini returned text instead of image data") ||
    message.includes("Gemini did not return image data") ||
    message.includes("No response data returned from Gemini")
  );
};

const extractGeminiImageData = (
  response: unknown,
): GenerateVisualizationResult | null => {
  const generatedImages = extractGeneratedImages(response);
  for (const generatedImage of generatedImages) {
    if (generatedImage?.image?.imageBytes) {
      return {
        imageData: `data:${generatedImage.image.mimeType ?? "image/png"};base64,${generatedImage.image.imageBytes}`,
      };
    }
  }

  const filteredReason = generatedImages.find(
    (generatedImage) => typeof generatedImage?.raiFilteredReason === "string",
  )?.raiFilteredReason;
  if (filteredReason) {
    throw new Error(`Gemini filtered the image request: ${filteredReason}`);
  }

  const parts = extractParts(response);
  if (parts.length === 0) {
    return null;
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType ?? "image/png";
      return {
        imageData: `data:${mimeType};base64,${part.inlineData.data}`,
      };
    }
  }

  const textFallback = parts.find((part) => typeof part.text === "string")?.text;
  if (textFallback) {
    throw new Error(
      `Gemini returned text instead of image data: ${textFallback.trim()}`,
    );
  }

  throw new Error("Gemini did not return image data");
};

const parseDataUrl = (value: string) => {
  const match = value.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Canvas image data must be a valid base64 data URL");
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
};

const buildVisualizationPrompt = (
  imageDescription: string,
  hasCanvasImage: boolean,
) => {
  const basePrompt =
    "Create a clean educational visualization for a student. Prefer labeled diagrams, concise annotations, directional arrows, and an easy-to-follow layout.";

  if (!hasCanvasImage) {
    return `${basePrompt}\n\nRequest: ${imageDescription}`;
  }

  return `${basePrompt}\n\nUse the supplied canvas image as context and preserve any relevant structure or study flow while improving clarity.\n\nRequest: ${imageDescription}`;
};

export async function generateVisualization({
  imageDescription,
  canvasImageData,
}: GenerateVisualizationInput): Promise<GenerateVisualizationResult> {
  const fallbackInput = {
    imageDescription,
    ...(canvasImageData ? { canvasImageData } : {}),
  };

  try {
    const ai = getGeminiClient();
    const prompt = buildVisualizationPrompt(
      imageDescription,
      Boolean(canvasImageData),
    );

    const contents: Array<
      | { text: string }
      | { inlineData: { data: string; mimeType: string } }
    > = [{ text: prompt }];

    if (canvasImageData) {
      contents.push({ inlineData: parseDataUrl(canvasImageData) });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_VISUALIZATION_MODEL,
      contents,
    });

    const result = extractGeminiImageData(response);
    if (result) {
      return result;
    }

    throw new Error("No response data returned from Gemini");
  } catch (geminiError) {
    if (hasOpenAiVisualizationFallback() && shouldFallbackToOpenAi(geminiError)) {
      try {
        return await generateOpenAiVisualization(fallbackInput);
      } catch (openAiError) {
        throw new Error(
          `Failed to generate visualization: Gemini failed (${formatErrorMessage(
            geminiError,
          )}); OpenAI fallback failed (${formatErrorMessage(openAiError)})`,
        );
      }
    }

    throw new Error(
      geminiError instanceof Error
        ? `Failed to generate visualization: ${geminiError.message}`
        : "Failed to generate visualization",
    );
  }
}
