import type { CanvasAdapter, CanvasFixture } from "@/lib/canvas-adapter";
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

export interface SmokeToolEventSummary {
  success: boolean;
  message: string;
  requestedToolName: string;
  executedToolName: string;
  timestamp: string;
  diagnostics?: Record<string, unknown>;
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
    diagnostics?: Record<string, unknown>;
  }>;
}

export type SmokeCanvasFixture = CanvasFixture;

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
    diagnostics:
      event.output?.diagnostics &&
      typeof event.output.diagnostics === "object"
        ? (event.output.diagnostics as Record<string, unknown>)
        : undefined,
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

export const clearCanvasEditor = async (canvas: CanvasAdapter | null) => {
  if (!canvas) {
    return;
  }

  await canvas.clearScene();
};

export const seedCanvasFixture = (
  canvas: CanvasAdapter | null,
  fixture: CanvasFixture,
) => {
  if (!canvas) {
    throw new Error("Canvas is not available.");
  }

  return canvas.seedFixture(fixture);
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
  canvasAdapter,
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
  canvasAdapter: CanvasAdapter | null;
  activeSession: TutorSession | null;
}): SmokeSnapshot => {
  const canvasScene =
    canvasAdapter && canvasAdapter.isReady()
      ? canvasAdapter.serializeScene()
      : null;

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
        diagnostics:
          event.metadata?.diagnostics &&
          typeof event.metadata.diagnostics === "object"
            ? (event.metadata.diagnostics as Record<string, unknown>)
            : undefined,
      })) ?? [],
  };
};

export interface GeminilearnSmokeBridge {
  resetWorkspace: () => Promise<void>;
  connectTextAgent: () => Promise<void>;
  disconnectAgent: () => Promise<void>;
  sendPrompt: (prompt: string) => Promise<void>;
  runTool: (
    toolName: string,
    args?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  requestTutorReply: (prompt: string) => Promise<SmokeAssistantTurnSummary>;
  seedCanvas: (fixture: SmokeCanvasFixture) => Promise<void>;
  seedVisualization: (payload?: {
    description?: string;
    imageData?: string;
  }) => Promise<void>;
  selectTab: (tabId: WorkspaceTabId) => Promise<void>;
  waitForToolResult: (
    expectedTools: string[],
    timeoutMs?: number,
  ) => Promise<SmokeToolEventSummary>;
  waitForAssistantTurn: (
    options?: WaitForAssistantTurnOptions,
  ) => Promise<SmokeAssistantTurnSummary>;
  getSnapshot: () => SmokeSnapshot;
}
