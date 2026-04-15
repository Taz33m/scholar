import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { GoogleGenAI } from "@google/genai";
import { studyContextRequestSchema } from "@/lib/study-context-schema";
import { buildStudyContextPrompt } from "@/lib/study-context-prompt";
import { mapInternalCourseBrainToPromptCourseBrain } from "@/lib/tutor-runtime/adapters";
import { assembleTutorPrompt } from "@/lib/tutor-runtime/assemble";
import { normalizeIncomingFileContext } from "@/lib/tutor-runtime/file-context";
import { isTutorPromptBundleEnabled } from "@/lib/tutor-runtime/flags";
import { mapSessionStateToPromptStudentState } from "@/lib/tutor-runtime/adapters";
import type { FileSessionContext } from "@/types/session";

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

const fileContextSchema = z.object({
  artifactId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  extractedText: z.string().nullable(),
  provenance: z.enum(["upload", "course_material"]),
  materialId: z.string().nullable().optional(),
  assetUrl: z.string().nullable().optional(),
});

const activeChecklistItemSchema = z.object({
  id: z.string().min(1),
  conceptId: z.string().min(1),
  label: z.string().min(1),
  bloomLevel: z.enum(["remember", "understand", "apply", "analyze"]),
  successCriteria: z.string(),
  status: z.enum([
    "not_started",
    "in_progress",
    "completed",
    "needs_review",
  ]),
  evidenceNote: z.string(),
});

const requestSchema = z.object({
  prompt: z.string().min(2, "Prompt must be at least 2 characters"),
  quizContext: quizContextSchema.nullable().optional(),
  studyContext: studyContextRequestSchema,
  worksheetContext: worksheetContextSchema.nullable().optional(),
  fileContext: fileContextSchema.nullable().optional(),
  uploadedFileContext: fileContextSchema.nullable().optional(),
  activeChecklistItems: z.array(activeChecklistItemSchema).max(12).optional(),
});

type TutorRequestBody = z.infer<typeof requestSchema>;

const ANSWER_REVEAL_PATTERN =
  /\b(review|solutions?|answer key|correct answers?|explanations?|grade|grading|check(?:ing)?|why (?:is|was).+wrong)\b/i;

const shouldRevealQuizAnswers = ({
  prompt,
  quizContext,
}: {
  prompt: string;
  quizContext: TutorRequestBody["quizContext"];
}) => Boolean(quizContext?.isSubmitted) || ANSWER_REVEAL_PATTERN.test(prompt);

const shouldRevealWorksheetAnswers = (prompt: string) =>
  ANSWER_REVEAL_PATTERN.test(prompt);

const buildQuizSection = ({
  prompt,
  quizContext,
}: {
  prompt: string;
  quizContext: TutorRequestBody["quizContext"];
}) => {
  if (!quizContext) {
    return "No quiz is currently loaded.";
  }

  const revealAnswers = shouldRevealQuizAnswers({ prompt, quizContext });
  const serializedQuizContext = {
    ...quizContext,
    questions: quizContext.questions.map((question) => ({
      index: question.index,
      prompt: question.prompt,
      choices: question.choices,
      selectedAnswer: question.selectedAnswer,
      isCorrect: question.isCorrect,
      ...(revealAnswers
        ? {
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
          }
        : {}),
    })),
  };

  return [
    "Current quiz context:",
    JSON.stringify(serializedQuizContext),
    "",
    revealAnswers
      ? "Quiz review answers and explanations are available for this turn."
      : "The quiz is not submitted yet. Do not proactively reveal correct answers or explanations unless the user explicitly asks for them.",
  ].join("\n");
};

const buildWorksheetSection = ({
  prompt,
  worksheetContext,
}: {
  prompt: string;
  worksheetContext: TutorRequestBody["worksheetContext"];
}) => {
  if (!worksheetContext) {
    return "No worksheet is currently loaded.";
  }

  const revealAnswers = shouldRevealWorksheetAnswers(prompt);
  const serializedWorksheetContext = revealAnswers
    ? worksheetContext
    : {
        ...worksheetContext,
        sections: worksheetContext.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => ({
            ...item,
            answerKey: null,
          })),
        })),
        answerKey: [],
      };

  return [
    "Current worksheet context:",
    JSON.stringify(serializedWorksheetContext),
    "",
    revealAnswers
      ? "Worksheet solutions are available for this turn because the student explicitly asked for review."
      : "The worksheet answer key is not exposed on this turn. Do not proactively reveal answers unless the student explicitly asks for checking, solutions, or review.",
  ].join("\n");
};

const buildLegacyTutorPrompt = ({
  prompt,
  quizContext,
  studyContext,
  worksheetContext,
  fileContext,
}: TutorRequestBody & {
  fileContext: FileSessionContext | null;
}) => {
  const fileSection = fileContext
    ? [
        "Current file context:",
        JSON.stringify(fileContext),
        "",
        "Use this file context as the source of truth when the student asks about the currently selected file.",
      ].join("\n")
    : "No file is currently loaded.";
  const studyContextSection = buildStudyContextPrompt(studyContext);

  return [
    "You are an expert one-on-one tutor responding in text-only development mode.",
    "Speak directly to the student.",
    "This route cannot create tools or artifacts.",
    "Do not claim that you created, generated, prepared, opened, or made a deep dive, visualization, flashcards, quiz, worksheet, Google Doc, or Google Sheet unless such an artifact is explicitly provided as already loaded context.",
    "Never narrate your internal planning, reasoning, or tool use.",
    "Do not use markdown headings or meta commentary.",
    "Be concise, concrete, and pedagogically strong.",
    "",
    buildQuizSection({ prompt, quizContext }),
    "",
    studyContextSection,
    "",
    buildWorksheetSection({ prompt, worksheetContext }),
    "",
    fileSection,
    "",
    `Student request: ${prompt}`,
  ].join("\n");
};

const buildBundledTutorPrompt = ({
  prompt,
  quizContext,
  studyContext,
  worksheetContext,
  fileContext,
  activeChecklistItems,
}: TutorRequestBody & {
  fileContext: FileSessionContext | null;
}) => {
  const promptCourseBrain = mapInternalCourseBrainToPromptCourseBrain({
    studyContext,
    selectedFileMaterialId: fileContext?.materialId ?? null,
  });
  const promptStudentState = mapSessionStateToPromptStudentState({
    studyContext,
    fileContext,
    activeChecklistItems,
  });
  const assembled = assembleTutorPrompt({
    routeKind: "text_tutor",
    toolDeclarations: [],
    promptCourseBrain,
    promptStudentState,
    derivedMemoryContext: studyContext?.derivedMemoryContext ?? null,
    fileContext,
    currentTurnText: prompt,
  });

  if (process.env.NODE_ENV !== "test") {
    console.info("[tutor-runtime] assembled prompt", assembled.report);
  }

  return [
    assembled.text,
    "",
    buildQuizSection({ prompt, quizContext }),
    "",
    buildWorksheetSection({ prompt, worksheetContext }),
    "",
    `Student request: ${prompt}`,
  ].join("\n");
};

const buildTutorPrompt = (body: TutorRequestBody) => {
  const rawFileContext = normalizeIncomingFileContext(
    body.fileContext ?? null,
    body.uploadedFileContext ?? null,
  );
  const fileContext: FileSessionContext | null = rawFileContext
    ? {
        artifactId: rawFileContext.artifactId,
        title: rawFileContext.title,
        summary: rawFileContext.summary,
        fileName: rawFileContext.fileName,
        mimeType: rawFileContext.mimeType,
        extractedText: rawFileContext.extractedText,
        provenance: rawFileContext.provenance,
        materialId: rawFileContext.materialId ?? null,
        assetUrl: rawFileContext.assetUrl ?? null,
      }
    : null;

  if (!isTutorPromptBundleEnabled()) {
    return buildLegacyTutorPrompt({
      ...body,
      fileContext,
    });
  }

  return buildBundledTutorPrompt({
    ...body,
    fileContext,
  });
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

  let body: TutorRequestBody;

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
