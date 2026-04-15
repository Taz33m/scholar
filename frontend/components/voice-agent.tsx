'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  type VoiceAssistantTurnEvent,
  type VoiceTranscriptPreviewEvent,
  type VoiceToolEvent,
  type VoiceUserTurnEvent,
  useVoiceAgent,
} from "@/hooks/useVoiceAgent";
import type {
  FlashcardActions,
  FlashcardSessionState,
} from "@/types/flashcard";
import type {
  VisualizationActions,
  VisualizationState,
} from "@/types/visualization";
import type { DeepDiveActions, DeepDiveState } from "@/types/deepdive";
import type { SessionChecklistItem } from "@/types/course-brain";
import type {
  FileSessionContext,
  GoogleDocSection,
  GoogleSheetTab,
  QuizQuestion,
  QuizSessionContext,
  WorksheetAnswerKeyEntry,
  WorksheetDocument,
  WorksheetSessionContext,
} from "@/types/session";
import type { SessionStudyContext } from "@/types/study-context";
import type { AgentConnectMode } from "@/lib/voice-agent-controller";
import type { CourseMaterialReference } from "@/lib/course-materials";
import { cn } from "@/lib/utils";

export interface VoiceAgentControllerHandle {
  connectVoiceAgent: () => Promise<void>;
  connectTextAgent: () => Promise<void>;
  disconnectAgent: () => Promise<void>;
  sendTextTurn: (prompt: string) => Promise<void>;
  getStatus: () => string;
  runTool: (
    toolName: string,
    args?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

interface VoiceAgentProps {
  flashcardSession: FlashcardSessionState;
  flashcardActions: FlashcardActions;
  visualizationState: VisualizationState;
  visualizationActions: VisualizationActions;
  deepDiveState: DeepDiveState;
  deepDiveActions: DeepDiveActions;
  quizContext: QuizSessionContext | null;
  studyContext: SessionStudyContext | null;
  worksheetContext: WorksheetSessionContext | null;
  fileContext: FileSessionContext | null;
  activeChecklistItems: SessionChecklistItem[];
  setContentView: (view: "flashcards" | "visualization" | "deepdive") => void;
  onOpenCourseMaterial?: (
    material: CourseMaterialReference,
  ) =>
    | {
        artifactId: string;
        title: string;
        materialId: string;
      }
    | Promise<{
        artifactId: string;
        title: string;
        materialId: string;
      }>;
  onSetGoogleDoc?: (
    title: string,
    summary: string,
    sections: GoogleDocSection[],
  ) => void;
  onSetGoogleSheet?: (
    title: string,
    summary: string,
    sheets: GoogleSheetTab[],
  ) => void;
  onSetQuiz?: (
    title: string,
    summary: string,
    questions: QuizQuestion[],
  ) => void;
  onSetWorksheet?: (artifact: {
    title: string;
    summary: string;
    instructions: string;
    estimatedTimeMinutes: number | null;
    difficulty: "easy" | "medium" | "hard" | null;
    document: WorksheetDocument;
    answerKey: WorksheetAnswerKeyEntry[];
  }) => void;
  onToolEvent?: (event: VoiceToolEvent) => void;
  onTranscriptPreviewChange?: (event: VoiceTranscriptPreviewEvent | null) => void;
  onUserTurn?: (event: VoiceUserTurnEvent) => void;
  onAssistantTurn?: (event: VoiceAssistantTurnEvent) => void;
  onStatusChange?: (status: string) => void;
  onControllerChange?: (controller: VoiceAgentControllerHandle | null) => void;
}

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 9h.01M11 9h.01M15 9h.01M17 13h-6M7 13h.01M11 13h.01M7 17h10" />
    </svg>
  );
}

function MutedIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a3 3 0 0 1 3 3v4" />
      <path d="M9 9v3a3 3 0 0 0 4.26 2.73" />
      <path d="M5 5 19 19" />
      <path d="M19 11a7 7 0 0 1-1.85 4.74" />
      <path d="M5 11a7 7 0 0 0 10.37 6.11" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 14-7-4 7 4 7-14-7Z" />
      <path d="M5 12h10" />
    </svg>
  );
}

function ModeToggle({
  mode,
  selectedMode,
  onSelect,
}: {
  mode: AgentConnectMode;
  selectedMode: AgentConnectMode;
  onSelect: (mode: AgentConnectMode) => void;
}) {
  const isSelected = selectedMode === mode;

  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      aria-pressed={isSelected}
      aria-label={mode === "voice" ? "Voice mode" : "Text mode"}
      title={mode === "voice" ? "Voice mode" : "Text mode"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        isSelected
          ? "bg-white text-slate-800 shadow-sm"
          : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
      )}
    >
      {mode === "voice" ? (
        <MicrophoneIcon className="h-4 w-4" />
      ) : (
        <KeyboardIcon className="h-4 w-4" />
      )}
      <span className="sr-only">
        {mode === "voice" ? "Voice" : "Text"}
      </span>
    </button>
  );
}

export default function VoiceAgent({
  flashcardSession,
  flashcardActions,
  visualizationState,
  visualizationActions,
  deepDiveState,
  deepDiveActions,
  quizContext,
  studyContext,
  worksheetContext,
  fileContext,
  activeChecklistItems,
  setContentView,
  onOpenCourseMaterial,
  onSetGoogleDoc,
  onSetGoogleSheet,
  onSetQuiz,
  onSetWorksheet,
  onToolEvent,
  onTranscriptPreviewChange,
  onUserTurn,
  onAssistantTurn,
  onStatusChange,
  onControllerChange,
}: VoiceAgentProps) {
  const [composerMode, setComposerMode] = useState<AgentConnectMode>("voice");
  const [textPrompt, setTextPrompt] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSendingText, setIsSendingText] = useState(false);
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const disconnectConfirmTimeoutRef = useRef<number | null>(null);

  const {
    activity,
    connectionMode,
    status,
    error,
    isMicMuted,
    connectAgent,
    disconnectAgent,
    sendTextTurn,
    getStatus,
    runTool,
    toggleMic,
  } = useVoiceAgent(
    flashcardSession,
    flashcardActions,
    visualizationState,
    visualizationActions,
    deepDiveState,
    deepDiveActions,
    quizContext,
    studyContext,
    worksheetContext,
    fileContext,
    activeChecklistItems,
    setContentView,
    onOpenCourseMaterial,
    onSetGoogleDoc,
    onSetGoogleSheet,
    onSetQuiz,
    onSetWorksheet,
    onToolEvent,
    onTranscriptPreviewChange,
    onUserTurn,
    onAssistantTurn,
  );

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    return () => {
      if (disconnectConfirmTimeoutRef.current !== null) {
        window.clearTimeout(disconnectConfirmTimeoutRef.current);
      }
    };
  }, []);

  const waitForConnectedStatus = useCallback(async () => {
    const timeoutAt = Date.now() + 20_000;

    while (getStatus() !== "connected") {
      if (getStatus() === "error") {
        throw new Error(
          error ?? "Voice agent entered an error state while connecting.",
        );
      }

      if (Date.now() >= timeoutAt) {
        throw new Error("Timed out waiting for the agent connection.");
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 50);
      });
    }
  }, [error, getStatus]);

  const controller = useMemo<VoiceAgentControllerHandle>(
    () => ({
      connectVoiceAgent: async () => {
        await connectAgent({ mode: "voice", forceStart: true });
        await waitForConnectedStatus();
      },
      connectTextAgent: async () => {
        await connectAgent({ mode: "text" });
        await waitForConnectedStatus();
      },
      disconnectAgent,
      sendTextTurn,
      getStatus,
      runTool,
    }),
    [connectAgent, disconnectAgent, getStatus, runTool, sendTextTurn, waitForConnectedStatus],
  );

  useEffect(() => {
    onControllerChange?.(controller);
    return () => {
      onControllerChange?.(null);
    };
  }, [controller, onControllerChange]);

  const isBusy =
    status === "requesting-permission" || status === "connecting";
  const isConnected = status === "connected";
  const isVoiceConnected = isConnected && connectionMode === "voice";
  const resolvedError = actionError ?? error;
  const isListening = isVoiceConnected && activity === "listening";
  const isResponding = isConnected && activity === "speaking";
  const showTextComposer = composerMode === "text";

  const syncTextAreaHeight = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) {
      return;
    }

    element.style.height = "0px";
    const nextHeight = Math.min(Math.max(element.scrollHeight, 44), 144);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > 144 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    if (!showTextComposer) {
      return;
    }

    syncTextAreaHeight(textAreaRef.current);
  }, [showTextComposer, syncTextAreaHeight, textPrompt]);

  useEffect(() => {
    if (!showTextComposer) {
      return;
    }

    window.setTimeout(() => {
      textAreaRef.current?.focus();
    }, 120);
  }, [showTextComposer]);

  const ensureConnectedMode = useCallback(
    async (mode: AgentConnectMode, options?: { forceStart?: boolean }) => {
      if (status === "connected" && connectionMode === mode) {
        return;
      }

      if (status === "connected" && connectionMode !== mode) {
        await disconnectAgent();
      }

      await connectAgent({ mode, forceStart: options?.forceStart });
      await waitForConnectedStatus();
    },
    [
      connectAgent,
      connectionMode,
      disconnectAgent,
      status,
      waitForConnectedStatus,
    ],
  );

  const handleVoiceAction = useCallback(async () => {
    setActionError(null);
    setComposerMode("voice");

    try {
      if (isVoiceConnected) {
        if (!isConfirmingDisconnect) {
          setIsConfirmingDisconnect(true);
          if (disconnectConfirmTimeoutRef.current !== null) {
            window.clearTimeout(disconnectConfirmTimeoutRef.current);
          }
          disconnectConfirmTimeoutRef.current = window.setTimeout(() => {
            setIsConfirmingDisconnect(false);
            disconnectConfirmTimeoutRef.current = null;
          }, 2200);
          return;
        }

        if (disconnectConfirmTimeoutRef.current !== null) {
          window.clearTimeout(disconnectConfirmTimeoutRef.current);
          disconnectConfirmTimeoutRef.current = null;
        }
        setIsConfirmingDisconnect(false);
        await disconnectAgent();
        return;
      }

      if (disconnectConfirmTimeoutRef.current !== null) {
        window.clearTimeout(disconnectConfirmTimeoutRef.current);
        disconnectConfirmTimeoutRef.current = null;
      }
      setIsConfirmingDisconnect(false);
      void ensureConnectedMode("voice", { forceStart: true }).catch((nextError) => {
        setActionError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to start the voice session.",
        );
      });
    } catch (nextError) {
      setActionError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to start the voice session.",
      );
    }
  }, [disconnectAgent, ensureConnectedMode, isConfirmingDisconnect, isVoiceConnected]);

  useEffect(() => {
    if (!isVoiceConnected && isConfirmingDisconnect) {
      setIsConfirmingDisconnect(false);
    }
  }, [isConfirmingDisconnect, isVoiceConnected]);

  const handleTextSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const normalizedPrompt = textPrompt.trim();
      if (!normalizedPrompt || isBusy || isSendingText) {
        return;
      }

      setActionError(null);
      setIsSendingText(true);

      try {
        await ensureConnectedMode("text");
        await sendTextTurn(normalizedPrompt);
        setTextPrompt("");
      } catch (nextError) {
        setActionError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to send that text prompt.",
        );
      } finally {
        setIsSendingText(false);
      }
    },
    [ensureConnectedMode, isBusy, isSendingText, sendTextTurn, textPrompt],
  );

  return (
    <div className="relative mx-auto w-full max-w-[720px]">
      {isResponding ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[18%] -bottom-2 h-10 rounded-full bg-sky-300/20 blur-2xl animate-[pulse_2400ms_ease-in-out_infinite]"
        />
      ) : null}

      <div
        className={cn(
          "relative mx-auto flex max-w-full border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-[width,min-height,padding,border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          showTextComposer
            ? "w-full min-h-[82px] items-end gap-2 rounded-[28px] px-3 py-3"
            : isVoiceConnected
              ? "w-[222px] min-h-[60px] items-center gap-2 rounded-[24px] px-3 py-2"
              : "w-[170px] min-h-[60px] items-center gap-2 rounded-[24px] px-3 py-2",
        )}
      >
        <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 p-1 text-slate-900">
          <ModeToggle
            mode="voice"
            selectedMode={composerMode}
            onSelect={(mode) => {
              setComposerMode(mode);
              setActionError(null);
            }}
          />
          <ModeToggle
            mode="text"
            selectedMode={composerMode}
            onSelect={(mode) => {
              setComposerMode(mode);
              setActionError(null);
            }}
          />
        </div>

        <div
          aria-hidden={!showTextComposer}
          className={cn(
            "min-w-0 overflow-hidden transition-[flex-grow,max-width,opacity,transform,margin] duration-200 ease-out",
            showTextComposer
              ? "ml-2 max-w-none flex-1 opacity-100 translate-y-0"
              : "ml-0 max-w-0 flex-none opacity-0 translate-y-1 pointer-events-none",
          )}
        >
          <form onSubmit={handleTextSubmit} className="flex min-w-0 items-end">
            <label htmlFor="session-text-prompt" className="sr-only">
              Text prompt
            </label>
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-[20px] bg-slate-100 px-4 py-2 shadow-none ring-0">
              <textarea
                id="session-text-prompt"
                ref={textAreaRef}
                rows={1}
                value={textPrompt}
                disabled={!showTextComposer}
                tabIndex={showTextComposer ? 0 : -1}
                onChange={(event) => {
                  setTextPrompt(event.target.value);
                  syncTextAreaHeight(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleTextSubmit();
                  }
                }}
                className="m-0 block min-h-[44px] w-full resize-none overflow-y-hidden rounded-none border-0 bg-transparent p-0 py-1 text-sm leading-6 text-slate-900 shadow-none outline-none ring-0 [appearance:none] [-webkit-appearance:none] focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent"
              />
            </div>
          </form>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            showTextComposer ? "ml-auto self-end" : "self-center",
          )}
        >
          {showTextComposer ? (
            <button
              type="button"
              onClick={() => {
                void handleTextSubmit();
              }}
              disabled={isBusy || isSendingText || textPrompt.trim().length === 0}
              aria-label={isSendingText ? "Sending prompt" : "Send prompt"}
              title={isSendingText ? "Sending" : "Send prompt"}
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700 transition-colors",
                isBusy || isSendingText || textPrompt.trim().length === 0
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-slate-200",
              )}
            >
              <SendIcon className="h-4 w-4" />
            </button>
          ) : null}

          {isVoiceConnected ? (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
            >
              {isMicMuted ? (
                <MutedIcon className="h-4 w-4" />
              ) : (
                <MicrophoneIcon className="h-4 w-4" />
              )}
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleVoiceAction}
            disabled={isBusy}
            aria-label={
              isBusy
                ? "Connecting voice session"
                : isVoiceConnected
                  ? isConfirmingDisconnect
                    ? "Confirm end voice session"
                    : "End voice session"
                  : "Start voice session"
            }
            title={
              isBusy
                ? "Connecting"
                : isVoiceConnected
                  ? isConfirmingDisconnect
                    ? "Tap again to end"
                    : "End voice session"
                  : "Start voice session"
            }
            className={cn(
              "inline-flex h-12 w-12 items-center justify-center rounded-[18px] border transition-all",
              isVoiceConnected
                ? isConfirmingDisconnect
                  ? "border-red-500 bg-red-500 text-white hover:bg-red-400"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                : "border-sky-500 bg-sky-500 text-white hover:bg-sky-400",
              isListening ? "ring-4 ring-sky-200" : "",
              isBusy ? "cursor-not-allowed opacity-70" : "",
            )}
          >
            {isVoiceConnected ? (
              <StopIcon className="h-[18px] w-[18px]" />
            ) : (
              <MicrophoneIcon className={cn("h-5 w-5", isBusy ? "animate-pulse" : "")} />
            )}
          </button>
        </div>
      </div>

      {resolvedError ? (
        <div className="mt-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {resolvedError}
        </div>
      ) : null}
    </div>
  );
}
