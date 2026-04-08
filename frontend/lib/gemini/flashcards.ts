import { GoogleGenAI } from "@google/genai";

import { flashcardSetSchema, FlashcardSet } from "@/types/flashcard";

const SYSTEM_PROMPT = `You are a senior instructional designer helping a teacher create study flashcards.
Always:
- Ground content in the provided lecture context when available.
- Keep language concise, clear, and classroom-friendly.
- Include accurate citations in "source" when lecture context references a module/slide/reading.
- Avoid inventing facts or sources beyond the supplied context.`;

const FLASHCARD_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    flashcards: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          coreIdea: { type: "string" },
          question: { type: "string" },
          answer: { type: "string" },
          source: { type: "string" },
        },
        required: ["title", "coreIdea", "question", "answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["flashcards"],
  additionalProperties: false,
};

const FLASHCARD_MAX_ATTEMPTS = 3;
const FLASHCARD_RETRY_DELAYS_MS = [400, 1200];

export interface GenerateFlashcardsInput {
  topic: string;
  focus?: string;
  lectureContext?: string | null;
}

export interface GenerateFlashcardsResult {
  flashcards: FlashcardSet["flashcards"];
}

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
};

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

const isTransientFlashcardError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("503") ||
    message.includes("429") ||
    message.includes("resource exhausted") ||
    message.includes("high demand") ||
    message.includes("unavailable") ||
    message.includes("deadline exceeded") ||
    message.includes("temporarily")
  );
};

export const normalizeGeneratedFlashcards = (
  value: unknown,
): FlashcardSet["flashcards"] => {
  const parsedCards = Array.isArray((value as { flashcards?: unknown })?.flashcards)
    ? (value as { flashcards: unknown[] }).flashcards
    : [];

  const normalized = parsedCards
    .map((card, index) => {
      if (!card || typeof card !== "object") return null;
      const candidate = card as Record<string, unknown>;

      const title = toNonEmptyString(candidate.title);
      const coreIdea = toNonEmptyString(candidate.coreIdea);
      const question = toNonEmptyString(candidate.question);
      const answer = toNonEmptyString(candidate.answer);

      if (!title || !coreIdea || !question || !answer) {
        return null;
      }

      return {
        id: toNonEmptyString(candidate.id) ?? `flashcard-${index + 1}-${Date.now()}`,
        title,
        coreIdea,
        question,
        answer,
        ...(toNonEmptyString(candidate.source)
          ? { source: toNonEmptyString(candidate.source) as string }
          : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 8) as FlashcardSet["flashcards"];

  if (normalized.length < 3) {
    throw new Error("Model returned too few valid flashcards");
  }

  return flashcardSetSchema.parse({ flashcards: normalized }).flashcards;
};

export async function generateFlashcards({
  topic,
  focus,
  lectureContext,
}: GenerateFlashcardsInput): Promise<GenerateFlashcardsResult> {
  const contextualPromptParts = [
    `Topic: ${topic}`,
    focus ? `Focus: ${focus}` : null,
    lectureContext ? `Lecture context:\n${lectureContext}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const ai = getGeminiClient();
    let normalized: FlashcardSet["flashcards"] | null = null;

    for (let attempt = 0; attempt < FLASHCARD_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Create 4-6 high quality study flashcards.\n\n${contextualPromptParts}`,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseJsonSchema: FLASHCARD_RESPONSE_JSON_SCHEMA,
            temperature: 0.4,
          },
        });

        const rawJson = response.text;
        if (!rawJson) {
          throw new Error("Model returned empty flashcard response");
        }

        const parsed = JSON.parse(rawJson);
        normalized = normalizeGeneratedFlashcards(parsed);
        break;
      } catch (error) {
        const isLastAttempt = attempt === FLASHCARD_MAX_ATTEMPTS - 1;
        if (isLastAttempt || !isTransientFlashcardError(error)) {
          throw error;
        }

        await sleep(
          FLASHCARD_RETRY_DELAYS_MS[attempt] ??
            FLASHCARD_RETRY_DELAYS_MS[FLASHCARD_RETRY_DELAYS_MS.length - 1],
        );
      }
    }

    if (!normalized) {
      throw new Error("Flashcard generation retries exhausted");
    }

    return {
      flashcards: normalized,
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to generate flashcards: ${error.message}`
        : "Failed to generate flashcards"
    );
  }
}
