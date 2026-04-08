import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { GoogleGenAI } from "@google/genai";

const GEMINI_TEXT_TUTOR_MODEL =
  process.env.GEMINI_TEXT_TUTOR_MODEL ?? "gemini-2.5-flash";

const quizChoiceSchema = z.string().min(1);

const quizQuestionContextSchema = z.object({
  index: z.number().int().nonnegative(),
  prompt: z.string().min(1),
  choices: z.array(quizChoiceSchema),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean().nullable(),
});

const quizContextSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  isSubmitted: z.boolean(),
  answeredCount: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  score: z.number().nullable(),
  questions: z.array(quizQuestionContextSchema),
});

const worksheetChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(1),
});

const worksheetResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("multiple_choice"),
    selectedOptionId: z.string().nullable(),
    note: z.string(),
  }),
  z.object({
    kind: z.literal("multi_select"),
    selectedOptionIds: z.array(z.string()),
    note: z.string(),
  }),
  z.object({
    kind: z.literal("short_answer"),
    answerText: z.string(),
    note: z.string(),
  }),
]);

const worksheetAnswerKeyEntrySchema = z.object({
  questionId: z.string().min(1),
  answerText: z.string().min(1),
  explanation: z.string(),
});

const worksheetItemContextSchema = z.object({
  questionId: z.string().min(1),
  kind: z.enum(["multiple_choice", "multi_select", "short_answer"]),
  prompt: z.string().min(1),
  choices: z.array(worksheetChoiceSchema).optional(),
  placeholder: z.string().nullable().optional(),
  lineCount: z.number().int().optional(),
  response: worksheetResponseSchema.nullable(),
  answerKey: worksheetAnswerKeyEntrySchema.nullable(),
});

const worksheetSectionContextSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  directions: z.string().nullable(),
  items: z.array(worksheetItemContextSchema),
});

const worksheetContextSchema = z.object({
  worksheetId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  instructions: z.string().min(1),
  estimatedTimeMinutes: z.number().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  answeredCount: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  sections: z.array(worksheetSectionContextSchema),
  answerKey: z.array(worksheetAnswerKeyEntrySchema),
});

const uploadedFileContextSchema = z.object({
  artifactId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  extractedText: z.string().nullable(),
});

const requestSchema = z.object({
  prompt: z.string().min(2, "Prompt must be at least 2 characters"),
  quizContext: quizContextSchema.nullable().optional(),
  worksheetContext: worksheetContextSchema.nullable().optional(),
  uploadedFileContext: uploadedFileContextSchema.nullable().optional(),
});

const buildTutorPrompt = ({
  prompt,
  quizContext,
  worksheetContext,
  uploadedFileContext,
}: z.infer<typeof requestSchema>) => {
  const quizSection = quizContext
    ? [
        "Current quiz context:",
        JSON.stringify(quizContext),
        "",
        quizContext.isSubmitted
          ? "The quiz is already submitted. You may discuss correct answers and explanations."
          : "The quiz is not submitted yet. Do not proactively reveal correct answers or explanations unless the user explicitly asks for them.",
      ].join("\n")
    : "No quiz is currently loaded.";

  const worksheetSection = worksheetContext
    ? [
        "Current worksheet context:",
        JSON.stringify(worksheetContext),
        "",
        "The worksheet answer key is available for coaching, but do not proactively reveal answers unless the student explicitly asks for checking, solutions, or review.",
      ].join("\n")
    : "No worksheet is currently loaded.";

  const uploadedFileSection = uploadedFileContext
    ? [
        "Current uploaded file context:",
        JSON.stringify(uploadedFileContext),
        "",
        "Use this uploaded file context as the source of truth when the student asks about the uploaded worksheet or PDF.",
      ].join("\n")
    : "No uploaded file is currently loaded.";

  return [
    "You are an expert one-on-one tutor responding in text-only development mode.",
    "Speak directly to the student.",
    "This route cannot create tools or artifacts.",
    "Do not claim that you created, generated, prepared, opened, or made a deep dive, visualization, flashcards, quiz, worksheet, Google Doc, or Google Sheet unless such an artifact is explicitly provided as already loaded context.",
    "Never narrate your internal planning, reasoning, or tool use.",
    "Do not use markdown headings or meta commentary.",
    "Be concise, concrete, and pedagogically strong.",
    "",
    quizSection,
    "",
    worksheetSection,
    "",
    uploadedFileSection,
    "",
    `Student request: ${prompt}`,
  ].join("\n");
};

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        success: false,
        error: "Not available in production.",
      },
      { status: 404 },
    );
  }

  let body: z.infer<typeof requestSchema>;

  try {
    body = requestSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((entry) => entry.message).join(", ")
        : "Invalid request body";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: "GEMINI_API_KEY is not configured",
      },
      { status: 500 },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_TUTOR_MODEL,
      contents: buildTutorPrompt(body),
      config: {
        temperature: 0.4,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Model returned empty tutor response");
    }

    return NextResponse.json({
      success: true,
      text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate tutor reply";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
