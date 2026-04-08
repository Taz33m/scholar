'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import VoiceAgent, {
  type VoiceAgentControllerHandle,
} from "@/components/voice-agent";
import { SessionTranscriptPanel } from "@/components/session-transcript-panel";
import { FlashcardPanel } from "@/components/flashcard-panel";
import { VisualizationPanel } from "@/components/visualization-panel";
import { DeepDivePanel } from "@/components/deepdive-panel";
import { WorksheetPanel } from "@/components/worksheet-panel";
import { UploadedFilePanel } from "@/components/uploaded-file-panel";
import Canvas from "@/components/canvas";
import { PanelCard } from "@/components/ui/panel-card";
import { MarkdownText } from "@/components/ui/markdown-text";
import { SectionHeader } from "@/components/ui/section-header";
import type {
  VoiceAssistantTurnEvent,
  VoiceTranscriptPreviewEvent,
  VoiceToolEvent,
  VoiceUserTurnEvent,
} from "@/hooks/useVoiceAgent";
import {
  buildSessionSummary,
  clearStoredSessionTranscripts,
  consumePendingTutorSessionSeed,
  createSessionId,
  createArtifactId,
  createEventId,
  loadSessionTranscript,
  queuePendingTutorSessionSeed,
  runLegacyTranscriptMaintenance,
  saveSessionTranscript,
  SESSION_STORAGE_KEY,
  type PendingSessionSeed,
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
  createTutorSessionFromSeed,
  ensureSessionSummaries,
  getLocalSessionRepository,
} from "@/lib/session-repository";
import {
  buildUploadedFileStorageKey,
  persistUploadedFileBlob,
} from "@/lib/uploaded-file-storage";
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
  SessionTranscriptEntry,
  TutorSession,
  UploadedFileArtifact,
  UploadedFileSessionContext,
  UploadedFileSnapshotState,
  WorksheetAnswerKeyEntry,
  WorksheetArtifact,
  WorksheetDocument,
  WorksheetResponse,
  WorksheetSessionContext,
  WorksheetSnapshotState,
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
import {
  buildWorksheetContext,
  getSelectedWorksheetArtifact,
  getWorksheetArtifacts,
  getWorksheetResponses,
} from "@/lib/worksheet-state";
import {
  isGeneratedTutorSessionId,
  shouldMintFreshSessionForRoute,
} from "@/lib/session-routing";

const CANVAS_PERSISTENCE_PREFIX = "geminilearn-canvas";

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

const INITIAL_WORKSHEET_STATE: WorksheetSnapshotState = {
  activeWorksheetArtifactId: null,
  responsesByArtifactId: {},
};

const INITIAL_UPLOADED_FILE_STATE: UploadedFileSnapshotState = {
  activeUploadedFileArtifactId: null,
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
  worksheetState: WorksheetSnapshotState,
  uploadedFileState: UploadedFileSnapshotState,
) => ({
  contentView,
  activeTab,
  flashcardSession,
  visualizationState,
  deepDiveState,
  quizState,
  worksheetState,
  uploadedFileState,
  transcript: [],
});

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read uploaded file."));
    reader.readAsDataURL(file);
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

const tabToView: Partial<Record<WorkspaceTabId, ContentView>> = {
  flashcards: "flashcards",
  visualization: "visualization",
  deepdive: "deepdive",
};

type GeneratedArtifactFocusKey = "flashcards" | "visualization" | "deepdive";

const shouldAutoFocusArtifactTab = (
  currentActiveTab: WorkspaceTabId,
  targetTab: WorkspaceTabId,
  manualOverrideTab: WorkspaceTabId | null = null,
) =>
  (!manualOverrideTab || manualOverrideTab === targetTab) &&
  (currentActiveTab === "canvas" || currentActiveTab === targetTab);

const appendTranscriptEntry = (
  entries: SessionTranscriptEntry[],
  entry: SessionTranscriptEntry,
) => {
  const normalizedText = entry.text.trim();
  if (!normalizedText) {
    return entries;
  }

  const latestEntry = entries.at(-1);
  if (
    latestEntry &&
    latestEntry.role === entry.role &&
    latestEntry.text.trim() === normalizedText &&
    Math.abs(entry.timestamp.getTime() - latestEntry.timestamp.getTime()) <= 5000
  ) {
    return entries;
  }

  const nextEntries = [
    ...entries.filter((candidate) => candidate.id !== entry.id),
    {
      ...entry,
      text: normalizedText,
    },
  ]
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

  return nextEntries;
};

const endActiveSessions = (sessions: TutorSession[], now: Date): TutorSession[] =>
  sessions.map((session) => {
    if (session.status !== "active") {
      return session;
    }

    const endedSession: TutorSession = {
      ...session,
      endedAt: now,
      events: [
        ...session.events,
        {
          id: createEventId(),
          text: "Session automatically ended when a new session started.",
          timestamp: now,
          type: "session_ended",
        },
      ],
      status: "ended",
      updatedAt: now,
    };

    return {
      ...endedSession,
      summary: buildSessionSummary(endedSession),
    };
  });

interface SessionWorkspaceProps {
  sessionId: string;
  seedTitle?: string | null;
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
      INITIAL_WORKSHEET_STATE,
      INITIAL_UPLOADED_FILE_STATE,
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

function TranscriptToggleIcon({ className }: { className?: string }) {
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
      <path d="M5.75 6.75A1.75 1.75 0 0 1 7.5 5h9a1.75 1.75 0 0 1 1.75 1.75v6.5A1.75 1.75 0 0 1 16.5 15H11l-3.75 3v-3H7.5a1.75 1.75 0 0 1-1.75-1.75Z" />
      <path d="M9 8.75h6" />
      <path d="M9 11.75h4.5" />
    </svg>
  );
}

function TabRestoreIcon({ className }: { className?: string }) {
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
      <path d="M3 12a9 9 0 1 0 3.12-6.79" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function TabCloseIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function CanvasLoadingState({ label = "Loading canvas..." }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-white">
      <div className="text-center">
        <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-slate-200 border-t-slate-500" />
        <p className="text-lg text-slate-500">{label}</p>
      </div>
    </div>
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

export default function SessionWorkspace({
  sessionId,
  seedTitle = null,
}: SessionWorkspaceProps) {
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
  const [worksheetState, setWorksheetState] = useState<WorksheetSnapshotState>(
    bootstrapState.snapshot.worksheetState,
  );
  const [uploadedFileState, setUploadedFileState] =
    useState<UploadedFileSnapshotState>(
      bootstrapState.snapshot.uploadedFileState,
    );
  const [transcriptEntries, setTranscriptEntries] = useState<
    SessionTranscriptEntry[]
  >(bootstrapState.snapshot.transcript);
  const [transcriptPreview, setTranscriptPreview] =
    useState<SessionTranscriptEntry | null>(null);
  const [isTranscriptHidden, setIsTranscriptHidden] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [shouldMountCanvas, setShouldMountCanvas] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<WorkspaceTabId[]>(["canvas"]);
  const [closedTabIds, setClosedTabIds] = useState<WorkspaceTabId[]>([]);
  const [recentlyClosedTabIds, setRecentlyClosedTabIds] = useState<
    WorkspaceTabId[]
  >([]);
  const [draggedTabId, setDraggedTabId] = useState<WorkspaceTabId | null>(null);
  const [isRestoreMenuOpen, setIsRestoreMenuOpen] = useState(false);

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
  const transcriptEntriesRef = useRef<SessionTranscriptEntry[]>(
    bootstrapState.snapshot.transcript,
  );
  const transcriptPreviewRef = useRef<SessionTranscriptEntry | null>(null);
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
  const worksheetContextRef = useRef<WorksheetSessionContext | null>(null);
  const uploadedFileContextRef = useRef<UploadedFileSessionContext | null>(null);
  const activeSessionRef = useRef<TutorSession | null>(null);
  const activeTabRef = useRef<WorkspaceTabId>(bootstrapState.snapshot.activeTab);
  const availableTabsRef = useRef<WorkspaceTabId[]>([]);
  const lastManualTabChangeAtRef = useRef(0);
  const manualTabOverrideRef = useRef<WorkspaceTabId | null>(null);
  const pendingGeneratedArtifactFocusRef = useRef<
    Record<
      GeneratedArtifactFocusKey,
      { startedAt: number; startTab: WorkspaceTabId } | null
    >
  >({
    flashcards: null,
    visualization: null,
    deepdive: null,
  });
  const restoreMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingRedirectSessionIdRef = useRef<string | null>(null);
  const pendingSeedBootstrapRef = useRef<PendingSessionSeed | null>(null);
  const persistTimeoutRef = useRef<number | null>(null);
  const hasPendingPersistRef = useRef(false);
  const isHistoryMergePendingRef = useRef(false);
  const skipBeforeUnloadRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toolWaitersRef = useRef<
    Array<{
      expectedTools: string[];
      reject: (error: Error) => void;
      resolve: (event: SmokeToolEventSummary) => void;
      timeoutId: number;
    }>
  >([]);

  const matchedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId],
  );
  const activeSession = matchedSession ?? sessions[0] ?? null;
  const redirectSessionId =
    hasHydratedSession && !matchedSession ? sessions[0]?.id ?? null : null;

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

  const worksheetArtifacts = useMemo<WorksheetArtifact[]>(
    () => getWorksheetArtifacts(activeSession?.artifacts ?? []),
    [activeSession],
  );

  const uploadedFileArtifacts = useMemo<UploadedFileArtifact[]>(
    () =>
      activeSession?.artifacts.filter(
        (artifact): artifact is UploadedFileArtifact =>
          artifact.type === "uploaded_file",
      ) ?? [],
    [activeSession],
  );

  const selectedWorksheetArtifact = useMemo<WorksheetArtifact | null>(
    () => getSelectedWorksheetArtifact(worksheetArtifacts, worksheetState),
    [worksheetArtifacts, worksheetState],
  );

  const selectedWorksheetResponses = useMemo<Record<string, WorksheetResponse>>(
    () => getWorksheetResponses(worksheetState, selectedWorksheetArtifact?.id),
    [selectedWorksheetArtifact?.id, worksheetState],
  );

  const selectedUploadedFileArtifact = useMemo<UploadedFileArtifact | null>(
    () =>
      uploadedFileArtifacts.find(
        (artifact) =>
          artifact.id === uploadedFileState.activeUploadedFileArtifactId,
      ) ??
      uploadedFileArtifacts[0] ??
      null,
    [uploadedFileArtifacts, uploadedFileState.activeUploadedFileArtifactId],
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

  const worksheetContext = useMemo<WorksheetSessionContext | null>(
    () => buildWorksheetContext(selectedWorksheetArtifact, selectedWorksheetResponses),
    [selectedWorksheetArtifact, selectedWorksheetResponses],
  );

  const uploadedFileContext = useMemo<UploadedFileSessionContext | null>(
    () =>
      selectedUploadedFileArtifact
        ? {
            artifactId: selectedUploadedFileArtifact.id,
            title: selectedUploadedFileArtifact.title,
            summary: selectedUploadedFileArtifact.summary,
            fileName: selectedUploadedFileArtifact.fileName,
            mimeType: selectedUploadedFileArtifact.mimeType,
            extractedText: selectedUploadedFileArtifact.extractedText,
          }
        : null,
    [selectedUploadedFileArtifact],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (sessionId === "new" || sessionId === "local-dev") {
        const nextSessionId = createSessionId();
        queuePendingTutorSessionSeed({
          id: nextSessionId,
          title: seedTitle ?? undefined,
        });
        pendingRedirectSessionIdRef.current = nextSessionId;
        router.replace(`/sessions/${nextSessionId}`);
        return;
      }

      const pendingSeed = consumePendingTutorSessionSeed(sessionId);

      if (pendingSeed) {
        const createdAt = pendingSeed.createdAt
          ? new Date(pendingSeed.createdAt)
          : new Date();
        const createdSession = createTutorSessionFromSeed({
          createdAt,
          sessionId,
          sessions: [],
          title: pendingSeed.title,
        });
        const persistedTranscriptEntries = loadSessionTranscript(createdSession.id);
        const nextTranscriptEntries =
          persistedTranscriptEntries.length > 0
            ? persistedTranscriptEntries
            : createdSession.snapshot.transcript;

        pendingSeedBootstrapRef.current = pendingSeed;
        isHistoryMergePendingRef.current = true;
        hasPendingPersistRef.current = false;

        setSessions([createdSession]);
        setCurrentContentView(createdSession.snapshot.contentView);
        setFlashcardSession(createdSession.snapshot.flashcardSession);
        setVisualizationState(createdSession.snapshot.visualizationState);
        setDeepDiveState(createdSession.snapshot.deepDiveState);
        setActiveTab(createdSession.snapshot.activeTab);
        setQuizSelections(createdSession.snapshot.quizState.selections);
        setIsQuizSubmitted(createdSession.snapshot.quizState.isSubmitted);
        setWorksheetState(createdSession.snapshot.worksheetState);
        setUploadedFileState(createdSession.snapshot.uploadedFileState);
        setTranscriptEntries(nextTranscriptEntries);
        transcriptPreviewRef.current = null;
        setTranscriptPreview(null);
        setActiveSheetName(null);

        artifactMarkerRef.current = {
          flashcards:
            createdSession.snapshot.flashcardSession.generatedAt?.toISOString() ?? "",
          visualization:
            createdSession.snapshot.visualizationState.generatedAt?.toISOString() ?? "",
          deepdive:
            createdSession.snapshot.deepDiveState.generatedAt?.toISOString() ?? "",
        };
        lastViewRef.current = createdSession.snapshot.contentView;
        transcriptEntriesRef.current = nextTranscriptEntries;
        flashcardSessionStateRef.current = createdSession.snapshot.flashcardSession;
        visualizationStateRef.current = createdSession.snapshot.visualizationState;
        activeSessionRef.current = createdSession;
        activeTabRef.current = createdSession.snapshot.activeTab;

        setHasHydratedSession(true);
        return;
      }

      const loaded = ensureSessionSummaries(repository.list());
      const hasMatchingSession = loaded.some((session) => session.id === sessionId);

      if (
        shouldMintFreshSessionForRoute({
          sessionId,
          hasMatchingSession,
          hasPendingSeed: Boolean(pendingSeed),
        })
      ) {
        const nextSessionId = createSessionId();
        queuePendingTutorSessionSeed({ id: nextSessionId });
        pendingRedirectSessionIdRef.current = nextSessionId;
        router.replace(`/sessions/${nextSessionId}`);
        return;
      }

      const shouldCreatePendingSession =
        !hasMatchingSession && isGeneratedTutorSessionId(sessionId);

      let nextSessions = loaded;

      if (shouldCreatePendingSession) {
        const now = new Date();
        const endedSessions = endActiveSessions(loaded, now);
        const createdSession = createTutorSessionFromSeed({
          createdAt: now,
          sessionId,
          sessions: endedSessions,
        });

        nextSessions = [createdSession, ...endedSessions].slice(0, 30);
        hasPendingPersistRef.current = true;
      } else if (loaded.length === 0) {
        nextSessions = [
          createTutorSessionFromSeed({
            sessionId,
            sessions: [],
            title: "Session 1",
          }),
        ];
        hasPendingPersistRef.current = true;
      } else {
        hasPendingPersistRef.current = false;
      }

      const nextActive =
        nextSessions.find((session) => session.id === sessionId) ?? nextSessions[0];
      const persistedTranscriptEntries = loadSessionTranscript(nextActive.id);
      const nextTranscriptEntries =
        persistedTranscriptEntries.length > 0
          ? persistedTranscriptEntries
          : nextActive.snapshot.transcript;

      setSessions(nextSessions);
      setCurrentContentView(nextActive.snapshot.contentView);
      setFlashcardSession(nextActive.snapshot.flashcardSession);
      setVisualizationState(nextActive.snapshot.visualizationState);
      setDeepDiveState(nextActive.snapshot.deepDiveState);
      setActiveTab(nextActive.snapshot.activeTab);
      setQuizSelections(nextActive.snapshot.quizState.selections);
      setIsQuizSubmitted(nextActive.snapshot.quizState.isSubmitted);
      setWorksheetState(nextActive.snapshot.worksheetState);
      setUploadedFileState(nextActive.snapshot.uploadedFileState);
      setTranscriptEntries(nextTranscriptEntries);
      transcriptPreviewRef.current = null;
      setTranscriptPreview(null);
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
      transcriptEntriesRef.current = nextTranscriptEntries;
      flashcardSessionStateRef.current = nextActive.snapshot.flashcardSession;
      visualizationStateRef.current = nextActive.snapshot.visualizationState;
      activeSessionRef.current = nextActive;
      activeTabRef.current = nextActive.snapshot.activeTab;

      if (
        persistedTranscriptEntries.length === 0 &&
        nextActive.snapshot.transcript.length > 0
      ) {
        window.setTimeout(() => {
          saveSessionTranscript(nextActive.id, nextActive.snapshot.transcript);
        }, 0);
      }

      setHasHydratedSession(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [repository, router, seedTitle, sessionId]);

  useEffect(() => {
    if (!hasHydratedSession || !pendingSeedBootstrapRef.current) {
      return;
    }

    const mergeHistory = () => {
      const currentSession = activeSessionRef.current;
      if (!currentSession || currentSession.id !== sessionId) {
        isHistoryMergePendingRef.current = false;
        pendingSeedBootstrapRef.current = null;
        return;
      }

      const loaded = ensureSessionSummaries(repository.list());
      const nextSessions = [
        currentSession,
        ...endActiveSessions(
          loaded.filter((session) => session.id !== currentSession.id),
          currentSession.createdAt,
        ),
      ].slice(0, 30);

      pendingSeedBootstrapRef.current = null;
      isHistoryMergePendingRef.current = false;
      setSessions(nextSessions);
      repository.saveAll(ensureSessionSummaries(nextSessions));
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(mergeHistory, { timeout: 3000 });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(mergeHistory, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasHydratedSession, repository, sessionId]);

  useEffect(() => {
    if (!hasHydratedSession) {
      return;
    }

    const runMaintenance = () => {
      runLegacyTranscriptMaintenance();
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(runMaintenance, { timeout: 10000 });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(runMaintenance, 5000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasHydratedSession]);

  useEffect(() => {
    if (!hasHydratedSession) {
      return;
    }

    if (matchedSession) {
      pendingRedirectSessionIdRef.current = null;
      return;
    }

    const nextSessionId = sessions[0]?.id ?? null;
    if (!nextSessionId || nextSessionId === sessionId) {
      pendingRedirectSessionIdRef.current = null;
      return;
    }

    if (pendingRedirectSessionIdRef.current === nextSessionId) {
      return;
    }

    pendingRedirectSessionIdRef.current = nextSessionId;
    router.replace(`/sessions/${nextSessionId}`);
  }, [matchedSession, hasHydratedSession, sessionId, sessions, router]);

  useEffect(() => {
    if (!hasHydratedSession) {
      return;
    }

    if (!hasPendingPersistRef.current) {
      return;
    }

    if (isHistoryMergePendingRef.current) {
      return;
    }

    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      repository.saveAll(ensureSessionSummaries(sessions));
      hasPendingPersistRef.current = false;
      persistTimeoutRef.current = null;
    }, 180);

    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [hasHydratedSession, sessions, repository]);

  useEffect(() => {
    if (!hasHydratedSession) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipBeforeUnloadRef.current || activeSession?.status !== "active") {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [activeSession?.status, hasHydratedSession]);

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
      nextWorksheetState,
      nextUploadedFileState,
    }: {
      nextContentView?: ContentView;
      nextActiveTab?: WorkspaceTabId;
      nextFlashcardSession?: FlashcardSessionState;
      nextVisualizationState?: VisualizationState;
      nextDeepDiveState?: DeepDiveState;
      nextQuizState?: QuizSnapshotState;
      nextWorksheetState?: WorksheetSnapshotState;
      nextUploadedFileState?: UploadedFileSnapshotState;
      appendEvent?: SessionEvent;
      appendArtifact?: SessionArtifact;
      nextStatus?: TutorSession["status"];
      nextEndedAt?: Date | null;
      nextSummary?: string;
    }) => {
      const targetSessionId = activeSessionRef.current?.id ?? sessionId;
      const snapshot = buildSnapshot(
        nextContentView ?? currentContentView,
        nextActiveTab ?? activeTab,
        nextFlashcardSession ?? flashcardSession,
        nextVisualizationState ?? visualizationState,
        nextDeepDiveState ?? deepDiveState,
        nextQuizState ?? quizSnapshot,
        nextWorksheetState ?? worksheetState,
        nextUploadedFileState ?? uploadedFileState,
      );

      hasPendingPersistRef.current = true;
      setSessions((prev) =>
        applySessionUpdate({
          sessions: prev,
          sessionId: targetSessionId,
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
      currentContentView,
      activeTab,
      flashcardSession,
      visualizationState,
      deepDiveState,
      quizSnapshot,
      sessionId,
      worksheetState,
      uploadedFileState,
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

  const ensureTabVisible = useCallback((tabId: WorkspaceTabId) => {
    setTabOrder((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
    setClosedTabIds((prev) => prev.filter((id) => id !== tabId));
    setRecentlyClosedTabIds((prev) => prev.filter((id) => id !== tabId));
  }, []);

  const markManualTabChange = useCallback((tabId: WorkspaceTabId) => {
    lastManualTabChangeAtRef.current = Date.now();
    manualTabOverrideRef.current = tabId;
  }, []);

  const beginGeneratedArtifactFocus = useCallback(
    (key: GeneratedArtifactFocusKey) => {
      pendingGeneratedArtifactFocusRef.current[key] = {
        startedAt: Date.now(),
        startTab: activeTabRef.current,
      };
    },
    [],
  );

  const clearGeneratedArtifactFocus = useCallback(
    (key: GeneratedArtifactFocusKey) => {
      pendingGeneratedArtifactFocusRef.current[key] = null;
    },
    [],
  );

  const shouldRevealGeneratedArtifactTab = useCallback(
    (key: GeneratedArtifactFocusKey, targetTab: WorkspaceTabId) => {
      const pending = pendingGeneratedArtifactFocusRef.current[key];
      pendingGeneratedArtifactFocusRef.current[key] = null;

      if (!pending) {
        return shouldAutoFocusArtifactTab(
          activeTabRef.current,
          targetTab,
          manualTabOverrideRef.current,
        );
      }

      if (lastManualTabChangeAtRef.current > pending.startedAt) {
        return false;
      }

      if (activeTabRef.current !== pending.startTab) {
        return false;
      }

      return shouldAutoFocusArtifactTab(
        pending.startTab,
        targetTab,
        manualTabOverrideRef.current,
      );
    },
    [],
  );

  const replaceTranscriptEntries = useCallback(
    (nextEntries: SessionTranscriptEntry[]) => {
      transcriptEntriesRef.current = nextEntries;
      setTranscriptEntries(nextEntries);
      const targetSessionId = activeSessionRef.current?.id ?? sessionId;
      saveSessionTranscript(targetSessionId, nextEntries);
    },
    [sessionId],
  );

  const setActiveTranscriptPreview = useCallback(
    (preview: SessionTranscriptEntry | null) => {
      transcriptPreviewRef.current = preview;
      setTranscriptPreview(preview);
    },
    [],
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
      worksheetState,
      uploadedFileState,
    );

    const nextSessions = applySessionUpdate({
      sessions,
      sessionId: activeSession.id,
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

    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
    hasPendingPersistRef.current = false;
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
    sessions,
    uploadedFileState,
    visualizationState,
    worksheetState,
  ]);

  const handleConfirmExit = useCallback(async () => {
    setIsExitModalOpen(false);
    skipBeforeUnloadRef.current = true;

    try {
      await voiceAgentControllerRef.current?.disconnectAgent();
    } catch {
      // Ignore disconnect failures while leaving the workspace.
    }

    endSession();
    router.push("/");
  }, [endSession, router]);

  const setContentView = useCallback(
    (view: ContentView) => {
      const targetTab = viewToTab[view];
      const shouldFocusTargetTab = shouldAutoFocusArtifactTab(
        activeTabRef.current,
        targetTab,
        manualTabOverrideRef.current,
      );

      setCurrentContentView(view);
      ensureTabVisible(targetTab);
      if (shouldFocusTargetTab) {
        setActiveTab(targetTab);
        activeTabRef.current = targetTab;
      }

      if (view !== lastViewRef.current) {
        lastViewRef.current = view;
        pushSessionEvent("view_changed", `Switched to ${viewLabel[view]} view.`);
      }

      persistActiveUpdate({
        nextContentView: view,
        nextActiveTab: shouldFocusTargetTab ? targetTab : undefined,
      });
    },
    [ensureTabVisible, persistActiveUpdate, pushSessionEvent],
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
      const shouldShowFlashcards = shouldRevealGeneratedArtifactTab(
        "flashcards",
        "flashcards",
      );

      setFlashcardSession(nextState);
      if (shouldShowFlashcards) {
        ensureTabVisible("flashcards");
        setActiveTab("flashcards");
        activeTabRef.current = "flashcards";
      }

      if (!nextState.generatedAt || cards.length === 0) {
        persistActiveUpdate({
          nextFlashcardSession: nextState,
          nextActiveTab: shouldShowFlashcards ? "flashcards" : undefined,
        });
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
          nextActiveTab: shouldShowFlashcards ? "flashcards" : undefined,
        });
        return;
      }

      persistActiveUpdate({
        nextFlashcardSession: nextState,
        nextActiveTab: shouldShowFlashcards ? "flashcards" : undefined,
      });
    },
    [ensureTabVisible, persistActiveUpdate, shouldRevealGeneratedArtifactTab],
  );

  const handleSetMode = useCallback(
    (mode: FlashcardSessionState["mode"]) => {
      const next = {
        ...flashcardSession,
        mode,
      };

      if (mode === "generating") {
        beginGeneratedArtifactFocus("flashcards");
      } else if (mode === "idle") {
        clearGeneratedArtifactFocus("flashcards");
      }

      setFlashcardSession(next);
      persistActiveUpdate({
        nextFlashcardSession: next,
      });
    },
    [
      beginGeneratedArtifactFocus,
      clearGeneratedArtifactFocus,
      flashcardSession,
      persistActiveUpdate,
    ],
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
      const shouldShowVisualization = shouldRevealGeneratedArtifactTab(
        "visualization",
        "visualization",
      );

      setVisualizationState(next);
      if (shouldShowVisualization) {
        ensureTabVisible("visualization");
        setActiveTab("visualization");
        activeTabRef.current = "visualization";
      }

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
          nextActiveTab: shouldShowVisualization ? "visualization" : undefined,
        });
        return;
      }

      persistActiveUpdate({
        nextVisualizationState: next,
        nextActiveTab: shouldShowVisualization ? "visualization" : undefined,
      });
    },
    [ensureTabVisible, persistActiveUpdate, shouldRevealGeneratedArtifactTab],
  );

  const handleSetVisualizationMode = useCallback(
    (mode: VisualizationState["mode"]) => {
      const next = {
        ...visualizationState,
        mode,
      };

      if (mode === "generating") {
        beginGeneratedArtifactFocus("visualization");
      } else if (mode === "idle") {
        clearGeneratedArtifactFocus("visualization");
      }

      setVisualizationState(next);
      persistActiveUpdate({
        nextVisualizationState: next,
      });
    },
    [
      beginGeneratedArtifactFocus,
      clearGeneratedArtifactFocus,
      persistActiveUpdate,
      visualizationState,
    ],
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
      const shouldShowDeepDive = shouldRevealGeneratedArtifactTab(
        "deepdive",
        "deepdive",
      );

      setDeepDiveState(next);
      if (shouldShowDeepDive) {
        ensureTabVisible("deepdive");
        setActiveTab("deepdive");
        activeTabRef.current = "deepdive";
      }

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
          nextActiveTab: shouldShowDeepDive ? "deepdive" : undefined,
        });
        return;
      }

      persistActiveUpdate({
        nextDeepDiveState: next,
        nextActiveTab: shouldShowDeepDive ? "deepdive" : undefined,
      });
    },
    [ensureTabVisible, persistActiveUpdate, shouldRevealGeneratedArtifactTab],
  );

  const handleSetDeepDiveMode = useCallback(
    (mode: DeepDiveState["mode"]) => {
      const next = {
        ...deepDiveState,
        mode,
      };

      if (mode === "generating") {
        beginGeneratedArtifactFocus("deepdive");
      } else if (mode === "idle") {
        clearGeneratedArtifactFocus("deepdive");
      }

      setDeepDiveState(next);
      persistActiveUpdate({
        nextDeepDiveState: next,
      });
    },
    [
      beginGeneratedArtifactFocus,
      clearGeneratedArtifactFocus,
      deepDiveState,
      persistActiveUpdate,
    ],
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
      const shouldShowDocs = shouldAutoFocusArtifactTab(
        activeTabRef.current,
        "docs",
        manualTabOverrideRef.current,
      );
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
        nextActiveTab: shouldShowDocs ? "docs" : undefined,
      });
      ensureTabVisible("docs");
      if (shouldShowDocs) {
        setActiveTab("docs");
        activeTabRef.current = "docs";
      }
    },
    [ensureTabVisible, persistActiveUpdate],
  );

  const handleSetGoogleSheet = useCallback(
    (title: string, summary: string, sheets: GoogleSheetTab[]) => {
      const shouldShowSheets = shouldAutoFocusArtifactTab(
        activeTabRef.current,
        "sheets",
        manualTabOverrideRef.current,
      );
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
        nextActiveTab: shouldShowSheets ? "sheets" : undefined,
      });
      ensureTabVisible("sheets");
      if (shouldShowSheets) {
        setActiveTab("sheets");
        activeTabRef.current = "sheets";
      }
    },
    [ensureTabVisible, persistActiveUpdate],
  );

  const handleSetQuiz = useCallback(
    (title: string, summary: string, questions: QuizQuestion[]) => {
      const shouldShowQuiz = shouldAutoFocusArtifactTab(
        activeTabRef.current,
        "quiz",
        manualTabOverrideRef.current,
      );
      const artifact: SessionArtifact = {
        id: createArtifactId(),
        type: "quiz",
        title,
        createdAt: new Date(),
        summary,
        questions,
      };
      setQuizSelections({});
      setIsQuizSubmitted(false);
      ensureTabVisible("quiz");
      if (shouldShowQuiz) {
        setActiveTab("quiz");
        activeTabRef.current = "quiz";
      }
      persistActiveUpdate({
        appendArtifact: artifact,
        appendEvent: createArtifactEvent(artifact),
        nextActiveTab: shouldShowQuiz ? "quiz" : undefined,
        nextQuizState: {
          selections: {},
          isSubmitted: false,
        },
      });
    },
    [ensureTabVisible, persistActiveUpdate],
  );

  const handleSetWorksheet = useCallback(
    ({
      title,
      summary,
      instructions,
      estimatedTimeMinutes,
      difficulty,
      document,
      answerKey,
    }: {
      title: string;
      summary: string;
      instructions: string;
      estimatedTimeMinutes: number | null;
      difficulty: "easy" | "medium" | "hard" | null;
      document: WorksheetDocument;
      answerKey: WorksheetAnswerKeyEntry[];
    }) => {
      const artifact: WorksheetArtifact = {
        id: createArtifactId(),
        type: "worksheet",
        title,
        createdAt: new Date(),
        summary,
        instructions,
        estimatedTimeMinutes,
        difficulty,
        document,
        answerKey,
      };

      const nextWorksheetState: WorksheetSnapshotState = {
        activeWorksheetArtifactId: artifact.id,
        responsesByArtifactId: {
          ...worksheetState.responsesByArtifactId,
          [artifact.id]: {},
        },
      };
      const shouldShowWorksheet = shouldAutoFocusArtifactTab(
        activeTabRef.current,
        "worksheet",
        manualTabOverrideRef.current,
      );

      setWorksheetState(nextWorksheetState);
      ensureTabVisible("worksheet");
      if (shouldShowWorksheet) {
        setActiveTab("worksheet");
        activeTabRef.current = "worksheet";
      }
      persistActiveUpdate({
        appendArtifact: artifact,
        appendEvent: createArtifactEvent(artifact),
        nextActiveTab: shouldShowWorksheet ? "worksheet" : undefined,
        nextWorksheetState,
      });
    },
    [ensureTabVisible, persistActiveUpdate, worksheetState.responsesByArtifactId],
  );

  const handleSelectWorksheetArtifact = useCallback(
    (artifactId: string) => {
      const nextWorksheetState: WorksheetSnapshotState = {
        ...worksheetState,
        activeWorksheetArtifactId: artifactId,
      };

      setWorksheetState(nextWorksheetState);
      markManualTabChange("worksheet");
      ensureTabVisible("worksheet");
      setActiveTab("worksheet");
      activeTabRef.current = "worksheet";
      persistActiveUpdate({
        nextActiveTab: "worksheet",
        nextWorksheetState,
      });
    },
    [ensureTabVisible, markManualTabChange, persistActiveUpdate, worksheetState],
  );

  const handleUpdateWorksheetResponse = useCallback(
    (
      artifactId: string,
      questionId: string,
      response: WorksheetResponse,
    ) => {
      setWorksheetState((prev) => {
        const nextWorksheetState: WorksheetSnapshotState = {
          activeWorksheetArtifactId: artifactId,
          responsesByArtifactId: {
            ...prev.responsesByArtifactId,
            [artifactId]: {
              ...(prev.responsesByArtifactId[artifactId] ?? {}),
              [questionId]: response,
            },
          },
        };

        persistActiveUpdate({
          nextWorksheetState,
          nextActiveTab: "worksheet",
        });

        return nextWorksheetState;
      });
    },
    [persistActiveUpdate],
  );

  const handleSelectUploadedFile = useCallback(
    (artifactId: string) => {
      const nextUploadedFileState: UploadedFileSnapshotState = {
        activeUploadedFileArtifactId: artifactId,
      };

      setUploadedFileState(nextUploadedFileState);
      markManualTabChange("file");
      ensureTabVisible("file");
      setActiveTab("file");
      activeTabRef.current = "file";
      persistActiveUpdate({
        nextActiveTab: "file",
        nextUploadedFileState,
      });
    },
    [ensureTabVisible, markManualTabChange, persistActiveUpdate],
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      const inferredMimeType =
        file.type ||
        (file.name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/octet-stream");

      if (
        inferredMimeType !== "application/pdf" &&
        !inferredMimeType.startsWith("image/")
      ) {
        setUploadError("Only PDF and image uploads are supported right now.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setUploadError("File is too large. Keep uploads under 10 MB.");
        return;
      }

      setIsUploadingFile(true);
      setUploadError(null);

      try {
        const artifactId = createArtifactId();
        const targetSessionId = activeSessionRef.current?.id ?? sessionId;
        const storageKey = buildUploadedFileStorageKey(targetSessionId, artifactId);

        await persistUploadedFileBlob(storageKey, file);

        const dataUrl = await readFileAsDataUrl(file);
        const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
        if (!match) {
          throw new Error("Uploaded file data could not be read.");
        }

        let extractedText: string | null = null;
        let title =
          file.name.replace(/\.[^.]+$/, "").trim() || "Uploaded file";
        let summary = "Uploaded study file available in the session.";

        try {
          const response = await fetch("/api/extract-uploaded-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataBase64: match[2],
              fileName: file.name,
              mimeType: inferredMimeType,
            }),
          });
          const payload = await response.json();
          if (response.ok && payload.success !== false) {
            title =
              typeof payload.title === "string" && payload.title.trim().length > 0
                ? payload.title
                : title;
            summary =
              typeof payload.summary === "string" &&
              payload.summary.trim().length > 0
                ? payload.summary
                : summary;
            extractedText =
              typeof payload.extractedText === "string" &&
              payload.extractedText.trim().length > 0
                ? payload.extractedText
                : null;
          }
        } catch {
          // Upload still succeeds if file extraction fails.
        }

        const artifact: UploadedFileArtifact = {
          id: artifactId,
          type: "uploaded_file",
          title,
          createdAt: new Date(),
          summary,
          fileName: file.name,
          mimeType: inferredMimeType,
          storageKey,
          extractedText,
        };

        const nextUploadedFileState: UploadedFileSnapshotState = {
          activeUploadedFileArtifactId: artifact.id,
        };
        const shouldShowFile = true;

        setUploadedFileState(nextUploadedFileState);
        ensureTabVisible("file");
        if (shouldShowFile) {
          manualTabOverrideRef.current = "file";
          setActiveTab("file");
          activeTabRef.current = "file";
        }
        persistActiveUpdate({
          appendArtifact: artifact,
          appendEvent: createArtifactEvent(artifact),
          nextActiveTab: shouldShowFile ? "file" : undefined,
          nextUploadedFileState,
        });
      } catch (error) {
        setUploadError(
          error instanceof Error ? error.message : "Failed to upload file.",
        );
      } finally {
        setIsUploadingFile(false);
      }
    },
    [ensureTabVisible, persistActiveUpdate, sessionId],
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
      setActiveTranscriptPreview(null);
      replaceTranscriptEntries(
        appendTranscriptEntry(transcriptEntriesRef.current, {
          id: event.id,
          role: "assistant",
          text: event.text,
          timestamp: event.timestamp,
        }),
      );
    },
    [replaceTranscriptEntries, setActiveTranscriptPreview],
  );

  const handleVoiceUserTurn = useCallback((event: VoiceUserTurnEvent) => {
    setActiveTranscriptPreview(null);
    replaceTranscriptEntries(
      appendTranscriptEntry(transcriptEntriesRef.current, {
        id: event.id,
        role: "user",
        text: event.text,
        timestamp: event.timestamp,
      }),
    );
  }, [replaceTranscriptEntries, setActiveTranscriptPreview]);

  const handleVoiceTranscriptPreview = useCallback(
    (event: VoiceTranscriptPreviewEvent | null) => {
      if (!event || !event.text.trim()) {
        setActiveTranscriptPreview(null);
        return;
      }

      const normalizedText = event.text.replace(/\s+$/g, "");
      const currentPreview = transcriptPreviewRef.current;

      const previewId =
        currentPreview && currentPreview.role === event.role
          ? currentPreview.id
          : createEventId();

      setActiveTranscriptPreview({
        id: previewId,
        role: event.role,
        text: normalizedText,
        timestamp: event.timestamp,
        });
    },
    [setActiveTranscriptPreview],
  );

  const baseTabs = useMemo<WorkspaceTab[]>(
    () =>
      buildWorkspaceTabs({
        flashcardSession,
        visualizationState,
        deepDiveState,
        activeSession,
      }),
    [flashcardSession, visualizationState, deepDiveState, activeSession],
  );

  useEffect(() => {
    const baseTabIds = baseTabs.map((tab) => tab.id);
    setTabOrder((prev) => [
      ...prev.filter((id) => baseTabIds.includes(id)),
      ...baseTabIds.filter((id) => !prev.includes(id)),
    ]);
    setClosedTabIds((prev) =>
      prev.filter((id) => id !== "canvas" && baseTabIds.includes(id)),
    );
    setRecentlyClosedTabIds((prev) =>
      prev.filter((id) => id !== "canvas" && baseTabIds.includes(id)),
    );
  }, [baseTabs]);

  useEffect(() => {
    setTabOrder(["canvas"]);
    setClosedTabIds([]);
    setRecentlyClosedTabIds([]);
    setDraggedTabId(null);
    setIsRestoreMenuOpen(false);
    manualTabOverrideRef.current = null;
  }, [sessionId]);

  const orderedTabs = useMemo<WorkspaceTab[]>(() => {
    const byId = new Map(baseTabs.map((tab) => [tab.id, tab]));
    const orderedIds = [
      ...tabOrder.filter((id) => byId.has(id)),
      ...baseTabs.map((tab) => tab.id).filter((id) => !tabOrder.includes(id)),
    ];

    return orderedIds
      .map((id) => byId.get(id) ?? null)
      .filter(Boolean) as WorkspaceTab[];
  }, [baseTabs, tabOrder]);

  const tabs = useMemo<WorkspaceTab[]>(
    () =>
      orderedTabs.filter(
        (tab) => tab.id === "canvas" || !closedTabIds.includes(tab.id),
      ),
    [closedTabIds, orderedTabs],
  );

  const recentlyClosedTabs = useMemo<WorkspaceTab[]>(() => {
    const byId = new Map(orderedTabs.map((tab) => [tab.id, tab]));
    return recentlyClosedTabIds
      .map((tabId) => byId.get(tabId) ?? null)
      .filter(Boolean) as WorkspaceTab[];
  }, [orderedTabs, recentlyClosedTabIds]);

  const activeTabId = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "canvas";
  const hasTranscriptContent =
    transcriptEntries.length > 0 || Boolean(transcriptPreview?.text.trim());

  useEffect(() => {
    if (tabs.some((tab) => tab.id === activeTab)) {
      return;
    }

    const fallbackTabId = tabs[0]?.id ?? "canvas";
    setActiveTab(fallbackTabId);
    activeTabRef.current = fallbackTabId;
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!isRestoreMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        restoreMenuRef.current &&
        !restoreMenuRef.current.contains(event.target as Node)
      ) {
        setIsRestoreMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isRestoreMenuOpen]);

  useEffect(() => {
    if (!hasHydratedSession || shouldMountCanvas || activeTabId !== "canvas") {
      return;
    }

    const mountCanvas = () => {
      setShouldMountCanvas(true);
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(mountCanvas, { timeout: 500 });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(mountCanvas, 160);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTabId, hasHydratedSession, shouldMountCanvas]);

  useEffect(() => {
    flashcardSessionStateRef.current = flashcardSession;
  }, [flashcardSession]);

  useEffect(() => {
    visualizationStateRef.current = visualizationState;
  }, [visualizationState]);

  useEffect(() => {
    transcriptEntriesRef.current = transcriptEntries;
  }, [transcriptEntries]);

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
        transcriptEntriesRef.current = [];
        transcriptPreviewRef.current = null;
        setTranscriptEntries([]);
        setTranscriptPreview(null);
        await voiceAgentControllerRef.current?.disconnectAgent();
        await clearCanvasEditor(canvasRef.current);
        canvasRef.current?.removePersistedScene();
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        clearStoredSessionTranscripts();
        window.setTimeout(() => {
          window.location.reload();
        }, 0);
      },
      connectVoiceAgent: async () => {
        const controller = voiceAgentControllerRef.current;
        if (!controller) {
          throw new Error("Voice agent controller is not available.");
        }

        await controller.connectVoiceAgent();
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
      injectTranscriptPreview: async ({ role, text }) => {
        handleVoiceTranscriptPreview({
          role,
          text,
          timestamp: new Date(),
        });
      },
      injectTranscriptTurn: async ({ role, text }) => {
        const timestamp = new Date();

        if (role === "assistant") {
          handleVoiceAssistantTurn({
            id: createEventId(),
            text,
            timestamp,
          });
          return;
        }

        handleVoiceUserTurn({
          id: createEventId(),
          text,
          timestamp,
          source: "text",
        });
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
            worksheetContext: worksheetContextRef.current,
            uploadedFileContext: uploadedFileContextRef.current,
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

        replaceTranscriptEntries(
          appendTranscriptEntry(transcriptEntriesRef.current, {
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
        ensureTabVisible(tabId);
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
          worksheetContext: worksheetContextRef.current,
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
  }, [
    handleSetVisualization,
    handleVoiceAssistantTurn,
    handleVoiceTranscriptPreview,
    handleVoiceUserTurn,
    ensureTabVisible,
    persistActiveUpdate,
    replaceTranscriptEntries,
    setContentView,
  ]);

  const handleTabSelect = useCallback((tabId: WorkspaceTabId) => {
    markManualTabChange(tabId);
    ensureTabVisible(tabId);
    setIsRestoreMenuOpen(false);
    setActiveTab(tabId);
    activeTabRef.current = tabId;

    if (tabId === "flashcards") {
      setContentView("flashcards");
    } else if (tabId === "visualization") {
      setContentView("visualization");
    } else if (tabId === "deepdive") {
      setContentView("deepdive");
    } else {
      persistActiveUpdate({ nextActiveTab: tabId });
    }
  }, [ensureTabVisible, markManualTabChange, persistActiveUpdate, setContentView]);

  const handleCloseTab = useCallback(
    (tabId: WorkspaceTabId) => {
      if (tabId === "canvas") {
        return;
      }

      setClosedTabIds((prev) =>
        prev.includes(tabId) ? prev : [...prev, tabId],
      );
      setRecentlyClosedTabIds((prev) => [
        tabId,
        ...prev.filter((id) => id !== tabId),
      ]);

      if (activeTabId !== tabId) {
        return;
      }

      const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
      const remainingTabs = tabs.filter((tab) => tab.id !== tabId);
      const fallbackTabId =
        remainingTabs[Math.max(0, currentIndex - 1)]?.id ??
        remainingTabs[0]?.id ??
        "canvas";

      manualTabOverrideRef.current = fallbackTabId;
      setActiveTab(fallbackTabId);
      activeTabRef.current = fallbackTabId;

      const nextView = tabToView[fallbackTabId];
      if (nextView) {
        setCurrentContentView(nextView);
        persistActiveUpdate({
          nextActiveTab: fallbackTabId,
          nextContentView: nextView,
        });
      } else {
        persistActiveUpdate({ nextActiveTab: fallbackTabId });
      }
    },
    [activeTabId, persistActiveUpdate, tabs],
  );

  const handleRestoreTab = useCallback(
    (tabId: WorkspaceTabId) => {
      ensureTabVisible(tabId);
      handleTabSelect(tabId);
    },
    [ensureTabVisible, handleTabSelect],
  );

  const handleTabDragStart = useCallback((tabId: WorkspaceTabId) => {
    setDraggedTabId(tabId);
  }, []);

  const handleTabDrop = useCallback(
    (targetTabId: WorkspaceTabId) => {
      setTabOrder((prev) => {
        const currentOrder = prev.length > 0 ? prev : orderedTabs.map((tab) => tab.id);
        if (
          !draggedTabId ||
          draggedTabId === targetTabId ||
          !currentOrder.includes(draggedTabId) ||
          !currentOrder.includes(targetTabId)
        ) {
          return currentOrder;
        }

        const nextOrder = currentOrder.filter((id) => id !== draggedTabId);
        const targetIndex = nextOrder.indexOf(targetTabId);
        nextOrder.splice(targetIndex, 0, draggedTabId);
        return nextOrder;
      });
      setDraggedTabId(null);
    },
    [draggedTabId, orderedTabs],
  );

  const handleUploadButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      void handleUploadFile(file);
    },
    [handleUploadFile],
  );

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
              subtitle={
                latestSheetArtifact?.summary ? (
                  <MarkdownText inline className="text-[11px] text-slate-500">
                    {latestSheetArtifact.summary}
                  </MarkdownText>
                ) : (
                  "Spreadsheet artifact"
                )
              }
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
              subtitle={
                latestDocArtifact?.summary ? (
                  <MarkdownText inline className="text-[11px] text-slate-500">
                    {latestDocArtifact.summary}
                  </MarkdownText>
                ) : (
                  "Memo artifact"
                )
              }
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
                    <MarkdownText className="text-sm leading-relaxed text-slate-700">
                      {section.content}
                    </MarkdownText>
                    {section.bullets.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {section.bullets.map((item, itemIndex) => (
                          <li key={`bullet-${index}-${itemIndex}`}>
                            <MarkdownText>{item}</MarkdownText>
                          </li>
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
              subtitle={
                latestQuizArtifact?.summary ? (
                  <MarkdownText inline className="text-[11px] text-slate-500">
                    {latestQuizArtifact.summary}
                  </MarkdownText>
                ) : (
                  "Assessment artifact"
                )
              }
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

    if (activeTabId === "worksheet") {
      return (
        <WorksheetPanel
          worksheets={worksheetArtifacts}
          selectedWorksheetId={selectedWorksheetArtifact?.id ?? null}
          responsesByArtifactId={worksheetState.responsesByArtifactId}
          onSelectWorksheet={handleSelectWorksheetArtifact}
          onUpdateResponse={handleUpdateWorksheetResponse}
        />
      );
    }

    if (activeTabId === "file") {
      return (
        <UploadedFilePanel
          files={uploadedFileArtifacts}
          selectedFileId={selectedUploadedFileArtifact?.id ?? null}
          onSelectFile={handleSelectUploadedFile}
        />
      );
    }

    return null;
  };

  if (!hasHydratedSession || (redirectSessionId && redirectSessionId !== sessionId)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
          {redirectSessionId ? "Opening session..." : "Loading session..."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex items-end gap-3 border-b border-slate-200 bg-slate-100 px-3 pt-2">
          <div className="flex min-w-0 flex-1 items-end gap-1.5 overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = activeTabId === tab.id;
              const isClosable = tab.id !== "canvas";

              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => handleTabDragStart(tab.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleTabDrop(tab.id)}
                  onDragEnd={() => setDraggedTabId(null)}
                  className={cn(
                    "group relative flex min-w-[9rem] max-w-[14rem] items-center rounded-t-[14px] border border-b-0 transition-colors",
                    isActive
                      ? "border-slate-300 bg-white text-slate-900"
                      : "border-slate-300/60 bg-slate-200/85 text-slate-600 hover:bg-slate-200",
                    draggedTabId === tab.id && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleTabSelect(tab.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm font-medium"
                  >
                    {TAB_LOGO_BY_ID[tab.id] ? (
                      <Image
                        src={TAB_LOGO_BY_ID[tab.id] as string}
                        alt=""
                        width={14}
                        height={14}
                        aria-hidden
                        className="h-3.5 w-3.5 shrink-0 object-contain"
                      />
                    ) : (
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-full",
                          tab.kind === "canvas" ? "bg-indigo-500" : "bg-emerald-500",
                        )}
                      />
                    )}
                    <span className="truncate">{tab.label}</span>
                  </button>

                  {isClosable ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                      className={cn(
                        "mr-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700",
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                      aria-label={`Close ${tab.label}`}
                      title={`Close ${tab.label}`}
                    >
                      <TabCloseIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleUploadButtonClick}
              disabled={isUploadingFile}
              className="inline-flex h-9 items-center justify-center self-center px-2 text-xl leading-none text-slate-700 transition-colors hover:text-slate-950 disabled:cursor-wait disabled:opacity-60"
              aria-label="Upload file"
              title="Upload file"
            >
              {isUploadingFile ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              ) : (
                <span className="leading-none">+</span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>

          <div className="flex shrink-0 items-end gap-2 pb-2">
            {uploadError ? (
              <p className="text-right text-[11px] text-red-600">
                {uploadError}
              </p>
            ) : null}

            <div ref={restoreMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsRestoreMenuOpen((open) => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:text-slate-900"
                aria-label="Recently closed tabs"
                title="Recently closed tabs"
              >
                <TabRestoreIcon className="h-4 w-4" />
              </button>

              {isRestoreMenuOpen ? (
                <div className="absolute right-0 top-10 z-30 min-w-[14rem] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/8">
                  {recentlyClosedTabs.length > 0 ? (
                    recentlyClosedTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleRestoreTab(tab.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950"
                      >
                        {TAB_LOGO_BY_ID[tab.id] ? (
                          <Image
                            src={TAB_LOGO_BY_ID[tab.id] as string}
                            alt=""
                            width={14}
                            height={14}
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 object-contain"
                          />
                        ) : (
                          <span
                            className={cn(
                              "inline-block h-2 w-2 shrink-0 rounded-full",
                              tab.kind === "canvas" ? "bg-indigo-500" : "bg-emerald-500",
                            )}
                          />
                        )}
                        <span className="truncate">{tab.label}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-500">
                      No recently closed tabs
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-50">
          <div
            className={cn(
              "absolute inset-0",
              activeTabId === "canvas" ? "block" : "hidden",
            )}
          >
            {shouldMountCanvas ? (
              <Canvas
                isActive={activeTabId === "canvas"}
                persistenceKey={`${CANVAS_PERSISTENCE_PREFIX}-${activeSession?.id ?? sessionId}`}
              />
            ) : (
              <CanvasLoadingState label="Preparing workspace..." />
            )}
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
              {hasTranscriptContent && !isTranscriptHidden ? (
                <SessionTranscriptPanel
                  entries={transcriptEntries}
                  preview={transcriptPreview}
                />
              ) : null}
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
                worksheetContext={worksheetContext}
                uploadedFileContext={uploadedFileContext}
                setContentView={setContentView}
                onSetGoogleDoc={handleSetGoogleDoc}
                onSetGoogleSheet={handleSetGoogleSheet}
                onSetQuiz={handleSetQuiz}
                onSetWorksheet={handleSetWorksheet}
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
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              {hasTranscriptContent ? (
                <button
                  type="button"
                  onClick={() => setIsTranscriptHidden((current) => !current)}
                  aria-label={isTranscriptHidden ? "Show transcript" : "Hide transcript"}
                  title={isTranscriptHidden ? "Show transcript" : "Hide transcript"}
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors",
                    isTranscriptHidden
                      ? "border-slate-200 bg-white/95 text-slate-600 hover:bg-white hover:text-slate-900"
                      : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
                  )}
                >
                  <TranscriptToggleIcon className="h-4 w-4" />
                </button>
              ) : null}

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
