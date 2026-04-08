'use client';

import { Type } from '@google/genai';
import type { FunctionDeclaration, Schema } from '@google/genai';

import { playToolCue } from '@/lib/audio';
import { isCanvasInspectionRequest, isExplicitCanvasEditRequest } from '@/lib/canvas-intent';
import { canvasPlanSchema } from '@/lib/canvas-plan';
import type { CanvasAdapter } from '@/lib/canvas-adapter';
import type { FlashcardActions, FlashcardSessionState } from '@/types/flashcard';
import type { VisualizationActions } from '@/types/visualization';
import type { DeepDiveActions } from '@/types/deepdive';
import type {
  GoogleDocSection,
  GoogleSheetTab,
  QuizQuestion,
  QuizSessionContext,
  UploadedFileSessionContext,
  WorksheetAnswerKeyEntry,
  WorksheetDocument,
  WorksheetSessionContext,
} from '@/types/session';

export interface AdkToolContext {
  flashcardActions: FlashcardActions;
  getFlashcardSession: () => FlashcardSessionState;
  visualizationActions: VisualizationActions;
  deepDiveActions: DeepDiveActions;
  getCanvasAdapter: () => CanvasAdapter | null;
  getQuizContext?: () => QuizSessionContext | null;
  getWorksheetContext?: () => WorksheetSessionContext | null;
  getUploadedFileContext?: () => UploadedFileSessionContext | null;
  getConversationContext?: () => string | undefined;
  setContentView: (view: 'flashcards' | 'visualization' | 'deepdive') => void;
  onSetGoogleDoc?: (title: string, summary: string, sections: GoogleDocSection[]) => void;
  onSetGoogleSheet?: (title: string, summary: string, sheets: GoogleSheetTab[]) => void;
  onSetQuiz?: (title: string, summary: string, questions: QuizQuestion[]) => void;
  onSetWorksheet?: (artifact: {
    title: string;
    summary: string;
    instructions: string;
    estimatedTimeMinutes: number | null;
    difficulty: 'easy' | 'medium' | 'hard' | null;
    document: WorksheetDocument;
    answerKey: WorksheetAnswerKeyEntry[];
  }) => void;
}

export interface AdkToolResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

export interface AdkFunctionTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<AdkToolResult>;
  getDeclaration: () => FunctionDeclaration;
}

interface CreateAdkFunctionToolConfig {
  name: string;
  description: string;
  parameters: Schema;
  execute: (args: unknown) => Promise<AdkToolResult>;
}

const createFunctionTool = ({
  name,
  description,
  parameters,
  execute,
}: CreateAdkFunctionToolConfig): AdkFunctionTool => ({
  name,
  execute: (args) => execute(args),
  getDeclaration: () => ({
    name,
    description,
    parameters,
  }),
});

// Shorthand for optional string property schema
const optStr = (description: string) => ({ type: Type.STRING, description });
const reqStr = (description: string) => ({ type: Type.STRING, description });

const WORKSHEET_REQUEST_PATTERN =
  /\b(worksheet|work\s*sheet|guided practice|practice sheet|practice page|printable handout|student handout|handout|problem set)\b/i;

const looksLikeWorksheetArtifactRequest = (
  ...parts: Array<string | undefined>
) =>
  parts.some(
    (value) =>
      typeof value === "string" && WORKSHEET_REQUEST_PATTERN.test(value),
  );

const normalizeWorksheetDifficulty = (
  value: string | undefined,
): "easy" | "medium" | "hard" | undefined => {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  return undefined;
};

export function createAdkTools(ctx: AdkToolContext): AdkFunctionTool[] {
  const {
    flashcardActions,
    getFlashcardSession,
    visualizationActions,
    deepDiveActions,
    getCanvasAdapter,
    getQuizContext,
    getWorksheetContext,
    getUploadedFileContext,
    getConversationContext,
    setContentView,
    onSetGoogleDoc,
    onSetGoogleSheet,
    onSetQuiz,
    onSetWorksheet,
  } = ctx;

  const generateWorksheetArtifact = async ({
    difficulty,
    focus,
    questionCount,
    topic,
  }: {
    topic: string;
    focus?: string;
    questionCount?: number;
    difficulty?: string;
  }): Promise<AdkToolResult> => {
    try {
      const res = await fetch("/api/generate-worksheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          focus,
          questionCount,
          difficulty: normalizeWorksheetDifficulty(difficulty),
        }),
      });
      const payload = await res.json();
      if (!res.ok || payload.success === false) {
        throw new Error(payload.error ?? "Failed");
      }

      onSetWorksheet?.({
        title: payload.title as string,
        summary: payload.summary as string,
        instructions: payload.instructions as string,
        estimatedTimeMinutes:
          typeof payload.estimatedTimeMinutes === "number"
            ? payload.estimatedTimeMinutes
            : null,
        difficulty:
          payload.difficulty === "easy" ||
          payload.difficulty === "medium" ||
          payload.difficulty === "hard"
            ? payload.difficulty
            : null,
        document: payload.document as WorksheetDocument,
        answerKey: payload.answerKey as WorksheetAnswerKeyEntry[],
      });

      const result = {
        success: true,
        message: `Created worksheet: ${payload.title}`,
      };
      playToolCue(result);
      return result;
    } catch (err) {
      const result = {
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      };
      playToolCue(result);
      return result;
    }
  };

  return [
    // ── Flashcards ──────────────────────────────────────────────────────────

    createFunctionTool({
      name: 'generate_flashcards',
      description: 'Generate a deck of study flashcards only when the user explicitly asks for flashcards, study cards, or a study deck. Do not use this tool for general explanations, tutoring, greetings, or topic overviews.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: reqStr('Topic for the flashcard deck.'),
          focus: optStr('Optional focus area for the deck.'),
        },
        required: ['topic'],
      },
      execute: async (args: unknown) => {
        const { topic, focus } = args as { topic: string; focus?: string };
        console.log('[adk-tools] generate_flashcards', { topic, focus });
        try {
          flashcardActions.setMode('generating');
          const res = await fetch('/api/generate-flashcards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, focus }),
          });
          const payload = await res.json();
          if (!res.ok || payload.success === false) throw new Error(payload.error ?? 'Failed');
          flashcardActions.setCards(payload.flashcards);
          const result = { success: true, count: payload.flashcards.length, message: `Generated ${payload.flashcards.length} flashcards on ${topic}.` };
          playToolCue(result);
          return result;
        } catch (err) {
          flashcardActions.setMode('idle');
          const result = { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
          playToolCue(result);
          return result;
        }
      },
    }),

    createFunctionTool({
      name: 'get_current_flashcard_context',
      description: 'Get information about the current flashcard being reviewed.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        const session = getFlashcardSession();
        if (session.cards.length === 0) return { success: false, available: false, message: 'No flashcards loaded.' };
        const card = session.cards[session.currentIndex];
        const position = `${session.currentIndex + 1} of ${session.cards.length}`;
        return {
          success: true, available: true,
          title: card.title, question: card.question, coreIdea: card.coreIdea,
          isFlipped: session.isFlipped,
          answer: session.isFlipped ? card.answer : '[hidden - do not reveal]',
          position,
          message: `Current card: "${card.title}" (${position}). ${session.isFlipped ? 'Answer revealed.' : 'Showing question.'}`,
        };
      },
    }),

    createFunctionTool({
      name: 'flip_flashcard',
      description: 'Flip the current flashcard to show or hide the answer.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        flashcardActions.flipCard();
        const result = { success: true, message: 'Card flipped.' };
        playToolCue(result);
        return result;
      },
    }),

    createFunctionTool({
      name: 'next_flashcard',
      description: 'Move to the next flashcard.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        flashcardActions.nextCard();
        const result = { success: true, message: 'Moved to next card.' };
        playToolCue(result);
        return result;
      },
    }),

    createFunctionTool({
      name: 'previous_flashcard',
      description: 'Move to the previous flashcard.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        flashcardActions.previousCard();
        const result = { success: true, message: 'Moved to previous card.' };
        playToolCue(result);
        return result;
      },
    }),

    createFunctionTool({
      name: 'get_current_quiz_context',
      description: 'Get the current quiz state, including questions, answer choices, selected answers, score, correct answers, and explanations for review.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        const quiz = getQuizContext?.() ?? null;
        if (!quiz) {
          return {
            success: false,
            available: false,
            message: 'No quiz is currently loaded.',
          };
        }

        const result = {
          success: true,
          available: true,
          title: quiz.title,
          summary: quiz.summary,
          isSubmitted: quiz.isSubmitted,
          answeredCount: quiz.answeredCount,
          totalQuestions: quiz.totalQuestions,
          score: quiz.score,
          questions: quiz.questions.map((question) => ({
            index: question.index,
            prompt: question.prompt,
            choices: question.choices,
            selectedAnswer: question.selectedAnswer,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            isCorrect: question.isCorrect,
          })),
          message: quiz.isSubmitted
            ? `Current quiz: "${quiz.title}". Score ${quiz.score ?? 0} of ${quiz.totalQuestions}.`
            : `Current quiz: "${quiz.title}". Answered ${quiz.answeredCount} of ${quiz.totalQuestions} questions.`,
        };
        return result;
      },
    }),

    createFunctionTool({
      name: 'get_current_worksheet_context',
      description: 'Get the currently selected worksheet, including its structured questions, current student responses, progress, and teacher answer key for tutoring and review.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        const worksheet = getWorksheetContext?.() ?? null;
        if (!worksheet) {
          return {
            success: false,
            available: false,
            message: 'No worksheet is currently loaded.',
          };
        }

        return {
          success: true,
          available: true,
          worksheetId: worksheet.worksheetId,
          title: worksheet.title,
          summary: worksheet.summary,
          instructions: worksheet.instructions,
          estimatedTimeMinutes: worksheet.estimatedTimeMinutes,
          difficulty: worksheet.difficulty,
          answeredCount: worksheet.answeredCount,
          totalQuestions: worksheet.totalQuestions,
          sections: worksheet.sections,
          answerKey: worksheet.answerKey,
          message: `Current worksheet: "${worksheet.title}". Answered ${worksheet.answeredCount} of ${worksheet.totalQuestions} questions.`,
        };
      },
    }),

    createFunctionTool({
      name: 'get_current_uploaded_file_context',
      description: 'Get the currently selected uploaded file, including its title, summary, mime type, and extracted tutoring text.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        const file = getUploadedFileContext?.() ?? null;
        if (!file) {
          return {
            success: false,
            available: false,
            message: 'No uploaded file is currently loaded.',
          };
        }

        return {
          success: true,
          available: true,
          artifactId: file.artifactId,
          title: file.title,
          summary: file.summary,
          fileName: file.fileName,
          mimeType: file.mimeType,
          extractedText: file.extractedText,
          message: `Current uploaded file: "${file.title}".`,
        };
      },
    }),

    // ── Canvas ───────────────────────────────────────────────────────────────

    createFunctionTool({
      name: 'get_canvas_snapshot',
      description: 'Get a concise description of the current canvas drawing for analysis. Do not return raw image data to the model.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          conversationContext: optStr('Context about the ongoing conversation.'),
        },
      },
      execute: async (args: unknown) => {
        const { conversationContext } = args as { conversationContext?: string };
        const canvas = getCanvasAdapter();
        if (!canvas?.isReady()) return { success: false, message: 'Canvas not available.' };
        try {
          const imageData = await canvas.captureImage();
          const response = await fetch('/api/canvas/describe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageData,
              conversationContext: conversationContext ?? null,
            }),
          });
          const payload = await response.json();
          if (!response.ok || payload.success === false) {
            throw new Error(payload.error ?? 'Unable to describe canvas');
          }
          const description =
            typeof payload.description === 'string'
              ? payload.description
              : 'Canvas described successfully.';
          const result = {
            success: true,
            description,
            message: `Canvas contains: ${description}`,
          };
          playToolCue(result);
          return result;
        } catch (err) {
          const result = {
            success: false,
            message: err instanceof Error ? err.message : 'Failed to capture canvas.',
          };
          playToolCue(result);
          return result;
        }
      },
    }),

    createFunctionTool({
      name: 'edit_canvas',
      description: 'Directly modify the current canvas when the user explicitly asks to circle, highlight, label, connect, erase, clean up, reorganize, redraw, or otherwise edit what is on the whiteboard. Do not use this tool for inspection-only or explanation-only requests.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          goal: reqStr('Concrete whiteboard edit instruction to perform on the current canvas.'),
          context: optStr('Optional recent lesson or conversation context that should guide the edit.'),
        },
        required: ['goal'],
      },
      execute: async (args: unknown) => {
        const { goal, context } = args as { goal: string; context?: string };
        const canvas = getCanvasAdapter();
        if (!canvas?.isReady()) {
          return { success: false, message: 'Canvas not available.' };
        }

        const intentText = [goal, context, getConversationContext?.()]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .join(' ')
          .trim();

        if (!isExplicitCanvasEditRequest(intentText) && isCanvasInspectionRequest(intentText)) {
          try {
            const imageData = await canvas.captureImage();
            const response = await fetch('/api/canvas/describe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageData,
                conversationContext: context ?? getConversationContext?.() ?? null,
              }),
            });
            const payload = await response.json();
            if (!response.ok || payload.success === false) {
              throw new Error(payload.error ?? 'Unable to describe canvas');
            }

            const description =
              typeof payload.description === 'string'
                ? payload.description
                : 'Canvas described successfully.';
            const result = {
              success: true,
              description,
              reroutedToSnapshot: true,
              message: `Inspection request detected. No canvas edits applied. Canvas contains: ${description}`,
            };
            playToolCue(result);
            return result;
          } catch (err) {
            const result = {
              success: false,
              message:
                err instanceof Error ? err.message : 'Failed to inspect the canvas.',
            };
            playToolCue(result);
            return result;
          }
        }

        try {
          const scene = canvas.serializeScene();
          let imageData: string | undefined;

          try {
            imageData = await canvas.captureImage();
          } catch {
            imageData = undefined;
          }

          const response = await fetch('/api/canvas/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goal,
              context: context ?? getConversationContext?.() ?? null,
              scene,
              ...(imageData ? { imageData } : {}),
            }),
          });
          const payload = await response.json();
          if (!response.ok || payload.success === false) {
            throw new Error(payload.error ?? 'Unable to plan canvas edits');
          }

          const plan = canvasPlanSchema.parse(payload.plan);
          const execution = await canvas.applyPlan(plan);
          const success = execution.appliedOperationCount > 0;
          const result = {
            success,
            summary: execution.summary,
            appliedOperations: execution.appliedOperationCount,
            plannedOperations: execution.operationCount,
            changedShapeCount: execution.changedShapeIds.length,
            skippedOperationCount: execution.skippedOperations.length,
            message: success
              ? execution.summary
              : `No canvas changes applied: ${execution.summary}`,
            ...(process.env.NODE_ENV === 'production'
              ? {}
              : {
                  diagnostics: {
                    execution: {
                      appliedOperationCount: execution.appliedOperationCount,
                      changedShapeCount: execution.changedShapeIds.length,
                      operationCount: execution.operationCount,
                      skippedOperationCount: execution.skippedOperations.length,
                    },
                    plan,
                    skippedOperations: execution.skippedOperations,
                    ...(execution.diagnostics ?? {}),
                  },
                }),
          };
          playToolCue(result);
          return result;
        } catch (err) {
          const result = {
            success: false,
            message:
              err instanceof Error ? err.message : 'Failed to edit the canvas.',
          };
          playToolCue(result);
          return result;
        }
      },
    }),

    // ── Visualization ────────────────────────────────────────────────────────

    ...(['generate_visualization', 'generate_diagram'] as const).map((toolName) =>
      createFunctionTool({
        name: toolName,
        description: 'Generate an educational visualization image or diagram when the user explicitly asks for a diagram, illustration, chart, flowchart, image, or visual aid. Do not answer visual requests with only text.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            imageDescription: optStr('Detailed description of the image/diagram.'),
            topic: optStr('Short topic name.'),
            includeCanvasImage: { type: Type.BOOLEAN, description: 'Include the current canvas drawing as additional context.' },
          },
        },
        execute: async (args: unknown) => {
          const { imageDescription, topic, includeCanvasImage } = args as { imageDescription?: string; topic?: string; includeCanvasImage?: boolean };
          const description = imageDescription ?? (topic ? `Create a clear educational diagram about ${topic} with labeled parts, directional arrows, and concise annotations.` : undefined);
          if (!description) return { success: false, message: 'Provide a description or topic.' };
          try {
            visualizationActions.setMode('generating');
            let canvasImageData: string | undefined;
            if (includeCanvasImage) {
              const canvas = getCanvasAdapter();
              if (canvas?.isReady()) {
                try {
                  canvasImageData = await canvas.captureImage();
                } catch {}
              }
            }
            const res = await fetch('/api/generate-visualization', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageDescription: description, canvasImageData }),
            });
            const payload = await res.json();
            if (!res.ok || payload.success === false) throw new Error(payload.error ?? 'Failed');
            visualizationActions.setVisualization(payload.imageData, description);
            const result = { success: true, message: 'Visualization generated.' };
            playToolCue(result);
            return result;
          } catch (err) {
            visualizationActions.setMode('idle');
            const result = { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
            playToolCue(result);
            return result;
          }
        },
      })
    ),

    createFunctionTool({
      name: 'show_flashcards',
      description: 'Switch the view back to flashcards.',
      parameters: { type: Type.OBJECT, properties: {} },
      execute: async () => {
        setContentView('flashcards');
        const result = { success: true, message: 'Switched to flashcards.' };
        playToolCue(result);
        return result;
      },
    }),

    // ── Deep Dive ────────────────────────────────────────────────────────────

    createFunctionTool({
      name: 'generate_deep_dive',
      description: 'Generate a comprehensive deep-dive overview with image for a topic.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: reqStr('Topic for the deep dive, including any relevant context.'),
        },
        required: ['topic'],
      },
      execute: async (args: unknown) => {
        const { topic } = args as { topic: string };
        try {
          deepDiveActions.setMode('generating');
          const res = await fetch('/api/generate-deep-dive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic }),
          });
          const payload = await res.json();
          if (!res.ok || payload.success === false) throw new Error(payload.error ?? 'Failed');
          deepDiveActions.setDeepDive(payload.imageData, payload.overviewText, topic);
          const result = { success: true, message: 'Deep dive generated.' };
          playToolCue(result);
          return result;
        } catch (err) {
          deepDiveActions.setMode('idle');
          const result = { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
          playToolCue(result);
          return result;
        }
      },
    }),

    // ── Artifacts ────────────────────────────────────────────────────────────

    createFunctionTool({
      name: 'create_google_doc',
      description: 'Create a Google Docs-style memo artifact for notes, summaries, or document writing. Never use this for worksheets, guided practice, printable handouts, or problem sets.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: reqStr('Topic to create a document for.'),
          purpose: optStr('Optional purpose of the memo.'),
          audience: optStr('Optional target audience.'),
        },
        required: ['topic'],
      },
      execute: async (args: unknown) => {
        const { topic, purpose, audience } = args as { topic: string; purpose?: string; audience?: string };
        if (looksLikeWorksheetArtifactRequest(topic, purpose, audience)) {
          return generateWorksheetArtifact({
            topic,
            focus: purpose ?? audience,
          });
        }
        try {
          const res = await fetch('/api/generate-google-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, purpose, audience }),
          });
          const payload = await res.json();
          if (!res.ok || payload.success === false) throw new Error(payload.error ?? 'Failed');
          onSetGoogleDoc?.(payload.title as string, payload.summary as string, payload.sections);
          const result = { success: true, message: `Created Google Doc: ${payload.title}` };
          playToolCue(result);
          return result;
        } catch (err) {
          const result = { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
          playToolCue(result);
          return result;
        }
      },
    }),

    createFunctionTool({
      name: 'create_google_sheet',
      description: 'Create a Google Sheets-style spreadsheet artifact for structured data, trackers, tables, or datasets. Never use this for worksheets, guided practice, printable handouts, or problem sets.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: reqStr('Topic to convert to spreadsheet data.'),
          objective: optStr('Optional objective for the sheet.'),
        },
        required: ['topic'],
      },
      execute: async (args: unknown) => {
        const { topic, objective } = args as { topic: string; objective?: string };
        if (looksLikeWorksheetArtifactRequest(topic, objective)) {
          return generateWorksheetArtifact({
            topic,
            focus: objective,
          });
        }
        try {
          const res = await fetch('/api/generate-google-sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, objective }),
          });
          const payload = await res.json();
          if (!res.ok || payload.success === false) throw new Error(payload.error ?? 'Failed');
          onSetGoogleSheet?.(payload.title as string, payload.summary as string, payload.sheets);
          const result = { success: true, message: `Created Google Sheet: ${payload.title}` };
          playToolCue(result);
          return result;
        } catch (err) {
          const result = { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
          playToolCue(result);
          return result;
        }
      },
    }),

    createFunctionTool({
      name: 'generate_quiz',
      description: 'Generate a multiple-choice quiz artifact when the user explicitly asks for a quiz, practice test, exam, assessment, or practice questions.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: reqStr('Topic to quiz the student on.'),
          questionCount: { type: Type.NUMBER, description: 'Optional number of questions to generate, from 3 to 8.' },
          difficulty: optStr('Optional difficulty level: easy, medium, or hard.'),
        },
        required: ['topic'],
      },
      execute: async (args: unknown) => {
        const {
          topic,
          questionCount,
          difficulty,
        } = args as {
          topic: string;
          questionCount?: number;
          difficulty?: string;
        };
        try {
          const res = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, questionCount, difficulty }),
          });
          const payload = await res.json();
          if (!res.ok || payload.success === false) {
            throw new Error(payload.error ?? 'Failed');
          }
          onSetQuiz?.(
            payload.title as string,
            payload.summary as string,
            payload.questions as QuizQuestion[],
          );
          const result = {
            success: true,
            count: Array.isArray(payload.questions) ? payload.questions.length : 0,
            message: `Created quiz: ${payload.title}`,
          };
          playToolCue(result);
          return result;
        } catch (err) {
          const result = {
            success: false,
            message: err instanceof Error ? err.message : 'Unknown error',
          };
          playToolCue(result);
          return result;
        }
      },
    }),

    createFunctionTool({
      name: 'generate_worksheet',
      description: 'Generate a professionally formatted worksheet artifact when the user asks for a worksheet, guided practice, practice sheet, or printable handout.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: reqStr('Topic for the worksheet.'),
          focus: optStr('Optional focus area or learning objective.'),
          questionCount: { type: Type.NUMBER, description: 'Optional number of questions to generate, from 3 to 10.' },
          difficulty: optStr('Optional difficulty level: easy, medium, or hard.'),
        },
        required: ['topic'],
      },
      execute: async (args: unknown) => {
        const {
          topic,
          focus,
          questionCount,
          difficulty,
        } = args as {
          topic: string;
          focus?: string;
          questionCount?: number;
          difficulty?: string;
        };
        return generateWorksheetArtifact({
          topic,
          focus,
          questionCount,
          difficulty,
        });
      },
    }),

    createFunctionTool({
      name: 'create_worksheet',
      description: 'Alias for generate_worksheet. Use this when the user explicitly asks to create or make a worksheet, guided practice handout, printable practice page, or problem set.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: reqStr('Topic for the worksheet.'),
          focus: optStr('Optional focus area or learning objective.'),
          questionCount: { type: Type.NUMBER, description: 'Optional number of questions to generate, from 3 to 10.' },
          difficulty: optStr('Optional difficulty level: easy, medium, or hard.'),
        },
        required: ['topic'],
      },
      execute: async (args: unknown) => {
        const {
          topic,
          focus,
          questionCount,
          difficulty,
        } = args as {
          topic: string;
          focus?: string;
          questionCount?: number;
          difficulty?: string;
        };

        return generateWorksheetArtifact({
          topic,
          focus,
          questionCount,
          difficulty,
        });
      },
    }),
  ];
}

/** Dispatch a tool call by name through the local client-safe tool map. */
export async function runAdkTool(
  toolMap: Map<string, AdkFunctionTool>,
  toolName: string,
  args: Record<string, unknown>,
): Promise<AdkToolResult> {
  const tool = toolMap.get(toolName);
  if (!tool) return { success: false, message: `No handler for tool: ${toolName}` };
  return tool.execute(args);
}
