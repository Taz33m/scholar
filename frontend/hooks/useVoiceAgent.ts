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
  shouldRetryLiveClose,
} from "@/lib/live-reconnect-policy";
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

const looksLikeInternalPlanningText = (text: string) => {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith("**clarifying") ||
    normalized.startsWith("**formulating") ||
    normalized.startsWith("**planning") ||
    normalized.startsWith("**thinking") ||
    normalized.startsWith("**tool") ||
    /\bmy goal is to\b/.test(normalized) ||
    /\bi(?:'|’)m (?:focused on|now focused on|going to|crafting|formulating|preparing|planning)\b/.test(
      normalized,
    )
  );
};

const buildAgentInstructions = (deckSummary: string) => `You are an encouraging and knowledgeable teaching assistant. Always respond in English. Be warm, clear, and concise while helping students learn.

CRITICAL RULE: You have tools. ALWAYS use the correct tool instead of describing content verbally. Never recite flashcard content, diagram content, or document content out loud — always call the appropriate tool and let the UI display it.
Speak directly to the student. Never narrate your internal planning, reasoning, tool selection, or what you are about to do. Do not use meta headings like "Clarifying..." or "Formulating...". Give the actual tutoring response.

FLASHCARD MANAGEMENT:
- When the user asks for flashcards on any topic, you MUST call generate_flashcards immediately. Do not describe or recite flashcard content verbally.
- Do NOT proactively suggest flashcards unless the user asks.
- Never call generate_flashcards for greetings, general tutoring, topic explanations, summaries, deep dives, or because no flashcards are loaded yet.
- Treat flashcards as explicit-only: the user must clearly ask for flashcards, study cards, review cards, an Anki deck, or to create/make/generate a deck or cards.
- Call generate_flashcards with the topic (and focus if provided). The cards will appear on screen automatically.
- After the tool returns, say only how many cards were created and invite the user to start reviewing.
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
- After generating, tell the user the visualization is ready.
- When the user wants to return to flashcards, call show_flashcards.

DEEP DIVE GENERATION:
- When the user asks for a deep dive, comprehensive overview, or detailed explanation, call generate_deep_dive.
- Build the topic parameter with full context. If the user references the canvas, embed that context (example: "photosynthesis, focusing on the chloroplast structure the student drew").
- Include relevant conversation context in the topic so the output stays grounded.
- After generating, tell the user the deep dive is ready.
- When the user wants to return to flashcards, call show_flashcards.

DOCS AND SHEETS ARTIFACTS:
- When the user asks for a memo, notes, or document, call create_google_doc.
- When the user asks for a spreadsheet, table, tracker, or structured dataset, call create_google_sheet.
- When the user asks for a quiz, assessment, test, exam, or practice questions, call generate_quiz.
- After each artifact is generated, confirm it is ready in the corresponding tab.

QUIZ REVIEW:
- When the user asks about the current quiz, score, results, missed questions, selected answers, correct answers, explanations, or to review the quiz, call get_current_quiz_context first.
- Use the quiz tool output as the source of truth for question wording, answer choices, correct answers, explanations, and score.
- If a quiz exists but is not submitted yet, discuss progress and selected answers, but do not proactively spoil correct answers unless the user explicitly asks for the answers or explanations.
- If no quiz is loaded, say so clearly and offer to generate one.

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

export const useVoiceAgent = (
  flashcardSession: FlashcardSessionState,
  flashcardActions: FlashcardActions,
  _visualizationState: VisualizationState,
  visualizationActions: VisualizationActions,
  _deepDiveState: DeepDiveState,
  deepDiveActions: DeepDiveActions,
  quizContext: QuizSessionContext | null,
  setContentView: (view: 'flashcards' | 'visualization' | 'deepdive') => void,
  onSetGoogleDoc?: (title: string, summary: string, sections: GoogleDocSection[]) => void,
  onSetGoogleSheet?: (title: string, summary: string, sheets: GoogleSheetTab[]) => void,
  onSetQuiz?: (title: string, summary: string, questions: QuizQuestion[]) => void,
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
      },
    ) => Promise<void>
  >(async () => {});
  const connectionModeRef = useRef<AgentConnectMode>("voice");
  const activeInputTranscriptionRef = useRef("");
  const activeOutputTranscriptionRef = useRef("");
  const recentUserUtterancesRef = useRef<string[]>([]);
  const lastAssistantTurnTextRef = useRef("");
  const shouldMaintainConnectionRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const activeConnectionIdRef = useRef(0);
  const shouldResumeAfterCloseRef = useRef(false);

  const flashcardSessionRef = useRef<FlashcardSessionState>(flashcardSession);
  const quizContextRef = useRef<QuizSessionContext | null>(quizContext);
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
    setModeRef.current = flashcardActions.setMode;
  }, [flashcardActions]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

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
      }),
    [
      flashcardActions,
      visualizationActions,
      deepDiveActions,
      setContentView,
      onSetGoogleDoc,
      onSetGoogleSheet,
      onSetQuiz,
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
  }, [getRecentUserSpeechWindow, onToolEvent]);

  const handleServerMessage = useCallback(
    async (message: LiveServerMessage) => {
      // Log any message that contains a tool call or function call reference
      const msgKeys = Object.keys(message).filter((k) => message[k as keyof LiveServerMessage] !== undefined && message[k as keyof LiveServerMessage] !== null);
      if (msgKeys.some((k) => k.toLowerCase().includes("tool") || k.toLowerCase().includes("function"))) {
        console.log("[useVoiceAgent] message with tool/function key", { keys: msgKeys, message });
      }

      const content = message.serverContent;
      const resumptionUpdate = message.sessionResumptionUpdate;

      const inputTranscription = content?.inputTranscription;
      if (inputTranscription?.text) {
        const transcriptionText = inputTranscription.text.trim();
        if (transcriptionText) {
          activeInputTranscriptionRef.current = transcriptionText;
          setActivity("listening");
          onTranscriptPreviewChange?.({
            role: "user",
            text: transcriptionText,
            timestamp: new Date(),
          });
          console.log("[useVoiceAgent] input transcription", {
            text: transcriptionText,
            finished: inputTranscription.finished ?? false,
          });
        }
      }
      if (inputTranscription?.finished) {
        const finalizedText =
          inputTranscription.text?.trim() || activeInputTranscriptionRef.current.trim();
        if (finalizedText) {
          rememberUserUtterance(finalizedText);
          onUserTurn?.({
            id: createTurnEventId(),
            text: finalizedText,
            timestamp: new Date(),
            source: connectionModeRef.current,
          });
        }
        activeInputTranscriptionRef.current = "";
        onTranscriptPreviewChange?.(null);
        setActivity("idle");
      }

      const outputTranscription = content?.outputTranscription;
      const hasOutputTranscriptionEvent = Boolean(
        outputTranscription?.text || outputTranscription?.finished,
      );
      if (outputTranscription?.text) {
        const transcriptionText = outputTranscription.text.trim();
        if (transcriptionText) {
          activeOutputTranscriptionRef.current = transcriptionText;
          setActivity("speaking");
          onTranscriptPreviewChange?.({
            role: "assistant",
            text: transcriptionText,
            timestamp: new Date(),
          });
          console.log("[useVoiceAgent] output transcription", {
            text: transcriptionText,
            finished: outputTranscription.finished ?? false,
          });
        }
      }
      if (outputTranscription?.finished) {
        const finalizedText =
          outputTranscription.text?.trim() ||
          activeOutputTranscriptionRef.current.trim();
        if (
          finalizedText &&
          finalizedText !== lastAssistantTurnTextRef.current
        ) {
          lastAssistantTurnTextRef.current = finalizedText;
          onAssistantTurn?.({
            id: createTurnEventId(),
            text: finalizedText,
            timestamp: new Date(),
          });
        }
        activeOutputTranscriptionRef.current = "";
        onTranscriptPreviewChange?.(null);
        setActivity("idle");
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
          !looksLikeInternalPlanningText(assistantText) &&
          assistantText !== lastAssistantTurnTextRef.current
        ) {
          lastAssistantTurnTextRef.current = assistantText;
          onAssistantTurn?.({
            id: createTurnEventId(),
            text: assistantText,
            timestamp: new Date(),
          });
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
        onTranscriptPreviewChange?.(null);
        setActivity("idle");
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
            await queueAudioForPlayback(inlineData.data, inlineData.mimeType);
          }
        }
      }

      // Collect function calls from both message.toolCall and modelTurn parts
      const toolCallFcs = message.toolCall?.functionCalls ?? [];
      const partFcs: FunctionCall[] = (content?.modelTurn?.parts ?? [])
        .filter((p) => p.functionCall != null)
        .map((p) => p.functionCall as FunctionCall);

      if (message.toolCall) {
        console.log("[useVoiceAgent] toolCall message received", {
          functionCalls: message.toolCall.functionCalls?.map((c) => ({ name: c.name, args: c.args })),
        });
      }
      if (partFcs.length > 0) {
        console.log("[useVoiceAgent] functionCall parts in modelTurn", partFcs.map((c) => ({ name: c.name, args: c.args })));
      }

      const functionCalls = [...toolCallFcs, ...partFcs];
      if (functionCalls.length > 0) {
        await handleToolCalls(functionCalls);
      }
    },
    [
      handleToolCalls,
      onAssistantTurn,
      onTranscriptPreviewChange,
      onUserTurn,
      queueAudioForPlayback,
      rememberUserUtterance,
      stopPlaybackQueue,
    ],
  );

  // Keep the ref in sync so the Gemini session's onmessage always calls the latest version.
  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  const disconnectAgent = useCallback(async () => {
    shouldMaintainConnectionRef.current = false;
    reconnectAttemptsRef.current = 0;
    sessionResumptionHandleRef.current = undefined;
    shouldResumeAfterCloseRef.current = false;
    connectionModeRef.current = "voice";
    setConnectionMode("voice");
    activeOutputTranscriptionRef.current = "";
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
    onTranscriptPreviewChange,
    stopMicrophoneCapture,
  ]);

  const connectAgent = useCallback(async (options?: {
    resumeSession?: boolean;
    isReconnect?: boolean;
    mode?: AgentConnectMode;
  }) => {
    if (statusRef.current === "connecting" || statusRef.current === "connected") {
      return;
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
      activeOutputTranscriptionRef.current = "";
      recentUserUtterancesRef.current = [];
      lastAssistantTurnTextRef.current = "";
      onTranscriptPreviewChange?.(null);
      reconnectAttemptsRef.current = 0;
      shouldResumeAfterCloseRef.current = false;
      setActivity("idle");
    }

    statusRef.current = useMicrophone ? "requesting-permission" : "connecting";
    setStatus(useMicrophone ? "requesting-permission" : "connecting");
    if (!isReconnect) {
      setError(null);
    }

    let permissionStream: MediaStream | null = null;
    const connectionId = activeConnectionIdRef.current + 1;
    activeConnectionIdRef.current = connectionId;

    try {
      if (useMicrophone) {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (activeConnectionIdRef.current !== connectionId) {
        stopMediaStreamTracks(permissionStream);
        return;
      }

      if (useMicrophone) {
        statusRef.current = "connecting";
        setStatus("connecting");
      }

      const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

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

      const session = await ai.live.connect({
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
            const message = event.error?.message ?? "Live session error";
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
      });

      if (activeConnectionIdRef.current !== connectionId) {
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
        err instanceof Error ? err.message : "Failed to connect to voice agent";
      console.error("[useVoiceAgent] failed to connect voice agent", err);
      sessionRef.current = null;
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
    onTranscriptPreviewChange,
    scheduleReconnect,
    startMicrophoneCapture,
    stopMicrophoneCapture,
  ]);

  useEffect(() => {
    connectAgentRef.current = connectAgent;
  }, [connectAgent]);

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
      void disconnectAgent();
    };
  }, [disconnectAgent]);

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
