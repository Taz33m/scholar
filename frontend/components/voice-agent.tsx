'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type {
  GoogleDocSection,
  GoogleSheetTab,
  QuizQuestion,
  QuizSessionContext,
} from "@/types/session";
import type { AgentConnectMode } from "@/lib/voice-agent-controller";
import { cn } from "@/lib/utils";

export interface VoiceAgentControllerHandle {
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
  setContentView: (view: "flashcards" | "visualization" | "deepdive") => void;
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

function WaveBars({ active }: { active: boolean }) {
  const baseBarClass =
    "h-3 w-[3px] rounded-full bg-brand-orange-light transition-transform duration-300";

  return (
    <div className="flex items-end gap-1" aria-hidden>
      <span className={cn(baseBarClass, active ? "animate-[pulse_900ms_ease-in-out_infinite]" : "scale-y-50 opacity-60")} />
      <span className={cn(baseBarClass, "h-4", active ? "animate-[pulse_1100ms_ease-in-out_infinite]" : "scale-y-75 opacity-80")} />
      <span className={cn(baseBarClass, "h-5", active ? "animate-[pulse_800ms_ease-in-out_infinite]" : "scale-y-100")} />
    </div>
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
        "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
        isSelected
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
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
  setContentView,
  onSetGoogleDoc,
  onSetGoogleSheet,
  onSetQuiz,
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
    setContentView,
    onSetGoogleDoc,
    onSetGoogleSheet,
    onSetQuiz,
    onToolEvent,
    onTranscriptPreviewChange,
    onUserTurn,
    onAssistantTurn,
  );

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const waitForConnectedStatus = useCallback(async () => {
    const timeoutAt = Date.now() + 20_000;

    while (getStatus() !== "connected") {
      if (getStatus() === "error") {
        throw new Error("Voice agent entered an error state while connecting.");
      }

      if (Date.now() >= timeoutAt) {
        throw new Error("Timed out waiting for the agent connection.");
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 50);
      });
    }
  }, [getStatus]);

  const controller = useMemo<VoiceAgentControllerHandle>(
    () => ({
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
  const isTextConnected = isConnected && connectionMode === "text";
  const resolvedError = actionError ?? error;

  const ensureConnectedMode = useCallback(
    async (mode: AgentConnectMode) => {
      if (status === "connected" && connectionMode === mode) {
        return;
      }

      if (status === "connected" && connectionMode !== mode) {
        await disconnectAgent();
      }

      await connectAgent({ mode });
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

    try {
      if (isVoiceConnected) {
        await disconnectAgent();
        return;
      }

      await ensureConnectedMode("voice");
    } catch (nextError) {
      setActionError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to start the voice session.",
      );
    }
  }, [disconnectAgent, ensureConnectedMode, isVoiceConnected]);

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
    <div
      className={cn(
        "relative mx-auto w-full transition-[max-width] duration-300 ease-out",
        composerMode === "text" ? "max-w-[760px]" : "max-w-[460px]",
      )}
    >
      <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2.5 shadow-lg">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 text-slate-900">
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

            <span
              aria-hidden
              className={cn(
                "inline-flex h-2.5 w-2.5 rounded-full transition-colors",
                status === "connected"
                  ? "bg-brand-orange-light"
                  : status === "error"
                    ? "bg-red-400"
                    : "bg-slate-300",
              )}
            />
          </div>

          {composerMode === "voice" ? (
            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-900 transition-shadow",
                isVoiceConnected
                  ? "shadow-[0_8px_30px_rgba(245,158,11,0.12)]"
                  : "",
              )}
            >
              <div className="inline-flex h-10 min-w-[54px] items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-slate-600">
                <div className={cn(isBusy ? "animate-pulse" : "")}>
                  <WaveBars active={isVoiceConnected && activity !== "idle"} />
                </div>
              </div>

              <button
                type="button"
                onClick={toggleMic}
                disabled={!isVoiceConnected}
                aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                  isVoiceConnected
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                )}
              >
                {isMicMuted ? (
                  <MutedIcon className="h-4 w-4" />
                ) : (
                  <MicrophoneIcon className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={handleVoiceAction}
                disabled={isBusy}
                aria-label={
                  isBusy
                    ? "Connecting voice session"
                    : isVoiceConnected
                      ? "End voice session"
                      : "Start voice session"
                }
                title={
                  isBusy
                    ? "Connecting"
                    : isVoiceConnected
                      ? "End voice session"
                      : "Start voice session"
                }
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-full transition-all",
                  isVoiceConnected
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-brand-orange-dark text-white hover:bg-brand-orange-light",
                  isBusy ? "cursor-not-allowed opacity-70" : "",
                )}
              >
                {isVoiceConnected ? (
                  <StopIcon className="h-4 w-4" />
                ) : (
                  <MicrophoneIcon className={cn("h-4 w-4", isBusy ? "animate-pulse" : "")} />
                )}
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleTextSubmit}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-900"
            >
              <label htmlFor="session-text-prompt" className="sr-only">
                Text prompt
              </label>
              <div className="min-w-0 flex-1">
                <input
                  id="session-text-prompt"
                  value={textPrompt}
                  onChange={(event) => {
                    setTextPrompt(event.target.value);
                  }}
                  placeholder="Ask Scholar"
                  className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center gap-2">
                {isTextConnected ? (
                  <button
                    type="button"
                    onClick={() => {
                      void disconnectAgent();
                    }}
                    aria-label="Disconnect text session"
                    title="Disconnect text session"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <StopIcon className="h-4 w-4" />
                  </button>
                ) : null}

                <button
                  type="submit"
                  disabled={isBusy || isSendingText || textPrompt.trim().length === 0}
                  aria-label={isSendingText ? "Sending prompt" : "Send prompt"}
                  title={isSendingText ? "Sending" : "Send prompt"}
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-full transition-all",
                    "bg-brand-orange-dark text-white hover:bg-brand-orange-light",
                    isBusy || isSendingText || textPrompt.trim().length === 0
                      ? "cursor-not-allowed opacity-70"
                      : "",
                  )}
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}

          {resolvedError ? (
            <div className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {resolvedError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
