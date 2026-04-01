'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import VoiceAgent, {
  type VoiceAgentControllerHandle,
} from "@/components/voice-agent";
import {
  SessionTranscriptPanel,
  type SessionTranscriptEntry,
} from "@/components/session-transcript-panel";
import { FlashcardPanel } from "@/components/flashcard-panel";
import { VisualizationPanel } from "@/components/visualization-panel";
import { DeepDivePanel } from "@/components/deepdive-panel";
import Canvas from "@/components/canvas";
import { PanelCard } from "@/components/ui/panel-card";
import { SectionHeader } from "@/components/ui/section-header";
import type {
  VoiceAssistantTurnEvent,
  VoiceTranscriptPreviewEvent,
  VoiceToolEvent,
  VoiceUserTurnEvent,
} from "@/hooks/useVoiceAgent";
import {
  buildSessionSummary,
  createArtifactId,
  createEventId,
  SESSION_STORAGE_KEY,
} from "@/lib/session-storage";
import { createSessionEvent, createToolResultEvent } from "@/lib/session-events";
import { applySessionUpdate } from "@/lib/session-update-pipeline";
import {
  buildSmokeSnapshot,
  clearCanvasEditor,
  doesToolEventMatchExpectedTools,
  seedCanvasFixture,
  summarizeAssistantTurn,
  summarizeVoiceToolEvent,
  type GeminilearnSmokeBridge,
  type SmokeCanvasFixture,
  type SmokeToolEventSummary,
} from "@/lib/smoke-bridge";
import { canvasRef } from "@/lib/canvas-adapter";
import {
  ensureSessionSummaries,
  getLocalSessionRepository,
} from "@/lib/session-repository";
import type {
  ContentView,
  GoogleDocArtifact,
  GoogleDocSection,
  GoogleSheetArtifact,
  GoogleSheetTab,
  QuizArtifact,
  QuizQuestion,
  QuizSnapshotState,
  QuizSessionContext,
  SessionArtifact,
  SessionEvent,
  TutorSession,
  WorkspaceTabId,
} from "@/types/session";
import { Flashcard, FlashcardSessionState } from "@/types/flashcard";
import { VisualizationState } from "@/types/visualization";
import { DeepDiveState } from "@/types/deepdive";
import { cn } from "@/lib/utils";
import {
  buildWorkspaceTabs,
  type WorkspaceTab,
} from "@/lib/workspace-tabs";

const CANVAS_PERSISTENCE_PREFIX = "geminilearn-canvas";
const MAX_TRANSCRIPT_ENTRIES = 6;

const INITIAL_FLASHCARD_STATE: FlashcardSessionState = {
  cards: [],
  currentIndex: 0,
  isFlipped: false,
  mode: "idle",
  generatedAt: null,
};

const INITIAL_VISUALIZATION_STATE: VisualizationState = {
  imageData: null,
  description: null,
  generatedAt: null,
  mode: "idle",
};

const INITIAL_DEEPDIVE_STATE: DeepDiveState = {
  imageData: null,
  overviewText: null,
  topic: null,
  generatedAt: null,
  mode: "idle",
};

const viewLabel: Record<ContentView, string> = {
  flashcards: "Flashcards",
  visualization: "Visualizations",
  deepdive: "Deep Dive",
};

const buildSnapshot = (
  contentView: ContentView,
  activeTab: WorkspaceTabId,
  flashcardSession: FlashcardSessionState,
  visualizationState: VisualizationState,
  deepDiveState: DeepDiveState,
  quizState: QuizSnapshotState,
) => ({
  contentView,
  activeTab,
  flashcardSession,
  visualizationState,
  deepDiveState,
  quizState,
});

const createArtifactEvent = (artifact: SessionArtifact): SessionEvent => ({
  id: createEventId(),
  type: "artifact_created",
  timestamp: new Date(),
  text: `Artifact created: ${artifact.title}`,
  metadata: {
    artifactId: artifact.id,
    artifactType: artifact.type,
  },
});


const TAB_LOGO_BY_ID: Partial<Record<WorkspaceTabId, string>> = {
  docs: "/GDocs.png",
  sheets: "/GSheets.png",
};

const viewToTab: Record<ContentView, WorkspaceTabId> = {
  flashcards: "flashcards",
  visualization: "visualization",
  deepdive: "deepdive",
};

const appendTranscriptEntry = (
  entries: SessionTranscriptEntry[],
  entry: SessionTranscriptEntry,
) => {
  const normalizedText = entry.text.trim();
  if (!normalizedText) {
    return entries;
  }

  const nextEntries = [
    ...entries.filter((candidate) => candidate.id !== entry.id),
    {
      ...entry,
      text: normalizedText,
    },
  ]
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
    .slice(-MAX_TRANSCRIPT_ENTRIES);

  return nextEntries;
};

interface SessionWorkspaceProps {
  sessionId: string;
}

const buildPlaceholderSession = (sessionId: string): TutorSession => {
  const createdAt = new Date(0);

  return {
    id: sessionId,
    title: "Session",
    summary: "",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    endedAt: null,
    events: [],
    artifacts: [],
    snapshot: buildSnapshot(
      "flashcards",
      "canvas",
      INITIAL_FLASHCARD_STATE,
      INITIAL_VISUALIZATION_STATE,
      INITIAL_DEEPDIVE_STATE,
      {
        selections: {},
        isSubmitted: false,
      },
    ),
  };
};

function ExitDoorIcon({ className }: { className?: string }) {
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
      <path d="M5 4.75A1.75 1.75 0 0 1 6.75 3h8.5A1.75 1.75 0 0 1 17 4.75v14.5A1.75 1.75 0 0 1 15.25 21h-8.5A1.75 1.75 0 0 1 5 19.25Z" />
      <path d="M10 12h9" />
      <path d="m16 8 4 4-4 4" />
      <path d="M13 12h7" />
      <path d="M8.75 11.25h.5" />
    </svg>
  );
}

function SessionExitModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/28 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-exit-title"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <h2
            id="session-exit-title"
            className="text-base font-semibold text-slate-900"
          >
            End session?
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            End this session and leave the workspace.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            End session
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SessionWorkspace({ sessionId }: SessionWorkspaceProps) {
  const router = useRouter();
  const repository = useMemo(() => getLocalSessionRepository(), []);

  const [bootstrapState] = useState(() => {
    const active = buildPlaceholderSession(sessionId);

    return {
      sessions: [active],
      snapshot: active.snapshot,
    };
  });

  const [hasHydratedSession, setHasHydratedSession] = useState(false);
  const [sessions, setSessions] = useState<TutorSession[]>(bootstrapState.sessions);
  const [currentContentView, setCurrentContentView] = useState<ContentView>(
    bootstrapState.snapshot.contentView,
  );
  const [flashcardSession, setFlashcardSession] =
    useState<FlashcardSessionState>(bootstrapState.snapshot.flashcardSession);
  const [visualizationState, setVisualizationState] =
    useState<VisualizationState>(bootstrapState.snapshot.visualizationState);
  const [deepDiveState, setDeepDiveState] =
    useState<DeepDiveState>(bootstrapState.snapshot.deepDiveState);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>(
    bootstrapState.snapshot.activeTab,
  );
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);
  const [quizSelections, setQuizSelections] = useState<Record<number, string>>(
    bootstrapState.snapshot.quizState.selections,
  );
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(
    bootstrapState.snapshot.quizState.isSubmitted,
  );
  const [transcriptEntries, setTranscriptEntries] = useState<
    SessionTranscriptEntry[]
  >([]);
  const [transcriptPreview, setTranscriptPreview] =
    useState<SessionTranscriptEntry | null>(null);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const lastQuizArtifactIdRef = useRef<string | null>(null);
  const hasInitializedQuizArtifactRef = useRef(false);

  const artifactMarkerRef = useRef<{
    flashcards: string;
    visualization: string;
    deepdive: string;
  }>({
    flashcards:
      bootstrapState.snapshot.flashcardSession.generatedAt?.toISOString() ?? "",
    visualization:
      bootstrapState.snapshot.visualizationState.generatedAt?.toISOString() ?? "",
    deepdive:
      bootstrapState.snapshot.deepDiveState.generatedAt?.toISOString() ?? "",
  });

  const lastVoiceStatusRef = useRef("idle");
  const lastViewRef = useRef<ContentView>(bootstrapState.snapshot.contentView);
  const lastFlashcardModeRef = useRef<FlashcardSessionState["mode"]>(
    bootstrapState.snapshot.flashcardSession.mode,
  );
  const lastVisualizationModeRef = useRef<VisualizationState["mode"]>(
    bootstrapState.snapshot.visualizationState.mode,
  );
  const lastDeepDiveModeRef = useRef<DeepDiveState["mode"]>(
    bootstrapState.snapshot.deepDiveState.mode,
  );
  const voiceAgentControllerRef = useRef<VoiceAgentControllerHandle | null>(null);
  const lastVoiceToolEventRef = useRef<VoiceToolEvent | null>(null);
  const lastAssistantTurnRef = useRef<VoiceAssistantTurnEvent | null>(null);
  const flashcardSessionStateRef = useRef<FlashcardSessionState>(
    bootstrapState.snapshot.flashcardSession,
  );
  const visualizationStateRef = useRef<VisualizationState>(
    bootstrapState.snapshot.visualizationState,
  );
  const quizContextRef = useRef<QuizSessionContext | null>(null);
  const activeSessionRef = useRef<TutorSession | null>(null);
  const activeTabRef = useRef<WorkspaceTabId>(bootstrapState.snapshot.activeTab);
  const availableTabsRef = useRef<WorkspaceTabId[]>([]);
  const toolWaitersRef = useRef<
    Array<{
      expectedTools: string[];
      reject: (error: Error) => void;
      resolve: (event: SmokeToolEventSummary) => void;
      timeoutId: number;
    }>
  >([]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  const latestDocArtifact = useMemo<GoogleDocArtifact | null>(
    () =>
      (activeSession?.artifacts.find(
        (artifact): artifact is GoogleDocArtifact => artifact.type === "google_doc",
      ) ?? null),
    [activeSession],
  );

  const latestSheetArtifact = useMemo<GoogleSheetArtifact | null>(
    () =>
      (activeSession?.artifacts.find(
        (artifact): artifact is GoogleSheetArtifact => artifact.type === "google_sheet",
      ) ?? null),
    [activeSession],
  );

  const latestQuizArtifact = useMemo<QuizArtifact | null>(
    () =>
      (activeSession?.artifacts.find(
        (artifact): artifact is QuizArtifact => artifact.type === "quiz",
      ) ?? null),
    [activeSession],
  );

  const activeSheetTab = useMemo(() => {
    if (!latestSheetArtifact || latestSheetArtifact.sheets.length === 0) {
      return null;
    }

    if (activeSheetName) {
      const match = latestSheetArtifact.sheets.find((sheet) => sheet.name === activeSheetName);
      if (match) {
        return match;
      }
    }

    return latestSheetArtifact.sheets[0];
  }, [latestSheetArtifact, activeSheetName]);

  const answeredQuizCount = useMemo(
    () => Object.keys(quizSelections).length,
    [quizSelections],
  );

  const quizScore = useMemo(() => {
    if (!latestQuizArtifact) return 0;

    return latestQuizArtifact.questions.reduce((score, question, index) => {
      return quizSelections[index] === question.correctAnswer ? score + 1 : score;
    }, 0);
  }, [latestQuizArtifact, quizSelections]);

  const quizContext = useMemo<QuizSessionContext | null>(() => {
    if (!latestQuizArtifact) {
      return null;
    }

    return {
      title: latestQuizArtifact.title,
      summary: latestQuizArtifact.summary,
      isSubmitted: isQuizSubmitted,
      answeredCount: answeredQuizCount,
      totalQuestions: latestQuizArtifact.questions.length,
      score: isQuizSubmitted ? quizScore : null,
      questions: latestQuizArtifact.questions.map((question, index) => {
        const selectedAnswer = quizSelections[index] ?? null;
        return {
          ...question,
          index,
          selectedAnswer,
          isCorrect: isQuizSubmitted
            ? selectedAnswer === question.correctAnswer
            : null,
        };
      }),
    };
  }, [
    answeredQuizCount,
    isQuizSubmitted,
    latestQuizArtifact,
    quizScore,
    quizSelections,
  ]);

  const quizSnapshot = useMemo<QuizSnapshotState>(
    () => ({
      selections: quizSelections,
      isSubmitted: isQuizSubmitted,
    }),
    [isQuizSubmitted, quizSelections],
  );

  useEffect(() => {
    const nextArtifactId = latestQuizArtifact?.id ?? null;
    if (!hasInitializedQuizArtifactRef.current) {
      hasInitializedQuizArtifactRef.current = true;
      lastQuizArtifactIdRef.current = nextArtifactId;
      return;
    }

    if (lastQuizArtifactIdRef.current === nextArtifactId) {
      return;
    }

    lastQuizArtifactIdRef.current = nextArtifactId;
    setQuizSelections({});
    setIsQuizSubmitted(false);
  }, [latestQuizArtifact?.id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const loaded = ensureSessionSummaries(repository.list());
      const nextSessions =
        loaded.length > 0 ? loaded : [repository.create("Session 1")];
      const nextActive =
        nextSessions.find((session) => session.id === sessionId) ?? nextSessions[0];

      setSessions(nextSessions);
      setCurrentContentView(nextActive.snapshot.contentView);
      setFlashcardSession(nextActive.snapshot.flashcardSession);
      setVisualizationState(nextActive.snapshot.visualizationState);
      setDeepDiveState(nextActive.snapshot.deepDiveState);
      setActiveTab(nextActive.snapshot.activeTab);
      setQuizSelections(nextActive.snapshot.quizState.selections);
      setIsQuizSubmitted(nextActive.snapshot.quizState.isSubmitted);
      setActiveSheetName(null);

      artifactMarkerRef.current = {
        flashcards:
          nextActive.snapshot.flashcardSession.generatedAt?.toISOString() ?? "",
        visualization:
          nextActive.snapshot.visualizationState.generatedAt?.toISOString() ?? "",
        deepdive:
          nextActive.snapshot.deepDiveState.generatedAt?.toISOString() ?? "",
      };
      lastViewRef.current = nextActive.snapshot.contentView;
      lastFlashcardModeRef.current = nextActive.snapshot.flashcardSession.mode;
      lastVisualizationModeRef.current = nextActive.snapshot.visualizationState.mode;
      lastDeepDiveModeRef.current = nextActive.snapshot.deepDiveState.mode;
      flashcardSessionStateRef.current = nextActive.snapshot.flashcardSession;
      visualizationStateRef.current = nextActive.snapshot.visualizationState;
      activeSessionRef.current = nextActive;
      activeTabRef.current = nextActive.snapshot.activeTab;

      setHasHydratedSession(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [repository, sessionId]);

  useEffect(() => {
    if (!hasHydratedSession) {
      return;
    }

    if (activeSession) {
      return;
    }
    router.replace(`/sessions/${sessions[0].id}`);
  }, [activeSession, hasHydratedSession, sessions, router]);

  useEffect(() => {
    if (!hasHydratedSession) {
      return;
    }

    repository.saveAll(ensureSessionSummaries(sessions));
  }, [hasHydratedSession, sessions, repository]);

  const persistActiveUpdate = useCallback(
    ({
      nextContentView,
      nextFlashcardSession,
      nextVisualizationState,
      nextDeepDiveState,
      appendEvent,
      appendArtifact,
      nextStatus,
      nextEndedAt,
      nextSummary,
      nextActiveTab,
      nextQuizState,
    }: {
      nextContentView?: ContentView;
      nextActiveTab?: WorkspaceTabId;
      nextFlashcardSession?: FlashcardSessionState;
      nextVisualizationState?: VisualizationState;
      nextDeepDiveState?: DeepDiveState;
      nextQuizState?: QuizSnapshotState;
      appendEvent?: SessionEvent;
      appendArtifact?: SessionArtifact;
      nextStatus?: TutorSession["status"];
      nextEndedAt?: Date | null;
      nextSummary?: string;
    }) => {
      const snapshot = buildSnapshot(
        nextContentView ?? currentContentView,
        nextActiveTab ?? activeTab,
        nextFlashcardSession ?? flashcardSession,
        nextVisualizationState ?? visualizationState,
        nextDeepDiveState ?? deepDiveState,
        nextQuizState ?? quizSnapshot,
      );

      setSessions((prev) =>
        applySessionUpdate({
          sessions: prev,
          sessionId,
          snapshot,
          appendEvent,
          appendArtifact,
          nextStatus,
          nextEndedAt,
          nextSummary,
        }),
      );
    },
    [
      sessionId,
      currentContentView,
      activeTab,
      flashcardSession,
      visualizationState,
      deepDiveState,
      quizSnapshot,
    ],
  );

  const pushSessionEvent = useCallback(
    (type: SessionEvent["type"], text: string, metadata?: Record<string, unknown>) => {
      persistActiveUpdate({
        appendEvent: createSessionEvent(type, text, metadata),
      });
    },
    [persistActiveUpdate],
  );

  const endSession = useCallback(() => {
    if (!activeSession || activeSession.status === "ended") {
      return sessions;
    }

    const now = new Date();
    const endedSession: TutorSession = {
      ...activeSession,
      status: "ended",
      endedAt: now,
      updatedAt: now,
      events: [
        ...activeSession.events,
        {
          id: createEventId(),
          type: "session_ended",
          timestamp: now,
          text: "Session ended.",
        },
      ],
    };

    const snapshot = buildSnapshot(
      currentContentView,
      activeTab,
      flashcardSession,
      visualizationState,
      deepDiveState,
      quizSnapshot,
    );

    const nextSessions = applySessionUpdate({
      sessions,
      sessionId,
      snapshot,
      appendEvent: {
        id: createEventId(),
        type: "session_ended",
        timestamp: now,
        text: "Session ended.",
      },
      nextStatus: "ended",
      nextEndedAt: now,
      nextSummary: buildSessionSummary(endedSession),
    });

    setSessions(nextSessions);
    repository.saveAll(ensureSessionSummaries(nextSessions));

    return nextSessions;
  }, [
    activeSession,
    activeTab,
    currentContentView,
    deepDiveState,
    flashcardSession,
    quizSnapshot,
    repository,
    sessionId,
    sessions,
    visualizationState,
  ]);

  const handleConfirmExit = useCallback(async () => {
    setIsExitModalOpen(false);

    try {
      await voiceAgentControllerRef.current?.disconnectAgent();
    } catch {
      // Ignore disconnect failures while leaving the workspace.
    }

    endSession();
    router.push("/");
  }, [endSession, router]);

  // Auto-switch to the artifact tab as soon as its mode becomes non-idle.
  // This is more reliable than relying on the tool handler closure calling
  // setContentView at the right moment relative to React's batch schedule.
  useEffect(() => {
    if (
      lastFlashcardModeRef.current === "idle" &&
      flashcardSession.mode !== "idle"
    ) {
      setActiveTab("flashcards");
      persistActiveUpdate({ nextActiveTab: "flashcards" });
    }
    lastFlashcardModeRef.current = flashcardSession.mode;
  }, [flashcardSession.mode, persistActiveUpdate]);

  useEffect(() => {
    if (
      lastVisualizationModeRef.current === "idle" &&
      visualizationState.mode !== "idle"
    ) {
      setActiveTab("visualization");
      persistActiveUpdate({ nextActiveTab: "visualization" });
    }
    lastVisualizationModeRef.current = visualizationState.mode;
  }, [persistActiveUpdate, visualizationState.mode]);

  useEffect(() => {
    if (
      lastDeepDiveModeRef.current === "idle" &&
      deepDiveState.mode !== "idle"
    ) {
      setActiveTab("deepdive");
      persistActiveUpdate({ nextActiveTab: "deepdive" });
    }
    lastDeepDiveModeRef.current = deepDiveState.mode;
  }, [deepDiveState.mode, persistActiveUpdate]);

  const setContentView = useCallback(
    (view: ContentView) => {
      setCurrentContentView(view);
      setActiveTab(viewToTab[view]);

      if (view !== lastViewRef.current) {
        lastViewRef.current = view;
        pushSessionEvent("view_changed", `Switched to ${viewLabel[view]} view.`);
      }

      persistActiveUpdate({
        nextContentView: view,
        nextActiveTab: viewToTab[view],
      });
    },
    [persistActiveUpdate, pushSessionEvent],
  );

  const handleSetCards = useCallback(
    (cards: Flashcard[]) => {
      const nextState: FlashcardSessionState = {
        cards,
        currentIndex: 0,
        isFlipped: false,
        mode: cards.length > 0 ? "reviewing" : "idle",
        generatedAt: cards.length > 0 ? new Date() : null,
      };

      setFlashcardSession(nextState);

      if (!nextState.generatedAt || cards.length === 0) {
        persistActiveUpdate({ nextFlashcardSession: nextState });
        return;
      }

      const marker = nextState.generatedAt.toISOString();
      if (artifactMarkerRef.current.flashcards !== marker) {
        artifactMarkerRef.current.flashcards = marker;

        const artifact: SessionArtifact = {
          id: createArtifactId(),
          type: "flashcard_deck",
          title: cards[0]?.title ? `Flashcards: ${cards[0].title}` : "Flashcard Deck",
          createdAt: nextState.generatedAt,
          summary: `Generated ${cards.length} flashcards.`,
          cardCount: cards.length,
        };

        persistActiveUpdate({
          nextFlashcardSession: nextState,
          appendArtifact: artifact,
          appendEvent: createArtifactEvent(artifact),
        });
        return;
      }

      persistActiveUpdate({ nextFlashcardSession: nextState });
    },
    [persistActiveUpdate],
  );

  const handleSetMode = useCallback(
    (mode: FlashcardSessionState["mode"]) => {
      const next = {
        ...flashcardSession,
        mode,
      };
      setFlashcardSession(next);
      persistActiveUpdate({ nextFlashcardSession: next });
    },
    [flashcardSession, persistActiveUpdate],
  );

  const handleFlipCard = useCallback(() => {
    const next = {
      ...flashcardSession,
      isFlipped: !flashcardSession.isFlipped,
    };
    setFlashcardSession(next);
    persistActiveUpdate({ nextFlashcardSession: next });
  }, [flashcardSession, persistActiveUpdate]);

  const handleNextCard = useCallback(() => {
    if (flashcardSession.currentIndex >= flashcardSession.cards.length - 1) return;
    const next = {
      ...flashcardSession,
      currentIndex: flashcardSession.currentIndex + 1,
      isFlipped: false,
    };
    setFlashcardSession(next);
    persistActiveUpdate({ nextFlashcardSession: next });
  }, [flashcardSession, persistActiveUpdate]);

  const handlePreviousCard = useCallback(() => {
    if (flashcardSession.currentIndex === 0) return;
    const next = {
      ...flashcardSession,
      currentIndex: flashcardSession.currentIndex - 1,
      isFlipped: false,
    };
    setFlashcardSession(next);
    persistActiveUpdate({ nextFlashcardSession: next });
  }, [flashcardSession, persistActiveUpdate]);

  const flashcardActions = useMemo(
    () => ({
      setCards: handleSetCards,
      setMode: handleSetMode,
      flipCard: handleFlipCard,
      nextCard: handleNextCard,
      previousCard: handlePreviousCard,
    }),
    [handleSetCards, handleSetMode, handleFlipCard, handleNextCard, handlePreviousCard],
  );

  const handleSetVisualization = useCallback(
    (imageData: string, description: string) => {
      const next: VisualizationState = {
        imageData,
        description,
        generatedAt: new Date(),
        mode: "ready",
      };
      setVisualizationState(next);

      const marker = next.generatedAt?.toISOString() ?? "";
      if (marker && artifactMarkerRef.current.visualization !== marker) {
        artifactMarkerRef.current.visualization = marker;

        const artifact: SessionArtifact = {
          id: createArtifactId(),
          type: "visualization_image",
          title: description ? `Visualization: ${description}` : "Visualization",
          createdAt: next.generatedAt as Date,
          summary: "Generated a visualization image.",
          description,
          imageData,
        };

        persistActiveUpdate({
          nextVisualizationState: next,
          appendArtifact: artifact,
          appendEvent: createArtifactEvent(artifact),
        });
        return;
      }

      persistActiveUpdate({ nextVisualizationState: next });
    },
    [persistActiveUpdate],
  );

  const handleSetVisualizationMode = useCallback(
    (mode: VisualizationState["mode"]) => {
      setVisualizationState((prev) => {
        const next = {
          ...prev,
          mode,
        };
        persistActiveUpdate({ nextVisualizationState: next });
        return next;
      });
    },
    [persistActiveUpdate],
  );

  const handleClearVisualization = useCallback(() => {
    setVisualizationState(INITIAL_VISUALIZATION_STATE);
    persistActiveUpdate({ nextVisualizationState: INITIAL_VISUALIZATION_STATE });
  }, [persistActiveUpdate]);

  const visualizationActions = useMemo(
    () => ({
      setVisualization: handleSetVisualization,
      setMode: handleSetVisualizationMode,
      clearVisualization: handleClearVisualization,
    }),
    [handleSetVisualization, handleSetVisualizationMode, handleClearVisualization],
  );

  const handleSetDeepDive = useCallback(
    (imageData: string, overviewText: string, topic: string) => {
      const next: DeepDiveState = {
        imageData,
        overviewText,
        topic,
        generatedAt: new Date(),
        mode: "ready",
      };
      setDeepDiveState(next);

      const marker = next.generatedAt?.toISOString() ?? "";
      if (marker && artifactMarkerRef.current.deepdive !== marker) {
        artifactMarkerRef.current.deepdive = marker;

        const artifact: SessionArtifact = {
          id: createArtifactId(),
          type: "deep_dive_bundle",
          title: topic ? `Deep Dive: ${topic}` : "Deep Dive",
          createdAt: next.generatedAt as Date,
          summary: overviewText,
          topic,
          overviewText,
          imageData,
        };

        persistActiveUpdate({
          nextDeepDiveState: next,
          appendArtifact: artifact,
          appendEvent: createArtifactEvent(artifact),
        });
        return;
      }

      persistActiveUpdate({ nextDeepDiveState: next });
    },
    [persistActiveUpdate],
  );

  const handleSetDeepDiveMode = useCallback(
    (mode: DeepDiveState["mode"]) => {
      const next = {
        ...deepDiveState,
        mode,
      };
      setDeepDiveState(next);
      persistActiveUpdate({ nextDeepDiveState: next });
    },
    [deepDiveState, persistActiveUpdate],
  );

  const handleClearDeepDive = useCallback(() => {
    setDeepDiveState(INITIAL_DEEPDIVE_STATE);
    persistActiveUpdate({ nextDeepDiveState: INITIAL_DEEPDIVE_STATE });
  }, [persistActiveUpdate]);

  const deepDiveActions = useMemo(
    () => ({
      setDeepDive: handleSetDeepDive,
      setMode: handleSetDeepDiveMode,
      clearDeepDive: handleClearDeepDive,
    }),
    [handleSetDeepDive, handleSetDeepDiveMode, handleClearDeepDive],
  );

  const handleSetGoogleDoc = useCallback(
    (title: string, summary: string, sections: GoogleDocSection[]) => {
      const artifact: SessionArtifact = {
        id: createArtifactId(),
        type: "google_doc",
        title,
        createdAt: new Date(),
        summary,
        sections,
      };
      persistActiveUpdate({
        appendArtifact: artifact,
        appendEvent: createArtifactEvent(artifact),
        nextActiveTab: "docs",
      });
      setActiveTab("docs");
    },
    [persistActiveUpdate],
  );

  const handleSetGoogleSheet = useCallback(
    (title: string, summary: string, sheets: GoogleSheetTab[]) => {
      const artifact: SessionArtifact = {
        id: createArtifactId(),
        type: "google_sheet",
        title,
        createdAt: new Date(),
        summary,
        sheets,
      };
      persistActiveUpdate({
        appendArtifact: artifact,
        appendEvent: createArtifactEvent(artifact),
        nextActiveTab: "sheets",
      });
      setActiveTab("sheets");
    },
    [persistActiveUpdate],
  );

  const handleSetQuiz = useCallback(
    (title: string, summary: string, questions: QuizQuestion[]) => {
      const artifact: SessionArtifact = {
        id: createArtifactId(),
        type: "quiz",
        title,
        createdAt: new Date(),
        summary,
        questions,
      };
      persistActiveUpdate({
        appendArtifact: artifact,
        appendEvent: createArtifactEvent(artifact),
        nextActiveTab: "quiz",
        nextQuizState: {
          selections: {},
          isSubmitted: false,
        },
      });
      setActiveTab("quiz");
    },
    [persistActiveUpdate],
  );

  const handleSelectQuizChoice = useCallback(
    (questionIndex: number, choice: string) => {
      if (isQuizSubmitted) return;

      setQuizSelections((prev) => {
        const next = {
          ...prev,
          [questionIndex]: choice,
        };
        persistActiveUpdate({
          nextQuizState: {
            selections: next,
            isSubmitted: false,
          },
        });
        return next;
      });
    },
    [isQuizSubmitted, persistActiveUpdate],
  );

  const handleSubmitQuiz = useCallback(() => {
    setIsQuizSubmitted(true);
    persistActiveUpdate({
      nextQuizState: {
        selections: quizSelections,
        isSubmitted: true,
      },
    });
  }, [persistActiveUpdate, quizSelections]);

  const handleResetQuiz = useCallback(() => {
    setQuizSelections({});
    setIsQuizSubmitted(false);
    persistActiveUpdate({
      nextQuizState: {
        selections: {},
        isSubmitted: false,
      },
    });
  }, [persistActiveUpdate]);

  const resolveToolWaiters = useCallback((event: VoiceToolEvent) => {
    const matchingWaiters = toolWaitersRef.current.filter((waiter) =>
      doesToolEventMatchExpectedTools(event, waiter.expectedTools),
    );

    if (matchingWaiters.length === 0) {
      return;
    }

    toolWaitersRef.current = toolWaitersRef.current.filter(
      (waiter) => !matchingWaiters.includes(waiter),
    );

    window.setTimeout(() => {
      const summary = summarizeVoiceToolEvent(event);
      if (!summary) {
        return;
      }

      matchingWaiters.forEach((waiter) => {
        window.clearTimeout(waiter.timeoutId);
        waiter.resolve(summary);
      });
    }, 0);
  }, []);

  const handleVoiceToolEvent = useCallback(
    (event: VoiceToolEvent) => {
      lastVoiceToolEventRef.current = event;
      persistActiveUpdate({
        appendEvent: createToolResultEvent({
          toolName: event.toolName,
          requestedToolName: event.requestedToolName,
          executedToolName: event.executedToolName,
          args: event.args,
          success: event.success,
          message: event.message,
          diagnostics:
            process.env.NODE_ENV === "production" ||
            !event.output?.diagnostics ||
            typeof event.output.diagnostics !== "object"
              ? undefined
              : (event.output.diagnostics as Record<string, unknown>),
        }),
      });
      resolveToolWaiters(event);
    },
    [persistActiveUpdate, resolveToolWaiters],
  );

  const handleVoiceStatusChange = useCallback(
    (status: string) => {
      if (status === lastVoiceStatusRef.current) return;

      if (status === "connected") {
        pushSessionEvent("note", "Voice agent connected.");
      } else if (status === "idle" && lastVoiceStatusRef.current === "connected") {
        pushSessionEvent("note", "Voice agent disconnected.");
      } else if (status === "error") {
        pushSessionEvent("note", "Voice agent entered an error state.");
      }

      lastVoiceStatusRef.current = status;
    },
    [pushSessionEvent],
  );

  const handleVoiceControllerChange = useCallback(
    (controller: VoiceAgentControllerHandle | null) => {
      voiceAgentControllerRef.current = controller;
    },
    [],
  );

  const handleVoiceAssistantTurn = useCallback(
    (event: VoiceAssistantTurnEvent) => {
      lastAssistantTurnRef.current = event;
      setTranscriptEntries((current) =>
        appendTranscriptEntry(current, {
          id: event.id,
          role: "assistant",
          text: event.text,
          timestamp: event.timestamp,
        }),
      );
    },
    [],
  );

  const handleVoiceUserTurn = useCallback((event: VoiceUserTurnEvent) => {
    setTranscriptEntries((current) =>
      appendTranscriptEntry(current, {
        id: event.id,
        role: "user",
        text: event.text,
        timestamp: event.timestamp,
      }),
    );
  }, []);

  const handleVoiceTranscriptPreview = useCallback(
    (event: VoiceTranscriptPreviewEvent | null) => {
      if (!event || !event.text.trim()) {
        setTranscriptPreview(null);
        return;
      }

      setTranscriptPreview({
        id: `preview-${event.role}`,
        role: event.role,
        text: event.text.trim(),
        timestamp: event.timestamp,
      });
    },
    [],
  );

  const tabs = useMemo<WorkspaceTab[]>(
    () =>
      buildWorkspaceTabs({
        flashcardSession,
        visualizationState,
        deepDiveState,
        activeSession,
      }),
    [flashcardSession, visualizationState, deepDiveState, activeSession],
  );

  const activeTabId = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "canvas";

  useEffect(() => {
    flashcardSessionStateRef.current = flashcardSession;
  }, [flashcardSession]);

  useEffect(() => {
    visualizationStateRef.current = visualizationState;
  }, [visualizationState]);

  useEffect(() => {
    quizContextRef.current = quizContext;
  }, [quizContext]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    activeTabRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    availableTabsRef.current = tabs.map((tab) => tab.id);
  }, [tabs]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    const rejectAllWaiters = (message: string) => {
      toolWaitersRef.current.forEach((waiter) => {
        window.clearTimeout(waiter.timeoutId);
        waiter.reject(new Error(message));
      });
      toolWaitersRef.current = [];
    };

    const waitForCanvasAdapter = async () => {
      const timeoutAt = Date.now() + 10_000;

      while (!canvasRef.current?.isReady()) {
        if (Date.now() >= timeoutAt) {
          throw new Error("Canvas is not available.");
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 50);
        });
      }

      return canvasRef.current;
    };

    const bridge: GeminilearnSmokeBridge = {
      resetWorkspace: async () => {
        rejectAllWaiters("Smoke workspace reset before tool result arrived.");
        lastVoiceToolEventRef.current = null;
        lastAssistantTurnRef.current = null;
        setTranscriptEntries([]);
        setTranscriptPreview(null);
        await voiceAgentControllerRef.current?.disconnectAgent();
        await clearCanvasEditor(canvasRef.current);
        canvasRef.current?.removePersistedScene();
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        window.setTimeout(() => {
          window.location.reload();
        }, 0);
      },
      connectTextAgent: async () => {
        const controller = voiceAgentControllerRef.current;
        if (!controller) {
          throw new Error("Voice agent controller is not available.");
        }

        await controller.connectTextAgent();
      },
      disconnectAgent: async () => {
        await voiceAgentControllerRef.current?.disconnectAgent();
      },
      sendPrompt: async (prompt: string) => {
        const controller = voiceAgentControllerRef.current;
        if (!controller) {
          throw new Error("Voice agent controller is not available.");
        }

        await controller.sendTextTurn(prompt);
      },
      runTool: async (toolName: string, args?: Record<string, unknown>) => {
        const controller = voiceAgentControllerRef.current;
        if (!controller) {
          throw new Error("Voice agent controller is not available.");
        }

        if (toolName === "edit_canvas" || toolName === "get_canvas_snapshot") {
          await waitForCanvasAdapter();
        }

        return controller.runTool(toolName, args);
      },
      requestTutorReply: async (prompt: string) => {
        const response = await fetch("/api/tutor/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            quizContext: quizContextRef.current,
          }),
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          text?: string;
          timestamp?: string;
        };

        if (!response.ok || payload.success === false || !payload.text) {
          throw new Error(payload.error ?? "Failed to generate tutor reply.");
        }

        const summary = {
          text: payload.text,
          timestamp: payload.timestamp ?? new Date().toISOString(),
        };

        lastAssistantTurnRef.current = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: summary.text,
          timestamp: new Date(summary.timestamp),
        };

        setTranscriptEntries((current) =>
          appendTranscriptEntry(current, {
            id: lastAssistantTurnRef.current!.id,
            role: "assistant",
            text: summary.text,
            timestamp: new Date(summary.timestamp),
          }),
        );

        return summary;
      },
      seedCanvas: async (fixture: SmokeCanvasFixture) => {
        const canvas = await waitForCanvasAdapter();
        await seedCanvasFixture(canvas, fixture);
        activeTabRef.current = "canvas";
        setActiveTab("canvas");
      },
      seedVisualization: async (payload) => {
        handleSetVisualization(
          payload?.imageData ?? "data:image/png;base64,c21va2UtdmlzdWFsaXphdGlvbg==",
          payload?.description ?? "Smoke visualization",
        );
        setContentView("visualization");
      },
      selectTab: async (tabId: WorkspaceTabId) => {
        activeTabRef.current = tabId;
        setActiveTab(tabId);

        if (tabId === "flashcards") {
          setContentView("flashcards");
        } else if (tabId === "visualization") {
          setContentView("visualization");
        } else if (tabId === "deepdive") {
          setContentView("deepdive");
        } else {
          persistActiveUpdate({ nextActiveTab: tabId });
        }
      },
      waitForToolResult: async (expectedTools: string[], timeoutMs = 30000) => {
        const currentEvent = lastVoiceToolEventRef.current;
        if (doesToolEventMatchExpectedTools(currentEvent, expectedTools)) {
          const summary = summarizeVoiceToolEvent(currentEvent);
          if (summary) {
            return summary;
          }
        }

        return new Promise<SmokeToolEventSummary>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            toolWaitersRef.current = toolWaitersRef.current.filter(
              (waiter) => waiter.timeoutId !== timeoutId,
            );
            reject(
              new Error(
                `Timed out waiting for tool result: ${expectedTools.join(", ")}`,
              ),
            );
          }, timeoutMs);

          toolWaitersRef.current.push({
            expectedTools,
            reject,
            resolve,
            timeoutId,
          });
        });
      },
      waitForAssistantTurn: async ({
        afterTimestamp,
        minLength = 1,
        quietPeriodMs = 400,
        timeoutMs = 30000,
      } = {}) => {
        const timeoutAt = Date.now() + timeoutMs;
        const afterTime = afterTimestamp ? new Date(afterTimestamp).getTime() : null;

        const matches = (event: VoiceAssistantTurnEvent | null) =>
          Boolean(
            event &&
              event.text.trim().length >= minLength &&
              (afterTime === null || event.timestamp.getTime() > afterTime),
          );

        while (Date.now() < timeoutAt) {
          const current = lastAssistantTurnRef.current;
          if (matches(current)) {
            const seenTimestamp = current!.timestamp.getTime();
            await new Promise((resolve) => {
              window.setTimeout(resolve, quietPeriodMs);
            });

            const latest = lastAssistantTurnRef.current;
            if (
              matches(latest) &&
              latest!.timestamp.getTime() === seenTimestamp
            ) {
              const summary = summarizeAssistantTurn(latest);
              if (summary) {
                return summary;
              }
            }
          }

          await new Promise((resolve) => {
            window.setTimeout(resolve, 50);
          });
        }

        throw new Error("Timed out waiting for assistant response.");
      },
      getSnapshot: () =>
        buildSmokeSnapshot({
          activeTab: activeTabRef.current,
          availableTabs: availableTabsRef.current,
          voiceStatus: lastVoiceStatusRef.current,
          lastToolEvent: lastVoiceToolEventRef.current,
          lastAssistantTurn: lastAssistantTurnRef.current,
          flashcardSession: flashcardSessionStateRef.current,
          quizContext: quizContextRef.current,
          visualizationState: visualizationStateRef.current,
          canvasAdapter: canvasRef.current,
          activeSession: activeSessionRef.current,
        }),
    };

    window.__geminilearnSmoke = bridge;

    return () => {
      rejectAllWaiters("Smoke bridge unmounted before tool result arrived.");
      if (window.__geminilearnSmoke === bridge) {
        delete window.__geminilearnSmoke;
      }
    };
  }, [handleSetVisualization, persistActiveUpdate, setContentView]);

  const handleTabSelect = (tabId: WorkspaceTabId) => {
    setActiveTab(tabId);
    if (tabId === "flashcards") {
      setContentView("flashcards");
    } else if (tabId === "visualization") {
      setContentView("visualization");
    } else if (tabId === "deepdive") {
      setContentView("deepdive");
    } else {
      persistActiveUpdate({ nextActiveTab: tabId });
    }
  };

  const renderArtifactTab = () => {
    if (activeTabId === "flashcards") {
      return (
        <div className="p-4">
          <FlashcardPanel
            key={
              flashcardSession.generatedAt
                ? flashcardSession.generatedAt.toISOString()
                : "idle"
            }
            cards={flashcardSession.cards}
            mode={flashcardSession.mode}
            currentIndex={flashcardSession.currentIndex}
            isFlipped={flashcardSession.isFlipped}
            flipCard={handleFlipCard}
            nextCard={handleNextCard}
            previousCard={handlePreviousCard}
          />
        </div>
      );
    }

    if (activeTabId === "visualization") {
      return (
        <div className="p-4">
          <VisualizationPanel visualization={visualizationState} />
        </div>
      );
    }

    if (activeTabId === "deepdive") {
      return (
        <div className="p-4">
          <DeepDivePanel deepDive={deepDiveState} />
        </div>
      );
    }

    if (activeTabId === "sheets") {
      return (
        <div className="p-6">
          <PanelCard>
            <SectionHeader
              title={latestSheetArtifact?.title ?? "Google Sheets"}
              subtitle={latestSheetArtifact?.summary ?? "Spreadsheet artifact"}
            />
            {!latestSheetArtifact || latestSheetArtifact.sheets.length === 0 ? (
              <p className="text-sm text-slate-600">
                No spreadsheet artifact yet. Ask the voice agent to create a Google Sheet.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {latestSheetArtifact.sheets.map((sheet) => (
                    <button
                      key={sheet.name}
                      type="button"
                      onClick={() => setActiveSheetName(sheet.name)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium",
                        activeSheetTab?.name === sheet.name
                          ? "border-slate-400 bg-slate-100 text-slate-900"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {sheet.name}
                    </button>
                  ))}
                </div>
                {activeSheetTab ? (
                  <div className="overflow-auto rounded-lg border border-slate-200">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          {activeSheetTab.columns.map((column) => (
                            <th
                              key={column}
                              className="border-b border-slate-200 px-3 py-2 text-left font-semibold"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeSheetTab.rows.map((row, rowIndex) => (
                          <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-slate-50">
                            {row.map((cell, cellIndex) => (
                              <td
                                key={`cell-${rowIndex}-${cellIndex}`}
                                className="border-b border-slate-100 px-3 py-2 align-top text-slate-700"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}
          </PanelCard>
        </div>
      );
    }

    if (activeTabId === "docs") {
      return (
        <div className="p-6">
          <PanelCard>
            <SectionHeader
              title={latestDocArtifact?.title ?? "Google Docs"}
              subtitle={latestDocArtifact?.summary ?? "Memo artifact"}
            />
            {!latestDocArtifact || latestDocArtifact.sections.length === 0 ? (
              <p className="text-sm text-slate-600">
                No document artifact yet. Ask the voice agent to create a Google Doc memo.
              </p>
            ) : (
              <div className="space-y-4">
                {latestDocArtifact.sections.map((section, index) => (
                  <section key={`section-${index}`} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">{section.heading}</h3>
                    <p className="text-sm leading-relaxed text-slate-700">{section.content}</p>
                    {section.bullets.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {section.bullets.map((item, itemIndex) => (
                          <li key={`bullet-${index}-${itemIndex}`}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      );
    }

    if (activeTabId === "quiz") {
      return (
        <div className="p-6">
          <PanelCard>
            <SectionHeader
              title={latestQuizArtifact?.title ?? "Quiz"}
              subtitle={latestQuizArtifact?.summary ?? "Assessment artifact"}
            />
            {!latestQuizArtifact || latestQuizArtifact.questions.length === 0 ? (
              <p className="text-sm text-slate-600">
                No quiz artifact yet. Ask the voice agent to create a quiz or practice test.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm text-slate-600">
                    {isQuizSubmitted ? (
                      <span className="font-medium text-slate-900">
                        Score: {quizScore} / {latestQuizArtifact.questions.length}
                      </span>
                    ) : (
                      <span>
                        Answered {answeredQuizCount} of {latestQuizArtifact.questions.length}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isQuizSubmitted ? (
                      <button
                        type="button"
                        onClick={handleResetQuiz}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Retry Quiz
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmitQuiz}
                        disabled={answeredQuizCount !== latestQuizArtifact.questions.length}
                        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Submit Quiz
                      </button>
                    )}
                  </div>
                </div>
                {latestQuizArtifact.questions.map((question, index) => (
                  <section
                    key={`quiz-question-${index}`}
                    className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Question {index + 1}
                      </p>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {question.prompt}
                      </h3>
                    </div>
                    <ul className="space-y-2">
                      {question.choices.map((choice, choiceIndex) => {
                        const selectedChoice = quizSelections[index];
                        const isSelected = selectedChoice === choice;
                        const isCorrect = choice === question.correctAnswer;
                        const isIncorrectSelection =
                          isQuizSubmitted && isSelected && !isCorrect;
                        return (
                          <li key={`quiz-choice-${index}-${choiceIndex}`}>
                            <button
                              type="button"
                              onClick={() => handleSelectQuizChoice(index, choice)}
                              disabled={isQuizSubmitted}
                              className={cn(
                                "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                isQuizSubmitted && isCorrect
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                  : isIncorrectSelection
                                    ? "border-red-300 bg-red-50 text-red-800"
                                    : isSelected
                                      ? "border-slate-500 bg-slate-100 text-slate-900"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
                                isQuizSubmitted ? "cursor-default" : "",
                              )}
                            >
                              <span className="font-medium">
                                {String.fromCharCode(65 + choiceIndex)}.
                              </span>{" "}
                              {choice}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {isQuizSubmitted ? (
                      <div
                        className={cn(
                          "rounded-md border px-3 py-3 text-sm",
                          quizSelections[index] === question.correctAnswer
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-amber-200 bg-amber-50 text-amber-900",
                        )}
                      >
                        <p className="font-medium">
                          Correct answer: {question.correctAnswer}
                        </p>
                        <p className="mt-1">{question.explanation}</p>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 py-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabSelect(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-t-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                activeTabId === tab.id
                  ? "border-slate-300 border-b-white bg-white text-slate-900"
                  : "border-transparent bg-slate-200 text-slate-600 hover:bg-slate-300",
              )}
            >
              {TAB_LOGO_BY_ID[tab.id] ? (
                <Image
                  src={TAB_LOGO_BY_ID[tab.id] as string}
                  alt=""
                  width={14}
                  height={14}
                  aria-hidden
                  className="h-3.5 w-3.5 object-contain"
                />
              ) : (
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    tab.kind === "canvas" ? "bg-indigo-500" : "bg-emerald-500",
                  )}
                />
              )}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-50">
          <div
            className={cn(
              "absolute inset-0",
              activeTabId === "canvas" ? "block" : "hidden",
            )}
          >
            <Canvas
              isActive={activeTabId === "canvas"}
              persistenceKey={`${CANVAS_PERSISTENCE_PREFIX}-${sessionId}`}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 overflow-auto bg-white pb-36 pt-4",
              activeTabId === "canvas" ? "hidden" : "block",
            )}
          >
            {renderArtifactTab()}
          </div>

          <div className="pointer-events-none absolute left-4 top-4 z-20">
            <div className="pointer-events-auto">
              <SessionTranscriptPanel
                entries={transcriptEntries}
                preview={transcriptPreview}
              />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-3xl">
              <VoiceAgent
                flashcardSession={flashcardSession}
                flashcardActions={flashcardActions}
                visualizationState={visualizationState}
                visualizationActions={visualizationActions}
                deepDiveState={deepDiveState}
                deepDiveActions={deepDiveActions}
                quizContext={quizContext}
                setContentView={setContentView}
                onSetGoogleDoc={handleSetGoogleDoc}
                onSetGoogleSheet={handleSetGoogleSheet}
                onSetQuiz={handleSetQuiz}
                onToolEvent={handleVoiceToolEvent}
                onTranscriptPreviewChange={handleVoiceTranscriptPreview}
                onUserTurn={handleVoiceUserTurn}
                onAssistantTurn={handleVoiceAssistantTurn}
                onStatusChange={handleVoiceStatusChange}
                onControllerChange={handleVoiceControllerChange}
              />
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-4 right-4 z-20">
            <div className="pointer-events-auto">
              <button
                type="button"
                onClick={() => setIsExitModalOpen(true)}
                aria-label="End session"
                title="End session"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-slate-900"
              >
                <ExitDoorIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <SessionExitModal
        open={isExitModalOpen}
        onClose={() => setIsExitModalOpen(false)}
        onConfirm={() => {
          void handleConfirmExit();
        }}
      />
    </div>
  );
}
