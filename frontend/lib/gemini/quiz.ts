import { GoogleGenAI } from "@google/genai";

import type { QuizQuestion } from "@/types/session";

export interface GenerateQuizInput {
  topic: string;
  questionCount?: number;
  difficulty?: "easy" | "medium" | "hard";
}

export interface GenerateQuizResult {
  title: string;
  summary: string;
  questions: QuizQuestion[];
}

const QUIZ_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          choices: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: { type: "string" },
          },
          correctAnswer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["prompt", "choices", "correctAnswer", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "questions"],
  additionalProperties: false,
} as const;

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
};

const normalizeQuestionCount = (value?: number) => {
  if (!Number.isFinite(value)) return 5;
  return Math.max(3, Math.min(8, Math.round(value as number)));
};

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeGeneratedQuiz = (value: unknown): GenerateQuizResult => {
  const candidate =
    value && typeof value === "object"
      ? (value as {
          title?: unknown;
          summary?: unknown;
          questions?: unknown;
        })
      : {};

  const questions = Array.isArray(candidate.questions)
    ? candidate.questions.flatMap((question) => {
        if (!question || typeof question !== "object") return [];
        const item = question as Record<string, unknown>;
        const prompt = toNonEmptyString(item.prompt);
        const explanation = toNonEmptyString(item.explanation);
        const choices = Array.isArray(item.choices)
          ? item.choices.filter((entry): entry is string => toNonEmptyString(entry) !== null)
          : [];
        const safeChoices = choices.slice(0, 5);
        const correctAnswer = toNonEmptyString(item.correctAnswer);

        if (
          !prompt ||
          !explanation ||
          safeChoices.length < 3 ||
          !correctAnswer ||
          !safeChoices.includes(correctAnswer)
        ) {
          return [];
        }

        return [
          {
            prompt,
            choices: safeChoices,
            correctAnswer,
            explanation,
          },
        ];
      }).slice(0, 8)
    : [];

  if (questions.length < 3) {
    throw new Error("Model returned too few valid quiz questions");
  }

  return {
    title: toNonEmptyString(candidate.title) ?? "Practice Quiz",
    summary: toNonEmptyString(candidate.summary) ?? "Multiple-choice quiz.",
    questions,
  };
};

export async function generateQuiz({
  topic,
  questionCount,
  difficulty,
}: GenerateQuizInput): Promise<GenerateQuizResult> {
  const ai = getGeminiClient();
  const safeQuestionCount = normalizeQuestionCount(questionCount);

  const prompt = [
    "Create a student-friendly multiple-choice quiz in JSON.",
    `Topic: ${topic}`,
    `Question count: ${safeQuestionCount}`,
    difficulty ? `Difficulty: ${difficulty}` : null,
    "Each question must include 3-5 answer choices, exactly one correct answer, and a concise explanation.",
    "Keep distractors plausible and educational.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: QUIZ_RESPONSE_SCHEMA,
      temperature: 0.35,
    },
  });

  if (!response.text) {
    throw new Error("Model returned empty quiz response");
  }

  return normalizeGeneratedQuiz(JSON.parse(response.text));
}
