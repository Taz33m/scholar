import { GoogleGenAI } from "@google/genai";

import type {
  WorksheetAnswerKeyEntry,
  WorksheetChoiceOption,
  WorksheetDifficulty,
  WorksheetDocument,
  WorksheetItem,
  WorksheetSection,
} from "@/types/session";

export interface GenerateWorksheetInput {
  topic: string;
  focus?: string;
  questionCount?: number;
  difficulty?: WorksheetDifficulty;
}

export interface GenerateWorksheetResult {
  title: string;
  summary: string;
  instructions: string;
  estimatedTimeMinutes: number | null;
  difficulty: WorksheetDifficulty | null;
  document: WorksheetDocument;
  answerKey: WorksheetAnswerKeyEntry[];
}

const WORKSHEET_JSON_SHAPE = [
  "{",
  '  "title": "string",',
  '  "summary": "string",',
  '  "instructions": "string",',
  '  "estimatedTimeMinutes": 20,',
  '  "difficulty": "easy|medium|hard",',
  '  "document": {',
  '    "subtitle": "string",',
  '    "learningObjectives": ["string"],',
  '    "sections": [',
  "      {",
  '        "heading": "string",',
  '        "directions": "string",',
  '        "items": [',
  "          {",
  '            "kind": "multiple_choice",',
  '            "prompt": "string",',
  '            "choices": ["string", "string", "string"],',
  '            "correctChoice": "string",',
  '            "explanation": "string"',
  "          },",
  "          {",
  '            "kind": "multi_select",',
  '            "prompt": "string",',
  '            "choices": ["string", "string", "string", "string"],',
  '            "correctChoices": ["string", "string"],',
  '            "explanation": "string"',
  "          },",
  "          {",
  '            "kind": "short_answer",',
  '            "prompt": "string",',
  '            "placeholder": "string",',
  '            "lineCount": 3,',
  '            "sampleAnswer": "string",',
  '            "explanation": "string"',
  "          }",
  "        ]",
  "      }",
  "    ]",
  "  }",
  "}",
].join("\n");

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
};

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeQuestionCount = (value?: number) => {
  if (!Number.isFinite(value)) return 6;
  return Math.max(3, Math.min(10, Math.round(value as number)));
};

const clampTime = (value: unknown, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(8, Math.min(90, Math.round(value)));
};

const clampLineCount = (value: unknown, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(2, Math.min(8, Math.round(value)));
};

const parseGeneratedWorksheetPayload = (text: string) => {
  const trimmed = text.trim();

  const directCandidate = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(directCandidate);
  } catch {
    const jsonStart = directCandidate.indexOf("{");
    const jsonEnd = directCandidate.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error("Model returned invalid worksheet JSON");
    }

    try {
      return JSON.parse(directCandidate.slice(jsonStart, jsonEnd + 1));
    } catch {
      throw new Error("Model returned invalid worksheet JSON");
    }
  }
};

const toChoiceOptions = (choices: string[]): WorksheetChoiceOption[] =>
  choices.map((text, index) => ({
    id: `choice-${index + 1}`,
    label: String.fromCharCode(65 + index),
    text,
  }));

const normalizeGeneratedSections = (
  sections: unknown,
): Pick<GenerateWorksheetResult, "document" | "answerKey"> => {
  if (!Array.isArray(sections)) {
    throw new Error("Model returned an invalid worksheet document");
  }

  let globalQuestionIndex = 0;
  const answerKey: WorksheetAnswerKeyEntry[] = [];
  const normalizedSections: WorksheetSection[] = [];

  sections.forEach((section, sectionIndex) => {
    if (!section || typeof section !== "object") {
      return;
    }

    const candidate = section as Record<string, unknown>;
    const heading =
      toNonEmptyString(candidate.heading) ?? `Section ${sectionIndex + 1}`;
    const items = Array.isArray(candidate.items) ? candidate.items : [];
    const normalizedItems: WorksheetItem[] = [];

    items.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const rawItem = item as Record<string, unknown>;
      const prompt = toNonEmptyString(rawItem.prompt);
      if (!prompt) {
        return;
      }

      globalQuestionIndex += 1;
      const questionId = `question-${globalQuestionIndex}`;

      if (rawItem.kind === "multiple_choice") {
        const choices = Array.isArray(rawItem.choices)
          ? rawItem.choices
              .map((choice) => toNonEmptyString(choice))
              .filter((choice): choice is string => Boolean(choice))
              .slice(0, 5)
          : [];
        const correctChoice = toNonEmptyString(rawItem.correctChoice);
        const explanation = toNonEmptyString(rawItem.explanation) ?? "";

        if (
          choices.length < 3 ||
          !correctChoice ||
          !choices.includes(correctChoice)
        ) {
          globalQuestionIndex -= 1;
          return;
        }

        const choiceOptions = toChoiceOptions(choices);
        const correctOption = choiceOptions.find(
          (choice) => choice.text === correctChoice,
        );
        if (!correctOption) {
          globalQuestionIndex -= 1;
          return;
        }

        answerKey.push({
          questionId,
          answerText: `${correctOption.label}. ${correctOption.text}`,
          explanation,
        });

        normalizedItems.push({
          kind: "multiple_choice",
          questionId,
          prompt,
          choices: choiceOptions,
        });
        return;
      }

      if (rawItem.kind === "multi_select") {
        const choices = Array.isArray(rawItem.choices)
          ? rawItem.choices
              .map((choice) => toNonEmptyString(choice))
              .filter((choice): choice is string => Boolean(choice))
              .slice(0, 6)
          : [];
        const correctChoices = Array.isArray(rawItem.correctChoices)
          ? rawItem.correctChoices
              .map((choice) => toNonEmptyString(choice))
              .filter((choice): choice is string => Boolean(choice))
          : [];
        const explanation = toNonEmptyString(rawItem.explanation) ?? "";

        if (
          choices.length < 4 ||
          correctChoices.length < 2 ||
          !correctChoices.every((choice) => choices.includes(choice))
        ) {
          globalQuestionIndex -= 1;
          return;
        }

        const choiceOptions = toChoiceOptions(choices);
        const answerText = correctChoices
          .map((choice) => {
            const option = choiceOptions.find((entry) => entry.text === choice);
            return option ? `${option.label}. ${option.text}` : null;
          })
          .filter((entry): entry is string => Boolean(entry))
          .join("; ");

        answerKey.push({
          questionId,
          answerText,
          explanation,
        });

        normalizedItems.push({
          kind: "multi_select",
          questionId,
          prompt,
          choices: choiceOptions,
        });
        return;
      }

      if (rawItem.kind === "short_answer") {
        const sampleAnswer = toNonEmptyString(rawItem.sampleAnswer);
        const explanation = toNonEmptyString(rawItem.explanation) ?? "";
        if (!sampleAnswer) {
          globalQuestionIndex -= 1;
          return;
        }

        answerKey.push({
          questionId,
          answerText: sampleAnswer,
          explanation,
        });

        normalizedItems.push({
          kind: "short_answer",
          questionId,
          prompt,
          placeholder: toNonEmptyString(rawItem.placeholder),
          lineCount: clampLineCount(rawItem.lineCount, 3),
        });
        return;
      }

      globalQuestionIndex -= 1;
    });

    if (normalizedItems.length === 0) {
      return;
    }

    normalizedSections.push({
      id: `section-${sectionIndex + 1}`,
      heading,
      directions: toNonEmptyString(candidate.directions),
      items: normalizedItems,
    });
  });

  if (answerKey.length < 3 || normalizedSections.length === 0) {
    throw new Error("Model returned too few valid worksheet questions");
  }

  return {
    document: {
      subtitle: null,
      learningObjectives: [],
      sections: normalizedSections,
    },
    answerKey,
  };
};

export const normalizeGeneratedWorksheet = (
  value: unknown,
): GenerateWorksheetResult => {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const rawDocument =
    candidate.document && typeof candidate.document === "object"
      ? (candidate.document as Record<string, unknown>)
      : {};
  const subtitle = toNonEmptyString(rawDocument.subtitle);
  const learningObjectives = Array.isArray(rawDocument.learningObjectives)
    ? rawDocument.learningObjectives
        .map((entry) => toNonEmptyString(entry))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 5)
    : [];
  const { document, answerKey } = normalizeGeneratedSections(rawDocument.sections);

  return {
    title: toNonEmptyString(candidate.title) ?? "Practice Worksheet",
    summary:
      toNonEmptyString(candidate.summary) ??
      "Structured guided practice worksheet.",
    instructions:
      toNonEmptyString(candidate.instructions) ??
      "Complete each section carefully. Show reasoning where needed.",
    estimatedTimeMinutes: clampTime(
      candidate.estimatedTimeMinutes,
      Math.max(12, answerKey.length * 3),
    ),
    difficulty:
      candidate.difficulty === "easy" ||
      candidate.difficulty === "medium" ||
      candidate.difficulty === "hard"
        ? candidate.difficulty
        : null,
    document: {
      ...document,
      subtitle,
      learningObjectives,
    },
    answerKey,
  };
};

export async function generateWorksheet({
  topic,
  focus,
  questionCount,
  difficulty,
}: GenerateWorksheetInput): Promise<GenerateWorksheetResult> {
  const ai = getGeminiClient();
  const safeQuestionCount = normalizeQuestionCount(questionCount);

  const prompt = [
    "Create a student-ready worksheet in JSON.",
    `Topic: ${topic}`,
    focus ? `Focus: ${focus}` : null,
    `Question count target: ${safeQuestionCount}`,
    difficulty ? `Difficulty: ${difficulty}` : null,
    "The worksheet must feel like a real academic handout, not an app UI or prose dump.",
    "Use 2-4 sections with concise directions and professional worksheet language.",
    "Keep prompts clear, printable, and classroom-appropriate.",
    "Mix multiple choice, multi-select, and short answer questions.",
    "Return a brief summary, concise instructions, and answer explanations for the teacher key.",
    "Return JSON only. Do not use markdown fences or commentary.",
    "Use this JSON shape exactly:",
    WORKSHEET_JSON_SHAPE,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.35,
    },
  });

  if (!response.text) {
    throw new Error("Model returned empty worksheet response");
  }

  return normalizeGeneratedWorksheet(parseGeneratedWorksheetPayload(response.text));
}
