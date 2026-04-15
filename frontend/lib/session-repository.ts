import type { DeepDiveState } from "@/types/deepdive";
import type { FlashcardSessionState } from "@/types/flashcard";
import type { SessionStudyContext } from "@/types/study-context";
import type { VisualizationState } from "@/types/visualization";
import type {
  ContentView,
  SessionArtifact,
  TutorSession,
  WorkspaceTabId,
} from "@/types/session";
import {
  buildSessionSummary,
  createEventId,
  createSessionId,
  deleteSessionTranscript,
  loadTutorSessions,
  saveTutorSessions,
} from "@/lib/session-storage";
import { removeUploadedFileBlob } from "@/lib/uploaded-file-storage";

const MAX_SESSIONS = 30;

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

const buildSnapshot = (
  contentView: ContentView = "flashcards",
  activeTab: WorkspaceTabId = "canvas",
): TutorSession["snapshot"] => ({
  contentView,
  activeTab,
  flashcardSession: INITIAL_FLASHCARD_STATE,
  visualizationState: INITIAL_VISUALIZATION_STATE,
  deepDiveState: INITIAL_DEEPDIVE_STATE,
  quizState: {
    selections: {},
    isSubmitted: false,
  },
  worksheetState: {
    activeWorksheetArtifactId: null,
    responsesByArtifactId: {},
  },
  fileState: {
    activeFileArtifactId: null,
  },
  transcript: [],
});

const createSessionTitle = (sessions: TutorSession[]) => {
  return `Session ${sessions.length + 1}`;
};

export const createTutorSession = (
  sessions: TutorSession[],
  title?: string,
  studyContext: SessionStudyContext | null = null,
  initialArtifacts: SessionArtifact[] = [],
): TutorSession => {
  const now = new Date();
  return {
    id: createSessionId(),
    title: title?.trim() || createSessionTitle(sessions),
    summary: "Session started; no artifacts generated yet.",
    status: "active",
    studyContext,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    events: [
      {
        id: createEventId(),
        type: "session_started",
        timestamp: now,
        text: "Session started.",
      },
    ],
    artifacts: initialArtifacts,
    snapshot: buildSnapshot(),
  };
};

export const createTutorSessionFromSeed = ({
  createdAt,
  sessionId,
  sessions,
  studyContext,
  title,
  artifacts,
}: {
  createdAt?: Date;
  sessionId: string;
  sessions: TutorSession[];
  studyContext?: SessionStudyContext | null;
  title?: string;
  artifacts?: SessionArtifact[];
}): TutorSession => {
  const session = createTutorSession(
    sessions,
    title,
    studyContext ?? null,
    artifacts ?? [],
  );
  const now = createdAt ?? new Date();

  return {
    ...session,
    createdAt: now,
    events: session.events.map((event, index) =>
      index === 0
        ? {
            ...event,
            timestamp: now,
          }
        : event,
    ),
    id: sessionId,
    updatedAt: now,
  };
};

export interface SessionRepository {
  list(): TutorSession[];
  getById(sessionId: string): TutorSession | null;
  create(title?: string): TutorSession;
  saveAll(sessions: TutorSession[]): void;
  upsert(session: TutorSession): TutorSession[];
  delete(sessionId: string): TutorSession[];
}

class LocalSessionRepository implements SessionRepository {
  list(): TutorSession[] {
    return loadTutorSessions();
  }

  getById(sessionId: string): TutorSession | null {
    return this.list().find((session) => session.id === sessionId) ?? null;
  }

  create(title?: string): TutorSession {
    const existing = this.list();
    const session = createTutorSession(existing, title);
    this.saveAll([session, ...existing]);
    return session;
  }

  saveAll(sessions: TutorSession[]): void {
    saveTutorSessions(sessions.slice(0, MAX_SESSIONS));
  }

  upsert(session: TutorSession): TutorSession[] {
    const existing = this.list();
    const next = existing.some((item) => item.id === session.id)
      ? existing.map((item) => (item.id === session.id ? session : item))
      : [session, ...existing];
    this.saveAll(next);
    return next;
  }

  delete(sessionId: string): TutorSession[] {
    const existing = this.list();
    const removedSession = existing.find((session) => session.id === sessionId) ?? null;
    const next = existing.filter((session) => session.id !== sessionId);
    this.saveAll(next);
    deleteSessionTranscript(sessionId);
    removedSession?.artifacts.forEach((artifact) => {
      if (artifact.type === "uploaded_file") {
        void removeUploadedFileBlob(artifact.storageKey);
      }
    });
    return next;
  }
}

let localRepository: SessionRepository | null = null;

export const getLocalSessionRepository = (): SessionRepository => {
  if (!localRepository) {
    localRepository = new LocalSessionRepository();
  }
  return localRepository;
};

export const ensureSessionSummaries = (sessions: TutorSession[]): TutorSession[] => {
  return sessions.map((session) => ({
    ...session,
    summary: buildSessionSummary(session),
  }));
};
