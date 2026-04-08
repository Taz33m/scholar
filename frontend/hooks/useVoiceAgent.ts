'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FunctionCall,
  type FunctionDeclaration,
  GoogleGenAI,
  type LiveConnectConfig,
  LiveServerMessage,
  Modality,
  Session,
} from "@google/genai";

import {
  createAdkTools,
  runAdkTool,
  type AdkFunctionTool,
} from "@/lib/adk-tools";
import {
  getLiveDisconnectMessage,
  sanitizeLiveErrorMessage,
  shouldRetryLiveClose,
} from "@/lib/live-reconnect-policy";
import {
  finalizeTranscriptPreviewText,
  mergeTranscriptPreviewText,
} from "@/lib/transcript-preview";
import { looksLikeInternalPlanningText } from "@/lib/assistant-text-guard";
import {
  stripArtifactClaimSentences,
} from "@/lib/artifact-claim-guard";
import {
  validateAssistantTurnText,
  type AssistantTurnToolResult,
} from "@/lib/assistant-turn-guard";
import {
  hasRenderableAssistantText,
  inferArtifactRequestRecovery,
} from "@/lib/artifact-request-recovery";
import {
  dispatchTextTurn,
  shouldRequestMicrophone,
  type AgentConnectMode,
} from "@/lib/voice-agent-controller";
import { canvasRef } from "@/lib/canvas-adapter";
import {
  isCanvasInspectionRequest,
  isExplicitCanvasEditRequest,
} from "@/lib/canvas-intent";
import { isExplicitFlashcardRequest } from "@/lib/flashcard-intent";
import { FlashcardSessionState, FlashcardActions } from "@/types/flashcard";
import {
  VisualizationState,
  VisualizationActions,
} from "@/types/visualization";
import { DeepDiveState, DeepDiveActions } from "@/types/deepdive";
import type {
  GoogleDocSection,
  GoogleSheetTab,
  QuizQuestion,
  QuizSessionContext,
  UploadedFileSessionContext,
  WorksheetAnswerKeyEntry,
  WorksheetDocument,
  WorksheetSessionContext,
} from "@/types/session";

export type VoiceStatus =
  | "idle"
  | "requesting-permission"
  | "connecting"
  | "connected"
  | "error";

export interface VoiceToolEvent {
  id: string;
  toolName: string;
  requestedToolName: string;
  executedToolName: string;
  args: Record<string, unknown>;
  success: boolean;
  message: string;
  output?: Record<string, unknown>;
  timestamp: Date;
}

export interface VoiceAssistantTurnEvent {
  id: string;
  text: string;
  timestamp: Date;
}

export interface VoiceUserTurnEvent {
  id: string;
  text: string;
  timestamp: Date;
  source: AgentConnectMode;
}

export interface VoiceTranscriptPreviewEvent {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export type VoiceActivity = "idle" | "listening" | "speaking";

interface EphemeralKeyResponse {
  ephemeralKey: string;
  expiresAt: string;
}

const TOKEN_ENDPOINT = "/api/voice/token";
const LIVE_MODEL =
  process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL ??
  "gemini-2.5-flash-native-audio-preview-12-2025";
const LIVE_ENABLE_SESSION_RESUMPTION =
  process.env.NEXT_PUBLIC_GEMINI_LIVE_ENABLE_SESSION_RESUMPTION === "true";
const LIVE_CONTEXT_COMPRESSION_TRIGGER =
  process.env.NEXT_PUBLIC_GEMINI_LIVE_CONTEXT_TRIGGER_TOKENS;
const LIVE_CONTEXT_COMPRESSION_TARGET =
  process.env.NEXT_PUBLIC_GEMINI_LIVE_CONTEXT_TARGET_TOKENS;
const LIVE_RECONNECT_DELAY_MS = 400;
const LIVE_MAX_RESUME_RECONNECT_ATTEMPTS = 2;
const LIVE_MAX_TRANSIENT_RECONNECT_ATTEMPTS = 1;
const LIVE_CONNECT_TIMEOUT_MS = 12_000;
const ASSISTANT_AUDIO_HOLD_MS = 900;
const ASSISTANT_AUDIO_MIN_RELEASE_CHARS = 48;

// FunctionDeclarations are derived at runtime from the client tool definitions.

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const float32ToPcm16Base64 = (input: Float32Array): string => {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    pcm[i] = Math.round(clamp(input[i], -1, 1) * 32767);
  }

  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const base64ToPcm16 = (base64: string): Int16Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Int16Array(bytes.buffer);
};

const parseSampleRateFromMimeType = (
  mimeType: string | undefined,
  fallback = 24000,
) => {
  if (!mimeType) return fallback;

  const rateMatch = mimeType.match(/(?:rate|sample_rate)=([0-9]+)/i);
  if (!rateMatch) return fallback;

  const parsed = Number.parseInt(rateMatch[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const stopMediaStreamTracks = (stream: MediaStream | null | undefined) => {
  stream?.getTracks().forEach((track) => track.stop());
};

interface BufferedAssistantAudioChunk {
  base64Data: string;
  mimeType: string | undefined;
}

interface BufferedAssistantTurn {
  transcriptText: string;
  audioChunks: BufferedAssistantAudioChunk[];
  functionCallNames: string[];
  toolResults: AssistantTurnToolResult[];
}

const createEmptyAssistantTurnBuffer = (): BufferedAssistantTurn => ({
  transcriptText: "",
  audioChunks: [],
  functionCallNames: [],
  toolResults: [],
});

const buildAgentInstructions = (deckSummary: string) => `You are an encouraging and knowledgeable tutor. Always respond in English. Be warm, clear, concise, and pedagogically strong while helping students learn.

You are a tutor, not a toolbar announcer. Do not give flat status-only replies like "it's ready for you" or "the deep dive is ready" with no teaching value. When a tool creates something, briefly orient the student like a teacher would: say what it covers, what to look at first, or what the next learning step should be. Keep that bridge short, usually 1-2 sentences, and do not read the full artifact aloud.
Never say that you created, generated, prepared, opened, or made an artifact unless you have already called the corresponding tool and it succeeded.
For longer tool actions like generating artifacts or inspecting/editing the canvas, first say one short natural sentence out loud so the student knows what you are doing, then call the tool immediately. Examples: "Okay, I'll put together a quick deep dive on meiosis." "Let me look at the canvas." "I'll make a diagram of the mitochondrion." Do not mention raw tool names in that sentence.

CRITICAL RULE: You have tools. ALWAYS use the correct tool instead of describing content verbally. Never recite flashcard content, diagram content, or document content out loud — always call the appropriate tool and let the UI display it.
Speak directly to the student. Never narrate your internal planning, reasoning, tool selection, or what you are about to do. Do not use meta headings like "Clarifying..." or "Formulating...". Give the actual tutoring response.

FLASHCARD MANAGEMENT:
- When the user asks for flashcards on any topic, you MUST call generate_flashcards immediately. Do not describe or recite flashcard content verbally.
- Do NOT proactively suggest flashcards unless the user asks.
- Never call generate_flashcards for greetings, general tutoring, topic explanations, summaries, deep dives, or because no flashcards are loaded yet.
- Treat flashcards as explicit-only: the user must clearly ask for flashcards, study cards, review cards, an Anki deck, or to create/make/generate a deck or cards.
- Call generate_flashcards with the topic (and focus if provided). The cards will appear on screen automatically.
- After the tool returns, briefly say what kind of review deck was created, mention the card count, and invite the student to start reviewing.
- If the tool fails, apologize briefly and ask whether they'd like to try again.

FLASHCARD NAVIGATION:
- Call get_current_flashcard_context to understand which card the user is viewing before discussing it.
- When the user asks to flip the card, show the answer, or reveal the answer, call flip_flashcard.
- When the user asks to go to the next card or move forward, call next_flashcard.
- When the user asks to go back or see the previous card, call previous_flashcard.

FLASHCARD GUIDANCE:
- After calling get_current_flashcard_context, use the response to guide the discussion.
- If the card is NOT flipped: discuss the topic, offer hints, and expand on concepts, but DO NOT reveal the exact answer text.
- If the card IS flipped: discuss the answer openly and compare the student's response to the correct answer.
- Always be encouraging and educational.

CANVAS AWARENESS:
- ONLY call get_canvas_snapshot when the user explicitly refers to what they drew or asks you to inspect the canvas.
- Examples: "What did I draw?", "Can you see what's on the canvas?", "Based on what I drew, what do you understand?"
- Requests to explain, describe, or inspect the existing drawing are inspection requests, not edit requests.
- Do NOT call this tool proactively.
- Include conversationContext when helpful, such as: "We've been discussing mitosis and cell division."
- If the canvas is empty, clearly tell the user nothing is drawn yet.

CANVAS EDITING:
- When the user explicitly asks you to modify the whiteboard or canvas, you MUST call edit_canvas.
- Use edit_canvas for requests to circle, highlight, label, connect, erase, clean up, reorganize, redraw, annotate, or otherwise directly change what is on the board.
- Use edit_canvas when the user wants something drawn directly on the canvas in a whiteboard style.
- Do NOT merely describe the intended whiteboard change verbally when edit_canvas is appropriate.
- Use get_canvas_snapshot for inspection requests and edit_canvas for modification requests.
- Do NOT call edit_canvas just to explain what the canvas already contains.
- After edit_canvas succeeds, briefly confirm that the canvas has been updated.

VISUALIZATION GENERATION:
- When the user explicitly asks for an image, illustration, diagram, chart, flowchart, drawing, or visual aid, you MUST call generate_visualization or generate_diagram immediately.
- Do not answer a visual request with only spoken text. The visual should be generated in the UI.
- Do not route explicit visual requests to generate_flashcards or generate_deep_dive unless the user also explicitly asked for those.
- Prefer edit_canvas instead of generate_visualization when the user wants direct whiteboard edits rather than a separate generated image.
- Pass a detailed imageDescription with subject, style, composition, labels, colors, and key details.
- Set includeCanvasImage=true ONLY when the user asks to enhance or build on their existing canvas drawing.
- After generating, do not only announce that it is ready. Briefly explain what the visualization will help them notice or understand.
- When the user wants to return to flashcards, call show_flashcards.

DEEP DIVE GENERATION:
- When the user asks for a deep dive, comprehensive overview, or detailed explanation, call generate_deep_dive.
- Build the topic parameter with full context. If the user references the canvas, embed that context (example: "photosynthesis, focusing on the chloroplast structure the student drew").
- Include relevant conversation context in the topic so the output stays grounded.
- After generating, do not only announce that it is ready. Give a short tutor-like setup for the topic and tell the student what to focus on first in the deep dive.
- When the user wants to return to flashcards, call show_flashcards.

DOCS AND SHEETS ARTIFACTS:
- When the user asks for a memo, notes, or document, call create_google_doc.
- When the user asks for a spreadsheet, table, tracker, or structured dataset, call create_google_sheet.
- Never use create_google_sheet or create_google_doc for a worksheet, work sheet, guided practice, printable handout, practice page, or problem set.
- If the user says "worksheet" or asks for printable or guided practice, that must route to generate_worksheet or create_worksheet, even if they also say the word "sheet".
- When the user asks for a quiz, assessment, test, exam, or practice questions, call generate_quiz.
- When the user asks for a worksheet, guided practice sheet, printable handout, practice page, or structured practice page, call generate_worksheet or create_worksheet.
- When the user asks about an uploaded PDF, worksheet file, uploaded handout, or document they added to this session, call get_current_uploaded_file_context first.
- After each artifact is generated, briefly explain what it covers and how the student should use it next. Do not respond with only a generic readiness message.

QUIZ REVIEW:
- When the user asks about the current quiz, score, results, missed questions, selected answers, correct answers, explanations, or to review the quiz, call get_current_quiz_context first.
- Use the quiz tool output as the source of truth for question wording, answer choices, correct answers, explanations, and score.
- If a quiz exists but is not submitted yet, discuss progress and selected answers, but do not proactively spoil correct answers unless the user explicitly asks for the answers or explanations.
- If no quiz is loaded, say so clearly and offer to generate one.

WORKSHEET REVIEW:
- When the user asks about the current worksheet, a specific worksheet question, their selected answers, their written response, their progress, or asks for help checking worksheet work, call get_current_worksheet_context first.
- Use the worksheet tool output as the source of truth for worksheet structure, current student responses, and the answer key.
- You may coach based on the student's live worksheet responses.
- Do not proactively reveal worksheet answers or the answer key unless the user explicitly asks for checking, solutions, or review.
- If no worksheet is loaded, say so clearly and offer to generate one.

UPLOADED FILE REVIEW:
- When the user asks what an uploaded file says, what is on the worksheet PDF, or asks for help using an uploaded handout, call get_current_uploaded_file_context first.
- Use the uploaded file tool output as the source of truth for uploaded file title, summary, and extracted tutoring text.
- If no uploaded file is loaded, say so clearly and ask them to upload one from the tab bar plus button.

ERROR HANDLING:
- If any tool fails, apologize briefly and ask whether they'd like to try again.
- If there are no flashcards loaded and the user tries to navigate cards, suggest generating a deck first.

${deckSummary}`;

const buildSystemInstruction = (
  deckSummary: string,
): NonNullable<LiveConnectConfig["systemInstruction"]> => [
  { text: buildAgentInstructions(deckSummary) },
];

const getReconnectAttemptLimit = (options?: { resumeSession?: boolean }) =>
  options?.resumeSession
    ? LIVE_MAX_RESUME_RECONNECT_ATTEMPTS
    : LIVE_MAX_TRANSIENT_RECONNECT_ATTEMPTS;

const createTurnEventId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });

const waitForUiFlush = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

export const useVoiceAgent = (
  flashcardSession: FlashcardSessionState,
  flashcardActions: FlashcardActions,
  _visualizationState: VisualizationState,
  visualizationActions: VisualizationActions,
  _deepDiveState: DeepDiveState,
  deepDiveActions: DeepDiveActions,
  quizContext: QuizSessionContext | null,
  worksheetContext: WorksheetSessionContext | null,
  uploadedFileContext: UploadedFileSessionContext | null,
  setContentView: (view: 'flashcards' | 'visualization' | 'deepdive') => void,
  onSetGoogleDoc?: (title: string, summary: string, sections: GoogleDocSection[]) => void,
  onSetGoogleSheet?: (title: string, summary: string, sheets: GoogleSheetTab[]) => void,
  onSetQuiz?: (title: string, summary: string, questions: QuizQuestion[]) => void,
  onSetWorksheet?: (artifact: {
    title: string;
    summary: string;
    instructions: string;
    estimatedTimeMinutes: number | null;
    difficulty: 'easy' | 'medium' | 'hard' | null;
    document: WorksheetDocument;
    answerKey: WorksheetAnswerKeyEntry[];
  }) => void,
  onToolEvent?: (event: VoiceToolEvent) => void,
  onTranscriptPreviewChange?: (event: VoiceTranscriptPreviewEvent | null) => void,
  onUserTurn?: (event: VoiceUserTurnEvent) => void,
  onAssistantTurn?: (event: VoiceAssistantTurnEvent) => void,
) => {
  const sessionRef = useRef<Session | null>(null);
  const sessionResumptionHandleRef = useRef<string | undefined>(undefined);
  const handleServerMessageRef = useRef<(message: LiveServerMessage) => Promise<void>>(async () => {});
  const connectAgentRef = useRef<
    (
      options?: {
        resumeSession?: boolean;
        isReconnect?: boolean;
        mode?: AgentConnectMode;
        forceStart?: boolean;
      },
    ) => Promise<void>
  >(async () => {});
  const disconnectAgentRef = useRef<() => Promise<void>>(async () => {});
  const connectionModeRef = useRef<AgentConnectMode>("voice");
  const activeInputTranscriptionRef = useRef("");
  const assistantTurnBufferRef = useRef<BufferedAssistantTurn>(
    createEmptyAssistantTurnBuffer(),
  );
  const assistantAudioReleasedRef = useRef(false);
  const assistantAudioHoldTimeoutRef = useRef<number | null>(null);
  const recentUserUtterancesRef = useRef<string[]>([]);
  const lastAssistantTurnTextRef = useRef("");
  const shouldMaintainConnectionRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const activeConnectionIdRef = useRef(0);
  const shouldResumeAfterCloseRef = useRef(false);

  const flashcardSessionRef = useRef<FlashcardSessionState>(flashcardSession);
  const quizContextRef = useRef<QuizSessionContext | null>(quizContext);
  const worksheetContextRef = useRef<WorksheetSessionContext | null>(worksheetContext);
  const uploadedFileContextRef = useRef<UploadedFileSessionContext | null>(uploadedFileContext);
  const lastArtifactToolResultRef = useRef<{
    toolName: string;
    success: boolean;
    timestamp: number;
  } | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const isMicMutedRef = useRef(false);
  const setModeRef = useRef<FlashcardActions["setMode"]>(flashcardActions.setMode);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micSinkRef = useRef<GainNode | null>(null);
  const micSampleRateRef = useRef(16000);

  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackCursorRef = useRef(0);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isMicrophoneReady, setIsMicrophoneReady] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [connectionMode, setConnectionMode] = useState<AgentConnectMode>("voice");
  const [activity, setActivity] = useState<VoiceActivity>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    flashcardSessionRef.current = flashcardSession;
  }, [flashcardSession]);

  useEffect(() => {
    quizContextRef.current = quizContext;
  }, [quizContext]);

  useEffect(() => {
    worksheetContextRef.current = worksheetContext;
  }, [worksheetContext]);

  useEffect(() => {
    uploadedFileContextRef.current = uploadedFileContext;
  }, [uploadedFileContext]);

  useEffect(() => {
    setModeRef.current = flashcardActions.setMode;
  }, [flashcardActions]);

  const clearAssistantAudioHoldTimer = useCallback(() => {
    if (assistantAudioHoldTimeoutRef.current !== null) {
      window.clearTimeout(assistantAudioHoldTimeoutRef.current);
      assistantAudioHoldTimeoutRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const requestFallbackTutorReply = useCallback(
    async (prompt: string) => {
      const response = await fetch("/api/tutor/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}\n\nAnswer directly in normal tutoring language. Do not say that you created, generated, prepared, opened, or made any artifact unless one already visibly exists.`,
          quizContext: quizContextRef.current,
          worksheetContext: worksheetContextRef.current,
          uploadedFileContext: uploadedFileContextRef.current,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        text?: string;
      };

      if (!response.ok || payload.success === false || !payload.text) {
        throw new Error(payload.error ?? "Failed to generate tutor reply.");
      }

      return payload.text.trim();
    },
    [],
  );

  const resetAssistantTurnBuffer = useCallback(() => {
    clearAssistantAudioHoldTimer();
    assistantAudioReleasedRef.current = false;
    assistantTurnBufferRef.current = createEmptyAssistantTurnBuffer();
  }, [clearAssistantAudioHoldTimer]);

  const scheduleReconnect = useCallback((
    reason: string,
    options?: { resumeSession?: boolean },
  ) => {
    if (!shouldMaintainConnectionRef.current) {
      return;
    }

    if (reconnectTimeoutRef.current !== null) {
      return;
    }

    if (reconnectAttemptsRef.current >= getReconnectAttemptLimit(options)) {
      console.error("[useVoiceAgent] giving up on reconnect", { reason });
      shouldMaintainConnectionRef.current = false;
      setError(
        options?.resumeSession
          ? "Voice agent disconnected and could not be resumed."
          : "Voice agent disconnected unexpectedly.",
      );
      statusRef.current = "error";
      setStatus("error");
      setExpiresAt(null);
      return;
    }

    reconnectAttemptsRef.current += 1;
    const attempt = reconnectAttemptsRef.current;
    console.warn("[useVoiceAgent] scheduling reconnect", {
      reason,
      attempt,
      resumeSession: options?.resumeSession === true,
      hasResumptionHandle: Boolean(sessionResumptionHandleRef.current),
    });

    statusRef.current = "connecting";
    setStatus("connecting");
    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectTimeoutRef.current = null;
      void connectAgentRef.current({
        resumeSession: options?.resumeSession === true,
        isReconnect: true,
        mode: connectionModeRef.current,
      });
    }, LIVE_RECONNECT_DELAY_MS);
  }, []);

  // Build client-safe tool instances and derive Gemini FunctionDeclarations from them.
  const adkTools = useMemo(
    () =>
      createAdkTools({
        flashcardActions,
        getFlashcardSession: () => flashcardSessionRef.current,
        visualizationActions,
        deepDiveActions,
        getCanvasAdapter: () => canvasRef.current,
        getQuizContext: () => quizContextRef.current,
        getWorksheetContext: () => worksheetContextRef.current,
        getUploadedFileContext: () => uploadedFileContextRef.current,
        getConversationContext: () => {
          const recent = recentUserUtterancesRef.current.slice(-3);
          const active = activeInputTranscriptionRef.current.trim();
          const combined = [...recent, active].filter(Boolean).join(" ").trim();
          return combined.length > 0 ? combined : undefined;
        },
        setContentView,
        onSetGoogleDoc,
        onSetGoogleSheet,
        onSetQuiz,
        onSetWorksheet,
      }),
    [
      flashcardActions,
      visualizationActions,
      deepDiveActions,
      setContentView,
      onSetGoogleDoc,
      onSetGoogleSheet,
      onSetQuiz,
      onSetWorksheet,
    ],
  );

  const adkToolMapRef = useRef<Map<string, AdkFunctionTool>>(new Map());
  const adkFunctionDeclarationsRef = useRef<FunctionDeclaration[]>([]);

  useEffect(() => {
    adkToolMapRef.current = new Map(adkTools.map((t) => [t.name, t]));
    adkFunctionDeclarationsRef.current = adkTools.map((t) => t.getDeclaration());
  }, [adkTools]);

  const stopPlaybackQueue = useCallback(() => {
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // No-op if already stopped.
      }
    }
    playbackSourcesRef.current.clear();

    const playbackContext = playbackContextRef.current;
    if (playbackContext) {
      playbackCursorRef.current = playbackContext.currentTime;
    } else {
      playbackCursorRef.current = 0;
    }
  }, []);

  const closePlayback = useCallback(async () => {
    stopPlaybackQueue();

    if (playbackContextRef.current) {
      try {
        await playbackContextRef.current.close();
      } catch {
        // Ignore close failures on teardown.
      }
    }

    playbackContextRef.current = null;
    playbackCursorRef.current = 0;
  }, [stopPlaybackQueue]);

  const ensurePlaybackContext = useCallback(async () => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext();
    }

    if (playbackContextRef.current.state === "suspended") {
      await playbackContextRef.current.resume();
    }

    return playbackContextRef.current;
  }, []);

  const queueAudioForPlayback = useCallback(
    async (base64Data: string, mimeType: string | undefined) => {
      const playbackContext = await ensurePlaybackContext();
      const sampleRate = parseSampleRateFromMimeType(mimeType, 24000);
      const pcm16 = base64ToPcm16(base64Data);
      const float32 = new Float32Array(pcm16.length);

      for (let i = 0; i < pcm16.length; i += 1) {
        float32[i] = pcm16[i] / 32768;
      }

      const audioBuffer = playbackContext.createBuffer(1, float32.length, sampleRate);
      audioBuffer.copyToChannel(float32, 0);

      const source = playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.destination);

      const startTime = Math.max(playbackContext.currentTime, playbackCursorRef.current);
      source.start(startTime);

      playbackCursorRef.current = startTime + audioBuffer.duration;
      playbackSourcesRef.current.add(source);

      source.onended = () => {
        playbackSourcesRef.current.delete(source);
      };
    },
    [ensurePlaybackContext],
  );

  const playBufferedAssistantAudio = useCallback(
    async (audioChunks: BufferedAssistantAudioChunk[]) => {
      for (const chunk of audioChunks) {
        await queueAudioForPlayback(chunk.base64Data, chunk.mimeType);
      }
    },
    [queueAudioForPlayback],
  );

  const maybeReleaseAssistantAudio = useCallback(
    async (options?: { force?: boolean; reason?: string }) => {
      if (
        connectionModeRef.current !== "voice" ||
        assistantAudioReleasedRef.current
      ) {
        return;
      }

      const bufferedTurn = assistantTurnBufferRef.current;
      if (bufferedTurn.audioChunks.length === 0) {
        return;
      }

      const partialText = bufferedTurn.transcriptText.trim();
      const validation = validateAssistantTurnText({
        text: partialText,
        functionCallNames: bufferedTurn.functionCallNames,
        toolResults: bufferedTurn.toolResults,
      });
      const hasSentenceBoundary = /[.!?]\s*$|[.!?]\s+/u.test(partialText);
      const hasEnoughContext =
        hasSentenceBoundary ||
        partialText.length >= ASSISTANT_AUDIO_MIN_RELEASE_CHARS ||
        validation.hasArtifactClaim ||
        bufferedTurn.toolResults.length > 0 ||
        bufferedTurn.functionCallNames.length > 0;

      if (!options?.force && !hasEnoughContext) {
        return;
      }

      if (validation.hasArtifactClaim && !validation.hasBacking) {
        return;
      }

      clearAssistantAudioHoldTimer();
      assistantAudioReleasedRef.current = true;
      const chunks = [...bufferedTurn.audioChunks];
      bufferedTurn.audioChunks = [];

      await playBufferedAssistantAudio(chunks);
    },
    [clearAssistantAudioHoldTimer, playBufferedAssistantAudio],
  );

  const scheduleAssistantAudioRelease = useCallback(() => {
    if (
      assistantAudioReleasedRef.current ||
      assistantAudioHoldTimeoutRef.current !== null
    ) {
      return;
    }

    assistantAudioHoldTimeoutRef.current = window.setTimeout(() => {
      assistantAudioHoldTimeoutRef.current = null;
      void maybeReleaseAssistantAudio({
        force: true,
        reason: "hold-timeout",
      });
    }, ASSISTANT_AUDIO_HOLD_MS);
  }, [maybeReleaseAssistantAudio]);

  const appendAssistantFunctionCalls = useCallback((functionCalls: FunctionCall[]) => {
    if (functionCalls.length === 0) {
      return;
    }

    const nextNames = functionCalls
      .map((call) => call.name ?? "")
      .filter(Boolean);

    if (nextNames.length === 0) {
      return;
    }

    const existing = new Set(assistantTurnBufferRef.current.functionCallNames);
    nextNames.forEach((name) => existing.add(name));
    assistantTurnBufferRef.current.functionCallNames = [...existing];
    void maybeReleaseAssistantAudio({ reason: "function-call-backing" });
  }, [maybeReleaseAssistantAudio]);

  const appendAssistantToolResult = useCallback(
    (toolName: string, success: boolean) => {
      assistantTurnBufferRef.current.toolResults.push({ toolName, success });
      void maybeReleaseAssistantAudio({ reason: "tool-result-backing" });
    },
    [maybeReleaseAssistantAudio],
  );

  const appendAssistantAudioChunk = useCallback(
    (base64Data: string, mimeType: string | undefined) => {
      if (
        connectionModeRef.current === "voice" &&
        assistantAudioReleasedRef.current
      ) {
        void queueAudioForPlayback(base64Data, mimeType);
        return;
      }

      assistantTurnBufferRef.current.audioChunks.push({ base64Data, mimeType });
      scheduleAssistantAudioRelease();
    },
    [queueAudioForPlayback, scheduleAssistantAudioRelease],
  );

  const stopMicrophoneCapture = useCallback(async () => {
    if (micProcessorRef.current) {
      micProcessorRef.current.onaudioprocess = null;
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }

    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }

    if (micSinkRef.current) {
      micSinkRef.current.disconnect();
      micSinkRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (micContextRef.current) {
      try {
        await micContextRef.current.close();
      } catch {
        // Ignore close failures on teardown.
      }
      micContextRef.current = null;
    }

    setIsMicrophoneReady(false);
  }, []);

  const rememberUserUtterance = useCallback((text: string) => {
    const normalized = text.trim();
    if (!normalized) return;

    const recentUtterances = recentUserUtterancesRef.current;
    if (recentUtterances[recentUtterances.length - 1] === normalized) {
      return;
    }

    recentUserUtterancesRef.current = [...recentUtterances, normalized].slice(-5);
  }, []);

  const getRecentUserSpeechWindow = useCallback(() => {
    const recentUtterances = recentUserUtterancesRef.current.slice(-2);
    const activeUtterance = activeInputTranscriptionRef.current.trim();

    return [...recentUtterances, activeUtterance].filter(Boolean).join(" ").trim();
  }, []);

  const isTranscriptDebugEnabled = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);

  const logTranscriptChunk = useCallback(
    (
      role: "user" | "assistant",
      incoming: string,
      assembled: string,
      options?: { finished?: boolean; reason?: string },
    ) => {
      if (!isTranscriptDebugEnabled) {
        return;
      }

      console.log("[useVoiceAgent] transcript chunk", {
        role,
        incoming: JSON.stringify(incoming),
        assembled: JSON.stringify(assembled),
        finished: options?.finished ?? false,
        reason: options?.reason,
      });
    },
    [isTranscriptDebugEnabled],
  );

  const emitTranscriptPreview = useCallback(
    (role: VoiceTranscriptPreviewEvent["role"], text: string) => {
      const previewText = text.replace(/\s+$/g, "");
      if (!previewText.trim()) {
        onTranscriptPreviewChange?.(null);
        return;
      }

      onTranscriptPreviewChange?.({
        role,
        text: previewText,
        timestamp: new Date(),
      });
    },
    [onTranscriptPreviewChange],
  );

  const flushInputTranscription = useCallback(
    (options?: { clearPreview?: boolean; reason?: string }) => {
      const finalizedText = finalizeTranscriptPreviewText(
        activeInputTranscriptionRef.current,
      );

      if (finalizedText) {
        rememberUserUtterance(finalizedText);
        onUserTurn?.({
          id: createTurnEventId(),
          text: finalizedText,
          timestamp: new Date(),
          source: connectionModeRef.current,
        });
      }

      if (finalizedText && isTranscriptDebugEnabled) {
        console.log("[useVoiceAgent] transcript flush", {
          role: "user",
          text: JSON.stringify(finalizedText),
          reason: options?.reason,
        });
      }

      activeInputTranscriptionRef.current = "";

      if (options?.clearPreview !== false) {
        onTranscriptPreviewChange?.(null);
      }
    },
    [
      isTranscriptDebugEnabled,
      onTranscriptPreviewChange,
      onUserTurn,
      rememberUserUtterance,
    ],
  );

  const finalizeAssistantTurn = useCallback(
    async (options?: {
      clearPreview?: boolean;
      reason?: string;
      allowFallback?: boolean;
      playAudio?: boolean;
      allowFunctionCallBacking?: boolean;
    }) => {
      const bufferedTurn = assistantTurnBufferRef.current;
      const rawFinalizedText = finalizeTranscriptPreviewText(
        bufferedTurn.transcriptText,
      );

      const validation = validateAssistantTurnText({
        text: rawFinalizedText,
        functionCallNames: bufferedTurn.functionCallNames,
        toolResults: bufferedTurn.toolResults,
        allowFunctionCallBacking: options?.allowFunctionCallBacking,
      });

      let finalizedText = validation.text;
      let shouldSuppressBufferedAudio = false;
      const shouldDropAudio =
        validation.shouldDropAudio ||
        (!rawFinalizedText && bufferedTurn.audioChunks.length > 0);
      const shouldUseFallback =
        validation.shouldUseFallback ||
        (!rawFinalizedText && bufferedTurn.audioChunks.length > 0);

      if (shouldUseFallback && options?.allowFallback !== false) {
        const latestPrompt =
          recentUserUtterancesRef.current[
            recentUserUtterancesRef.current.length - 1
          ] ?? "";

        if (latestPrompt) {
          try {
            const fallbackText = await requestFallbackTutorReply(latestPrompt);
            finalizedText = stripArtifactClaimSentences(fallbackText) || fallbackText;
          } catch (error) {
            console.warn(
              "[useVoiceAgent] failed to recover assistant turn with fallback",
              error,
            );
          }
        }
      }

      const latestPrompt =
        recentUserUtterancesRef.current[
          recentUserUtterancesRef.current.length - 1
        ] ?? "";

      const needsRecovery =
        bufferedTurn.functionCallNames.length === 0 &&
        bufferedTurn.toolResults.length === 0 &&
        (!finalizedText ||
          looksLikeInternalPlanningText(finalizedText) ||
          !hasRenderableAssistantText(finalizedText));

      if (needsRecovery && latestPrompt) {
        const recovery = inferArtifactRequestRecovery(
          latestPrompt,
          getRecentUserSpeechWindow(),
        );

        if (recovery) {
          try {
            const output = await runAdkTool(
              adkToolMapRef.current,
              recovery.toolName,
              recovery.args,
            );
            const success =
              typeof output.success === "boolean" ? output.success : true;
            const message =
              typeof output.message === "string"
                ? output.message
                : `${recovery.toolName} ${success ? "completed" : "failed"}`;

            lastArtifactToolResultRef.current = {
              toolName: recovery.toolName,
              success,
              timestamp: Date.now(),
            };
            appendAssistantToolResult(recovery.toolName, success);
            onToolEvent?.({
              id: `recovered-${recovery.toolName}-${Date.now()}`,
              toolName: recovery.toolName,
              requestedToolName: recovery.toolName,
              executedToolName: recovery.toolName,
              args: recovery.args,
              success,
              message,
              output,
              timestamp: new Date(),
            });

            finalizedText = message;
            shouldSuppressBufferedAudio = true;
          } catch (error) {
            console.warn(
              "[useVoiceAgent] failed to recover missing artifact tool call",
              error,
            );
          }
        } else if (
          finalizedText &&
          (!hasRenderableAssistantText(finalizedText) ||
            looksLikeInternalPlanningText(finalizedText))
        ) {
          finalizedText = "";
          shouldSuppressBufferedAudio = true;
        }
      }

      if (finalizedText && finalizedText !== lastAssistantTurnTextRef.current) {
        lastAssistantTurnTextRef.current = finalizedText;
        onAssistantTurn?.({
          id: createTurnEventId(),
          text: finalizedText,
          timestamp: new Date(),
        });
      }

      if (rawFinalizedText || bufferedTurn.audioChunks.length > 0) {
        if (isTranscriptDebugEnabled) {
          console.log("[useVoiceAgent] assistant turn finalize", {
            reason: options?.reason,
            rawText: JSON.stringify(rawFinalizedText),
            finalText: JSON.stringify(finalizedText),
            audioChunkCount: bufferedTurn.audioChunks.length,
            functionCallNames: bufferedTurn.functionCallNames,
            toolResults: bufferedTurn.toolResults,
            shouldDropAudio: shouldDropAudio || shouldSuppressBufferedAudio,
            shouldUseFallback,
          });
        }

        if (
          connectionModeRef.current === "voice" &&
          bufferedTurn.audioChunks.length > 0 &&
          !shouldDropAudio &&
          !shouldSuppressBufferedAudio &&
          options?.playAudio !== false
        ) {
          await playBufferedAssistantAudio(bufferedTurn.audioChunks);
        }
      }

      resetAssistantTurnBuffer();

      if (options?.clearPreview !== false) {
        onTranscriptPreviewChange?.(null);
      }
    },
    [
      isTranscriptDebugEnabled,
      onAssistantTurn,
      onTranscriptPreviewChange,
      playBufferedAssistantAudio,
      requestFallbackTutorReply,
      resetAssistantTurnBuffer,
      getRecentUserSpeechWindow,
      appendAssistantToolResult,
      onToolEvent,
    ],
  );

  const startMicrophoneCapture = useCallback(async (session: Session, stream: MediaStream) => {
    await stopMicrophoneCapture();

    const micContext = new AudioContext();
    await micContext.resume();

    const source = micContext.createMediaStreamSource(stream);
    const processor = micContext.createScriptProcessor(2048, 1, 1);
    const silentSink = micContext.createGain();
    silentSink.gain.value = 0;

    source.connect(processor);
    processor.connect(silentSink);
    silentSink.connect(micContext.destination);

    micSampleRateRef.current = micContext.sampleRate;

    processor.onaudioprocess = (event) => {
      if (isMicMutedRef.current || statusRef.current !== "connected") {
        return;
      }

      const input = event.inputBuffer.getChannelData(0);
      if (input.length === 0) {
        return;
      }

      session.sendRealtimeInput({
        audio: {
          data: float32ToPcm16Base64(input),
          mimeType: `audio/pcm;rate=${micSampleRateRef.current}`,
        },
      });
    };

    micStreamRef.current = stream;
    micContextRef.current = micContext;
    micSourceRef.current = source;
    micProcessorRef.current = processor;
    micSinkRef.current = silentSink;

    setIsMicrophoneReady(true);
  }, [stopMicrophoneCapture]);

  const handleToolCalls = useCallback(async (functionCalls: FunctionCall[]) => {
    const session = sessionRef.current;
    if (!session || functionCalls.length === 0) return;

    console.log("[useVoiceAgent] handleToolCalls", functionCalls.map((c) => c.name));

    const responses = await Promise.all(
      functionCalls.map(async (call) => {
        const toolName = call.name ?? "";
        const args =
          call.args && typeof call.args === "object"
            ? (call.args as Record<string, unknown>)
            : {};

        if (toolName === "generate_flashcards") {
          const recentUserSpeech = getRecentUserSpeechWindow();

          if (
            recentUserSpeech &&
            !isExplicitFlashcardRequest(recentUserSpeech)
          ) {
            const message =
              "Do not generate flashcards unless the user explicitly asks for flashcards or a study deck.";
            console.warn("[useVoiceAgent] blocked generate_flashcards", {
              recentUserSpeech,
              args,
            });
            onToolEvent?.({
              id: call.id ?? `${toolName}-${Date.now()}`,
              toolName,
              requestedToolName: toolName,
              executedToolName: toolName,
              args,
              success: false,
              message,
              timestamp: new Date(),
            });
            return { id: call.id, name: toolName, response: { error: message } };
          }
        }

        if (toolName === "edit_canvas") {
          const recentUserSpeech = getRecentUserSpeechWindow();
          const intentText = [
            recentUserSpeech,
            typeof args.goal === "string" ? args.goal : "",
            typeof args.context === "string" ? args.context : "",
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

          if (
            intentText &&
            !isExplicitCanvasEditRequest(intentText) &&
            isCanvasInspectionRequest(intentText)
          ) {
            console.warn("[useVoiceAgent] rerouting edit_canvas to snapshot", {
              recentUserSpeech,
              args,
            });
            const output = await runAdkTool(adkToolMapRef.current, "get_canvas_snapshot", {
              conversationContext: recentUserSpeech,
            });
            const message =
              typeof output.message === "string"
                ? output.message
                : "Inspection request detected. No canvas edits applied.";
            onToolEvent?.({
              id: call.id ?? `${toolName}-${Date.now()}`,
              toolName: "get_canvas_snapshot",
              requestedToolName: toolName,
              executedToolName: "get_canvas_snapshot",
              args,
              success: true,
              message,
              output,
              timestamp: new Date(),
            });
            return { id: call.id, name: toolName, response: { output } };
          }
        }

        try {
          // Dispatch via the client-safe tool map while preserving Gemini function declarations.
          const output = await runAdkTool(adkToolMapRef.current, toolName, args);
          const success = typeof output.success === "boolean" ? output.success : true;
          const message = typeof output.message === "string" ? output.message : `${toolName} ${success ? "completed" : "failed"}`;
          lastArtifactToolResultRef.current = {
            toolName,
            success,
            timestamp: Date.now(),
          };
          appendAssistantToolResult(toolName, success);

          onToolEvent?.({
            id: call.id ?? `${toolName}-${Date.now()}`,
            toolName,
            requestedToolName: toolName,
            executedToolName: toolName,
            args,
            success,
            message,
            output,
            timestamp: new Date(),
          });
          return { id: call.id, name: toolName, response: { output } };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown tool error";
          lastArtifactToolResultRef.current = {
            toolName,
            success: false,
            timestamp: Date.now(),
          };
          appendAssistantToolResult(toolName, false);
          onToolEvent?.({
            id: call.id ?? `${toolName}-${Date.now()}`,
            toolName,
            requestedToolName: toolName,
            executedToolName: toolName,
            args,
            success: false,
            message,
            timestamp: new Date(),
          });
          return { id: call.id, name: toolName, response: { error: message } };
        }
      }),
    );

    console.log("[useVoiceAgent] sending tool responses", responses.map((response) => ({
      id: response.id,
      name: response.name,
      hasOutput: "output" in response.response,
      hasError: "error" in response.response,
    })));
    session.sendToolResponse({ functionResponses: responses });
    console.log("[useVoiceAgent] tool responses sent", responses.map((response) => response.name));
  }, [appendAssistantToolResult, getRecentUserSpeechWindow, onToolEvent]);

  const handleServerMessage = useCallback(
    async (message: LiveServerMessage) => {
      // Log any message that contains a tool call or function call reference
      const msgKeys = Object.keys(message).filter((k) => message[k as keyof LiveServerMessage] !== undefined && message[k as keyof LiveServerMessage] !== null);
      if (msgKeys.some((k) => k.toLowerCase().includes("tool") || k.toLowerCase().includes("function"))) {
        console.log("[useVoiceAgent] message with tool/function key", { keys: msgKeys, message });
      }

      const content = message.serverContent;
      const resumptionUpdate = message.sessionResumptionUpdate;
      const toolCallFcs = message.toolCall?.functionCalls ?? [];
      const partFcs: FunctionCall[] = (content?.modelTurn?.parts ?? [])
        .filter((p) => p.functionCall != null)
        .map((p) => p.functionCall as FunctionCall);
      const functionCalls = [...toolCallFcs, ...partFcs];
      appendAssistantFunctionCalls(functionCalls);

      const inputTranscription = content?.inputTranscription;
      if (inputTranscription?.text) {
        if (
          assistantTurnBufferRef.current.transcriptText ||
          assistantTurnBufferRef.current.audioChunks.length > 0
        ) {
          await finalizeAssistantTurn({
            clearPreview: false,
            reason: "input-transcription-started",
            playAudio: false,
          });
        }

        const transcriptionText = mergeTranscriptPreviewText(
          activeInputTranscriptionRef.current,
          inputTranscription.text,
        );
        if (transcriptionText) {
          activeInputTranscriptionRef.current = transcriptionText;
          setActivity("listening");
          emitTranscriptPreview("user", transcriptionText);
          logTranscriptChunk("user", inputTranscription.text, transcriptionText, {
            finished: inputTranscription.finished ?? false,
          });
        }
      }
      if (inputTranscription?.finished) {
        flushInputTranscription({ reason: "input-finished" });
        setActivity("idle");
      }

      const outputTranscription = content?.outputTranscription;
      const hasOutputTranscriptionEvent = Boolean(
        outputTranscription?.text || outputTranscription?.finished,
      );
      if (outputTranscription?.text) {
        if (activeInputTranscriptionRef.current) {
          flushInputTranscription({
            clearPreview: false,
            reason: "output-transcription-started",
          });
        }

        const transcriptionText = mergeTranscriptPreviewText(
          assistantTurnBufferRef.current.transcriptText,
          outputTranscription.text,
        );
        if (transcriptionText) {
          assistantTurnBufferRef.current.transcriptText = transcriptionText;
          setActivity("speaking");
          onTranscriptPreviewChange?.(null);
          void maybeReleaseAssistantAudio({
            reason: "output-transcription",
          });
          logTranscriptChunk(
            "assistant",
            outputTranscription.text,
            transcriptionText,
            {
              finished: outputTranscription.finished ?? false,
            },
          );
        }
      }

      if (content?.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          const inlineData = part.inlineData;
          if (!inlineData?.data) {
            continue;
          }

          if (
            inlineData.mimeType?.startsWith("audio/") &&
            connectionModeRef.current === "voice"
          ) {
            appendAssistantAudioChunk(inlineData.data, inlineData.mimeType);
          }
        }
      }

      if (connectionModeRef.current === "text" && !hasOutputTranscriptionEvent) {
        const assistantText = (content?.modelTurn?.parts ?? [])
          .flatMap((part) =>
            typeof part.text === "string" ? [part.text.trim()] : [],
          )
          .filter((text) => text.length > 0)
          .join("\n")
          .trim();

        if (
          assistantText &&
          functionCalls.length === 0 &&
          !looksLikeInternalPlanningText(assistantText)
        ) {
          const validation = validateAssistantTurnText({
            text: assistantText,
            functionCallNames: functionCalls
              .map((call) => call.name ?? "")
              .filter(Boolean),
            toolResults: lastArtifactToolResultRef.current
              ? [
                  {
                    toolName: lastArtifactToolResultRef.current.toolName,
                    success: lastArtifactToolResultRef.current.success,
                  },
                ]
              : [],
          });

          if (validation.shouldUseFallback) {
            console.warn("[useVoiceAgent] suppressing unbacked artifact claim", {
              assistantText,
            });

            const latestPrompt =
              recentUserUtterancesRef.current[
                recentUserUtterancesRef.current.length - 1
              ] ?? "";

            if (latestPrompt) {
              try {
                const fallbackText = await requestFallbackTutorReply(latestPrompt);
                const safeFallbackText =
                  stripArtifactClaimSentences(fallbackText) || fallbackText;
                if (
                  safeFallbackText &&
                  safeFallbackText !== lastAssistantTurnTextRef.current
                ) {
                  lastAssistantTurnTextRef.current = safeFallbackText;
                  onAssistantTurn?.({
                    id: createTurnEventId(),
                    text: safeFallbackText,
                    timestamp: new Date(),
                  });
                }
              } catch (error) {
                console.warn(
                  "[useVoiceAgent] failed to replace unbacked artifact claim",
                  error,
                );
              }
            }
          } else if (
            validation.text &&
            validation.text !== lastAssistantTurnTextRef.current
          ) {
            lastAssistantTurnTextRef.current = validation.text;
            onAssistantTurn?.({
              id: createTurnEventId(),
              text: validation.text,
              timestamp: new Date(),
            });
          }
        }

        setActivity("idle");
        onTranscriptPreviewChange?.(null);
      }

      // Log all non-audio parts for debugging tool dispatch
      if (content?.modelTurn?.parts) {
        const nonAudio = content.modelTurn.parts.filter((p) => !p.inlineData?.mimeType?.startsWith("audio/"));
        if (nonAudio.length > 0) {
          console.log("[useVoiceAgent] modelTurn non-audio parts", nonAudio);
        }
      }

      if (resumptionUpdate?.resumable && resumptionUpdate.newHandle) {
        sessionResumptionHandleRef.current = resumptionUpdate.newHandle;
      }

      if (message.goAway) {
        shouldResumeAfterCloseRef.current = true;
        console.warn("[useVoiceAgent] server goAway received", {
          timeLeft: message.goAway.timeLeft,
          hasResumptionHandle: Boolean(sessionResumptionHandleRef.current),
        });
      }

      if (content?.interrupted) {
        stopPlaybackQueue();
        resetAssistantTurnBuffer();
        if (!inputTranscription?.text && !inputTranscription?.finished) {
          onTranscriptPreviewChange?.(null);
          setActivity("idle");
        }
      }

      if (message.toolCall) {
        console.log("[useVoiceAgent] toolCall message received", {
          functionCalls: message.toolCall.functionCalls?.map((c) => ({ name: c.name, args: c.args })),
        });
      }
      if (partFcs.length > 0) {
        console.log("[useVoiceAgent] functionCall parts in modelTurn", partFcs.map((c) => ({ name: c.name, args: c.args })));
      }

      if (functionCalls.length > 0) {
        if (
          assistantTurnBufferRef.current.transcriptText ||
          assistantTurnBufferRef.current.audioChunks.length > 0
        ) {
          await finalizeAssistantTurn({
            reason: "tool-call-start",
            allowFallback: false,
            allowFunctionCallBacking: false,
          });
        }
        await handleToolCalls(functionCalls);
      }

      if (outputTranscription?.finished) {
        await finalizeAssistantTurn({ reason: "output-finished" });
        setActivity("idle");
      } else if (
        (assistantTurnBufferRef.current.transcriptText ||
          assistantTurnBufferRef.current.audioChunks.length > 0) &&
        (content?.generationComplete || content?.turnComplete)
      ) {
        await finalizeAssistantTurn({
          reason: content.generationComplete
            ? "generation-complete"
            : "turn-complete",
        });
        setActivity("idle");
      }
    },
    [
      appendAssistantAudioChunk,
      appendAssistantFunctionCalls,
      emitTranscriptPreview,
      finalizeAssistantTurn,
      flushInputTranscription,
      handleToolCalls,
      logTranscriptChunk,
      maybeReleaseAssistantAudio,
      onAssistantTurn,
      onTranscriptPreviewChange,
      requestFallbackTutorReply,
      resetAssistantTurnBuffer,
      stopPlaybackQueue,
    ],
  );

  // Keep the ref in sync so the Gemini session's onmessage always calls the latest version.
  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  const disconnectAgent = useCallback(async () => {
    if (isTranscriptDebugEnabled) {
      console.log("[useVoiceAgent] disconnectAgent:start", {
        statusRef: statusRef.current,
        hasSession: Boolean(sessionRef.current),
      });
    }
    shouldMaintainConnectionRef.current = false;
    reconnectAttemptsRef.current = 0;
    sessionResumptionHandleRef.current = undefined;
    shouldResumeAfterCloseRef.current = false;
    connectionModeRef.current = "voice";
    setConnectionMode("voice");
    flushInputTranscription({ clearPreview: false, reason: "disconnect" });
    await finalizeAssistantTurn({
      clearPreview: false,
      reason: "disconnect",
      playAudio: false,
    });
    lastAssistantTurnTextRef.current = "";
    onTranscriptPreviewChange?.(null);
    clearReconnectTimer();
    activeConnectionIdRef.current += 1;

    const session = sessionRef.current;
    sessionRef.current = null;

    if (session) {
      try {
        session.close();
      } catch {
        // Ignore close failures on teardown.
      }
    }

    await stopMicrophoneCapture();
    await closePlayback();

    isMicMutedRef.current = false;
    setIsMicMuted(false);
    setModeRef.current("idle");
    statusRef.current = "idle";
    setActivity("idle");
    setStatus("idle");
    setExpiresAt(null);
  }, [
    clearReconnectTimer,
    closePlayback,
    finalizeAssistantTurn,
    flushInputTranscription,
    isTranscriptDebugEnabled,
    onTranscriptPreviewChange,
    stopMicrophoneCapture,
  ]);

  const connectAgent = useCallback(async (options?: {
    resumeSession?: boolean;
    isReconnect?: boolean;
    mode?: AgentConnectMode;
    forceStart?: boolean;
  }) => {
    const forceStart = options?.forceStart === true;
    const hasLiveSession = Boolean(sessionRef.current);

    if (isTranscriptDebugEnabled) {
      console.log("[useVoiceAgent] connectAgent:start", {
        statusRef: statusRef.current,
        stateStatus: status,
        hasLiveSession,
        mode: options?.mode,
        forceStart,
        isReconnect: options?.isReconnect === true,
        resumeSession: options?.resumeSession === true,
      });
    }

    if (
      !forceStart &&
      (statusRef.current === "connecting" ||
        (statusRef.current === "connected" && hasLiveSession))
    ) {
      if (isTranscriptDebugEnabled) {
        console.log("[useVoiceAgent] connectAgent:early-return", {
          reason: "already-active",
          statusRef: statusRef.current,
          hasLiveSession,
        });
      }
      return;
    }

    if (
      forceStart &&
      (statusRef.current === "connecting" ||
        statusRef.current === "connected") &&
      !hasLiveSession
    ) {
      clearReconnectTimer();
      reconnectAttemptsRef.current = 0;
      shouldResumeAfterCloseRef.current = false;
      setExpiresAt(null);
      statusRef.current = "idle";
      setStatus("idle");
    }

    const resumeSession = options?.resumeSession === true;
    const isReconnect = options?.isReconnect === true;
    const mode =
      options?.mode ?? (options?.isReconnect ? connectionModeRef.current : "voice");
    const useMicrophone = shouldRequestMicrophone(mode);

    connectionModeRef.current = mode;
    setConnectionMode(mode);

    shouldMaintainConnectionRef.current = true;
    clearReconnectTimer();

    if (!resumeSession) {
      sessionResumptionHandleRef.current = undefined;
      activeInputTranscriptionRef.current = "";
      resetAssistantTurnBuffer();
      recentUserUtterancesRef.current = [];
      lastAssistantTurnTextRef.current = "";
      onTranscriptPreviewChange?.(null);
      reconnectAttemptsRef.current = 0;
      shouldResumeAfterCloseRef.current = false;
      setActivity("idle");
    }

    statusRef.current = useMicrophone ? "requesting-permission" : "connecting";
    setStatus(useMicrophone ? "requesting-permission" : "connecting");
    if (isTranscriptDebugEnabled) {
      console.log("[useVoiceAgent] connectAgent:status-set", {
        nextStatus: useMicrophone ? "requesting-permission" : "connecting",
        useMicrophone,
      });
    }
    if (!isReconnect) {
      setError(null);
    }

    // Yield once so React can paint the busy state before the browser
    // opens microphone permission UI or we start the live connection work.
    await waitForUiFlush();

    let permissionStream: MediaStream | null = null;
    const connectionId = activeConnectionIdRef.current + 1;
    activeConnectionIdRef.current = connectionId;
    const shouldAbortForStaleConnection = () => {
      if (activeConnectionIdRef.current === connectionId) {
        return false;
      }

      if (forceStart) {
        if (isTranscriptDebugEnabled) {
          console.log("[useVoiceAgent] connectAgent:reclaiming-stale-connection", {
            activeConnectionId: activeConnectionIdRef.current,
            connectionId,
          });
        }
        activeConnectionIdRef.current = connectionId;
        return false;
      }

      return true;
    };

    try {
      if (useMicrophone) {
        if (isTranscriptDebugEnabled) {
          console.log("[useVoiceAgent] connectAgent:getUserMedia:start");
        }
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (isTranscriptDebugEnabled) {
          console.log("[useVoiceAgent] connectAgent:getUserMedia:done");
        }
      }

      if (shouldAbortForStaleConnection()) {
        if (isTranscriptDebugEnabled) {
          console.log("[useVoiceAgent] connectAgent:stale-after-permission", {
            activeConnectionId: activeConnectionIdRef.current,
            connectionId,
          });
        }
        stopMediaStreamTracks(permissionStream);
        return;
      }

      if (useMicrophone) {
        statusRef.current = "connecting";
        setStatus("connecting");
        if (isTranscriptDebugEnabled) {
          console.log("[useVoiceAgent] connectAgent:status-set", {
            nextStatus: "connecting",
            reason: "post-permission",
          });
        }
      }

      if (isTranscriptDebugEnabled) {
        console.log("[useVoiceAgent] connectAgent:token-fetch:start");
      }

      const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (isTranscriptDebugEnabled) {
        console.log("[useVoiceAgent] connectAgent:token-fetch:done", {
          ok: tokenResponse.ok,
          status: tokenResponse.status,
        });
      }

      if (!tokenResponse.ok) {
        throw new Error("Failed to obtain Gemini ephemeral token");
      }

      const { ephemeralKey, expiresAt: expiresAtIso } =
        (await tokenResponse.json()) as EphemeralKeyResponse;

      const cardCount = flashcardSessionRef.current.cards.length;
      const deckSummary = cardCount
        ? `There are currently ${cardCount} flashcards loaded.`
        : "There are currently no flashcards loaded.";
      const functionDeclarations = [...adkFunctionDeclarationsRef.current];

      const ai = new GoogleGenAI({
        apiKey: ephemeralKey,
        apiVersion: "v1alpha",
      });

      console.log("[useVoiceAgent] connecting live session", {
        model: LIVE_MODEL,
        mode,
        resumeSession,
        hasResumptionHandle: Boolean(sessionResumptionHandleRef.current),
        toolCount: functionDeclarations.length,
        toolNames: functionDeclarations.map((declaration) => declaration.name ?? "<unnamed>"),
      });

      const liveConfig: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemInstruction(deckSummary),
        ...(functionDeclarations.length > 0
          ? {
              tools: [{ functionDeclarations }],
            }
          : {}),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        ...(LIVE_ENABLE_SESSION_RESUMPTION
          ? {
              sessionResumption: {
                handle: sessionResumptionHandleRef.current,
              },
            }
          : {}),
        ...(LIVE_CONTEXT_COMPRESSION_TRIGGER
          ? {
              contextWindowCompression: {
                triggerTokens: LIVE_CONTEXT_COMPRESSION_TRIGGER,
                ...(LIVE_CONTEXT_COMPRESSION_TARGET
                  ? {
                      slidingWindow: {
                        targetTokens: LIVE_CONTEXT_COMPRESSION_TARGET,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      };

      const session = await withTimeout(
        ai.live.connect({
          model: LIVE_MODEL,
          config: liveConfig,
          callbacks: {
            onmessage: (event) => {
              if (activeConnectionIdRef.current !== connectionId) {
                return;
              }
              void handleServerMessageRef.current(event);
            },
            onerror: (event) => {
              if (activeConnectionIdRef.current !== connectionId) {
                return;
              }
              const message = sanitizeLiveErrorMessage(
                event.error?.message,
                "Voice agent disconnected unexpectedly.",
              );
              console.error("[useVoiceAgent] live session error", event.error ?? event);
              setError(message);
              if (!shouldMaintainConnectionRef.current) {
                statusRef.current = "error";
                setStatus("error");
              }
            },
            onclose: (event) => {
              if (activeConnectionIdRef.current !== connectionId) {
                return;
              }
              const shouldResumeAfterClose = shouldResumeAfterCloseRef.current;
              shouldResumeAfterCloseRef.current = false;
              console.warn("[useVoiceAgent] live session closed", {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
                hasResumptionHandle: Boolean(sessionResumptionHandleRef.current),
                shouldResumeAfterClose,
              });
              sessionRef.current = null;
              resetAssistantTurnBuffer();
              void stopMicrophoneCapture();
              void closePlayback();
              setIsMicMuted(false);
              isMicMutedRef.current = false;
              setActivity("idle");

              if (shouldMaintainConnectionRef.current && shouldResumeAfterClose) {
                setExpiresAt(null);
                scheduleReconnect(`close:${event.code}:${event.reason || "no-reason"}`, {
                  resumeSession: true,
                });
                return;
              }

              setExpiresAt(null);
              if (
                shouldMaintainConnectionRef.current &&
                shouldRetryLiveClose(event)
              ) {
                scheduleReconnect(`close:${event.code}:${event.reason || "no-reason"}`, {
                  resumeSession: false,
                });
                return;
              }

              if (shouldMaintainConnectionRef.current) {
                shouldMaintainConnectionRef.current = false;
                setError(getLiveDisconnectMessage(event));
                statusRef.current = "error";
                setStatus("error");
                return;
              }

              if (statusRef.current !== "error") {
                statusRef.current = "idle";
                setStatus("idle");
              }
            },
          },
        }),
        LIVE_CONNECT_TIMEOUT_MS,
        "Voice connection timed out before Gemini Live became ready. Try again or switch to text mode.",
      );

      if (shouldAbortForStaleConnection()) {
        stopMediaStreamTracks(permissionStream);
        try {
          session.close();
        } catch {
          // Ignore race during teardown.
        }
        return;
      }

      sessionRef.current = session;
      if (useMicrophone && permissionStream) {
        await startMicrophoneCapture(session, permissionStream);
        permissionStream = null;
      } else {
        setIsMicrophoneReady(false);
      }

      if (sessionRef.current !== session) {
        throw new Error("Live session closed before microphone startup completed");
      }

      setExpiresAt(new Date(expiresAtIso));
      setError(null);
      statusRef.current = "connected";
      setStatus("connected");
      setModeRef.current("idle");
      reconnectAttemptsRef.current = 0;
    } catch (err) {
      stopMediaStreamTracks(permissionStream);
      const message =
        sanitizeLiveErrorMessage(
          err instanceof Error ? err.message : null,
          "Failed to connect to voice agent",
        );
      console.error("[useVoiceAgent] failed to connect voice agent", err);
      if (activeConnectionIdRef.current === connectionId) {
        activeConnectionIdRef.current += 1;
      }
      sessionRef.current = null;
      resetAssistantTurnBuffer();
      await stopMicrophoneCapture();
      await closePlayback();
      setIsMicMuted(false);
      isMicMutedRef.current = false;
      setModeRef.current("idle");
      setActivity("idle");
      setExpiresAt(null);
      onTranscriptPreviewChange?.(null);

      if (
        shouldMaintainConnectionRef.current &&
        isReconnect &&
        reconnectAttemptsRef.current < getReconnectAttemptLimit({
          resumeSession: LIVE_ENABLE_SESSION_RESUMPTION && resumeSession,
        })
      ) {
        setError(message);
        scheduleReconnect(`connect-failure:${message}`, {
          resumeSession: LIVE_ENABLE_SESSION_RESUMPTION && resumeSession,
        });
        return;
      }

      shouldMaintainConnectionRef.current = false;
      setError(message);
      statusRef.current = "error";
      setStatus("error");
      setModeRef.current("idle");
    }
  }, [
    clearReconnectTimer,
    closePlayback,
    isTranscriptDebugEnabled,
    onTranscriptPreviewChange,
    resetAssistantTurnBuffer,
    scheduleReconnect,
    startMicrophoneCapture,
    status,
    stopMicrophoneCapture,
  ]);

  useEffect(() => {
    connectAgentRef.current = connectAgent;
  }, [connectAgent]);

  useEffect(() => {
    disconnectAgentRef.current = disconnectAgent;
  }, [disconnectAgent]);

  const sendTextTurn = useCallback(async (prompt: string) => {
    const normalizedPrompt = dispatchTextTurn({
      prompt,
      session: sessionRef.current,
      status: statusRef.current,
      rememberUserUtterance,
      clearActiveInput: () => {
        activeInputTranscriptionRef.current = "";
      },
    });
    onUserTurn?.({
      id: createTurnEventId(),
      text: normalizedPrompt,
      timestamp: new Date(),
      source: "text",
    });
    setActivity("listening");
  }, [onUserTurn, rememberUserUtterance]);

  const runTool = useCallback(
    async (toolName: string, args: Record<string, unknown> = {}) => {
      const output = await runAdkTool(adkToolMapRef.current, toolName, args);
      const success =
        typeof output.success === "boolean" ? output.success : true;
      const message =
        typeof output.message === "string"
          ? output.message
          : `${toolName} ${success ? "completed" : "failed"}`;

      onToolEvent?.({
        id: `direct-${toolName}-${Date.now()}`,
        toolName,
        requestedToolName: toolName,
        executedToolName: toolName,
        args,
        success,
        message,
        output,
        timestamp: new Date(),
      });

      return output;
    },
    [onToolEvent],
  );

  const getStatus = useCallback(() => statusRef.current, []);

  const toggleMic = useCallback(() => {
    if (!sessionRef.current || statusRef.current !== "connected") {
      return;
    }

    setIsMicMuted((prev) => {
      const next = !prev;
      isMicMutedRef.current = next;

      if (next) {
        sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
      }

      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      void disconnectAgentRef.current();
    };
  }, []);

  return {
    session: sessionRef.current,
    status,
    error,
    expiresAt,
    isMicrophoneReady,
    isMicMuted,
    connectionMode,
    activity,
    connectAgent,
    disconnectAgent,
    sendTextTurn,
    runTool,
    getStatus,
    toggleMic,
  };
};

export type UseVoiceAgentReturn = ReturnType<typeof useVoiceAgent>;
