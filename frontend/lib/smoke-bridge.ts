import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShapeId,
} from "@tldraw/tldraw";

import { serializeCanvasScene } from "@/lib/canvas-scene";
import type {
  VoiceAssistantTurnEvent,
  VoiceToolEvent,
} from "@/hooks/useVoiceAgent";
import type { FlashcardSessionState } from "@/types/flashcard";
import type {
  QuizSessionContext,
  TutorSession,
  WorkspaceTabId,
} from "@/types/session";
import type { VisualizationState } from "@/types/visualization";

type SmokeCanvasEditor = Pick<
  Editor,
  "createShapes" | "deleteShapes" | "getCurrentPageId" | "getCurrentPageShapes"
>;

export interface SmokeCanvasFixtureShape {
  id?: string;
  type?: "geo" | "text";
  text: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
  shape?: "rectangle" | "ellipse" | "diamond";
}

export interface SmokeCanvasFixture {
  clearExisting?: boolean;
  shapes: SmokeCanvasFixtureShape[];
}

export interface SmokeToolEventSummary {
  success: boolean;
  message: string;
  requestedToolName: string;
  executedToolName: string;
  timestamp: string;
}

export interface SmokeAssistantTurnSummary {
  text: string;
  timestamp: string;
}

export interface WaitForAssistantTurnOptions {
  afterTimestamp?: string;
  minLength?: number;
  quietPeriodMs?: number;
  timeoutMs?: number;
}

export interface SmokeSnapshot {
  activeTab: WorkspaceTabId;
  availableTabs: WorkspaceTabId[];
  voiceStatus: string;
  lastToolEvent: SmokeToolEventSummary | null;
  assistant: SmokeAssistantTurnSummary | null;
  flashcards: {
    count: number;
    mode: FlashcardSessionState["mode"];
  };
  quiz: {
    available: boolean;
    questionCount: number;
    isSubmitted: boolean;
  };
  visualization: {
    ready: boolean;
    mode: VisualizationState["mode"];
    hasImage: boolean;
  };
  canvas: {
    shapeCount: number;
    shapes: Array<{
      id: string;
      type: string;
      text: string | null;
    }>;
  };
  recentEvents: Array<{
    type: string;
    text: string;
    toolName?: string;
    requestedToolName?: string;
    executedToolName?: string;
  }>;
}

const DEFAULT_GEO_WIDTH = 220;
const DEFAULT_GEO_HEIGHT = 110;

export const summarizeVoiceToolEvent = (
  event: VoiceToolEvent | null,
): SmokeToolEventSummary | null => {
  if (!event) {
    return null;
  }

  return {
    success: event.success,
    message: event.message,
    requestedToolName: event.requestedToolName,
    executedToolName: event.executedToolName,
    timestamp: event.timestamp.toISOString(),
  };
};

export const summarizeAssistantTurn = (
  event: VoiceAssistantTurnEvent | null,
): SmokeAssistantTurnSummary | null => {
  if (!event) {
    return null;
  }

  return {
    text: event.text,
    timestamp: event.timestamp.toISOString(),
  };
};

export const doesToolEventMatchExpectedTools = (
  event: VoiceToolEvent | null,
  expectedTools: string[],
) => {
  if (!event || expectedTools.length === 0) {
    return false;
  }

  return expectedTools.some(
    (toolName) =>
      toolName === event.toolName ||
      toolName === event.requestedToolName ||
      toolName === event.executedToolName,
  );
};

export const clearCanvasEditor = (editor: SmokeCanvasEditor | null) => {
  if (!editor) {
    return;
  }

  const shapeIds = editor.getCurrentPageShapes().map((shape) => shape.id);
  if (shapeIds.length > 0) {
    editor.deleteShapes(shapeIds);
  }
};

export const seedCanvasFixture = (
  editor: SmokeCanvasEditor | null,
  fixture: SmokeCanvasFixture,
) => {
  if (!editor) {
    throw new Error("Canvas editor is not available.");
  }

  if (fixture.clearExisting !== false) {
    clearCanvasEditor(editor);
  }

  editor.createShapes(
    fixture.shapes.map((shape) => {
      const id = shape.id
        ? (shape.id as unknown as TLShapeId)
        : createShapeId();
      const base = {
        id,
        parentId: editor.getCurrentPageId(),
        x: shape.x,
        y: shape.y,
      };

      if (shape.type === "text") {
        return {
          ...base,
          type: "text",
          props: {
            autoSize: false,
            color: shape.color ?? "black",
            font: "sans",
            richText: toRichText(shape.text),
            scale: 1,
            size: "m",
            textAlign: "start",
            w: shape.w ?? 180,
          },
        };
      }

      return {
        ...base,
        type: "geo",
        props: {
          align: "middle",
          color: shape.color ?? "blue",
          dash: "solid",
          fill: "none",
          font: "draw",
          geo: shape.shape ?? "rectangle",
          growY: 0,
          h: shape.h ?? DEFAULT_GEO_HEIGHT,
          labelColor: "black",
          richText: toRichText(shape.text),
          scale: 1,
          size: "m",
          url: "",
          verticalAlign: "middle",
          w: shape.w ?? DEFAULT_GEO_WIDTH,
        },
      };
    }),
  );
};

export const buildSmokeSnapshot = ({
  activeTab,
  availableTabs,
  voiceStatus,
  lastToolEvent,
  lastAssistantTurn,
  flashcardSession,
  quizContext,
  visualizationState,
  canvasEditor,
  activeSession,
}: {
  activeTab: WorkspaceTabId;
  availableTabs: WorkspaceTabId[];
  voiceStatus: string;
  lastToolEvent: VoiceToolEvent | null;
  lastAssistantTurn: VoiceAssistantTurnEvent | null;
  flashcardSession: FlashcardSessionState;
  quizContext: QuizSessionContext | null;
  visualizationState: VisualizationState;
  canvasEditor: Editor | null;
  activeSession: TutorSession | null;
}): SmokeSnapshot => {
  const canvasScene = canvasEditor ? serializeCanvasScene(canvasEditor) : null;

  return {
    activeTab,
    availableTabs,
    voiceStatus,
    lastToolEvent: summarizeVoiceToolEvent(lastToolEvent),
    assistant: summarizeAssistantTurn(lastAssistantTurn),
    flashcards: {
      count: flashcardSession.cards.length,
      mode: flashcardSession.mode,
    },
    quiz: {
      available: Boolean(quizContext),
      questionCount: quizContext?.totalQuestions ?? 0,
      isSubmitted: quizContext?.isSubmitted ?? false,
    },
    visualization: {
      ready: visualizationState.mode === "ready",
      mode: visualizationState.mode,
      hasImage: Boolean(visualizationState.imageData),
    },
    canvas: {
      shapeCount: canvasScene?.shapes.length ?? 0,
      shapes:
        canvasScene?.shapes.map((shape) => ({
          id: shape.id,
          type: shape.type,
          text: shape.text,
        })) ?? [],
    },
    recentEvents:
      activeSession?.events.slice(-8).map((event) => ({
        type: event.type,
        text: event.text,
        toolName:
          typeof event.metadata?.toolName === "string"
            ? event.metadata.toolName
            : undefined,
        requestedToolName:
          typeof event.metadata?.requestedToolName === "string"
            ? event.metadata.requestedToolName
            : undefined,
        executedToolName:
          typeof event.metadata?.executedToolName === "string"
            ? event.metadata.executedToolName
            : undefined,
      })) ?? [],
  };
};

export interface GeminilearnSmokeBridge {
  resetWorkspace: () => Promise<void>;
  connectTextAgent: () => Promise<void>;
  disconnectAgent: () => Promise<void>;
  sendPrompt: (prompt: string) => Promise<void>;
  requestTutorReply: (prompt: string) => Promise<SmokeAssistantTurnSummary>;
  seedCanvas: (fixture: SmokeCanvasFixture) => Promise<void>;
  waitForToolResult: (
    expectedTools: string[],
    timeoutMs?: number,
  ) => Promise<SmokeToolEventSummary>;
  waitForAssistantTurn: (
    options?: WaitForAssistantTurnOptions,
  ) => Promise<SmokeAssistantTurnSummary>;
  getSnapshot: () => SmokeSnapshot;
}
