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

const requestSchema = z.object({
  prompt: z.string().min(2, "Prompt must be at least 2 characters"),
  quizContext: quizContextSchema.nullable().optional(),
});

const buildTutorPrompt = ({
  prompt,
  quizContext,
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

  return [
    "You are an expert one-on-one tutor responding in text-only development mode.",
    "Speak directly to the student.",
    "Never narrate your internal planning, reasoning, or tool use.",
    "Do not use markdown headings or meta commentary.",
    "Be concise, concrete, and pedagogically strong.",
    "",
    quizSection,
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
