import type {
  ContentView,
  GoogleDocSection,
  GoogleSheetTab,
  QuizQuestion,
  QuizSnapshotState,
  SessionArtifact,
  SessionEvent,
  TutorSession,
  WorkspaceTabId,
} from "@/types/session";
import type { DeepDiveState } from "@/types/deepdive";
import type { FlashcardSessionState } from "@/types/flashcard";
import type { VisualizationState } from "@/types/visualization";
import { generateDeterministicSummary } from "@/lib/session-summary";

export const SESSION_STORAGE_KEY = "geminilearn.sessions.v1";
const MAX_SESSIONS = 30;

const toSafeDate = (value: unknown) => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
};

const toSafeId = (prefix: "event" | "artifact") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const coerceContentView = (value: unknown): ContentView => {
  if (
    value === "flashcards" ||
    value === "visualization" ||
    value === "deepdive"
  ) {
    return value;
  }
  return "flashcards";
};

const defaultTabForContentView = (contentView: ContentView): WorkspaceTabId => {
  if (contentView === "visualization") return "visualization";
  if (contentView === "deepdive") return "deepdive";
  return "flashcards";
};

const coerceWorkspaceTab = (
  value: unknown,
  fallback: WorkspaceTabId,
): WorkspaceTabId => {
  if (
    value === "canvas" ||
    value === "flashcards" ||
    value === "visualization" ||
    value === "deepdive" ||
    value === "sheets" ||
    value === "docs" ||
    value === "quiz"
  ) {
    return value;
  }
  return fallback;
};

const normalizeFlashcardSession = (value: unknown): FlashcardSessionState => {
  const candidate = (value ?? {}) as Partial<FlashcardSessionState>;
  return {
    cards: Array.isArray(candidate.cards) ? candidate.cards : [],
    currentIndex:
      typeof candidate.currentIndex === "number" ? candidate.currentIndex : 0,
    isFlipped: Boolean(candidate.isFlipped),
    mode:
      candidate.mode === "generating" || candidate.mode === "reviewing"
        ? candidate.mode
        : "idle",
    generatedAt: candidate.generatedAt ? toSafeDate(candidate.generatedAt) : null,
  };
};

const normalizeVisualization = (value: unknown): VisualizationState => {
  const candidate = (value ?? {}) as Partial<VisualizationState>;
  return {
    imageData: typeof candidate.imageData === "string" ? candidate.imageData : null,
    description:
      typeof candidate.description === "string" ? candidate.description : null,
    generatedAt: candidate.generatedAt ? toSafeDate(candidate.generatedAt) : null,
    mode:
      candidate.mode === "generating" || candidate.mode === "ready"
        ? candidate.mode
        : "idle",
  };
};

const normalizeDeepDive = (value: unknown): DeepDiveState => {
  const candidate = (value ?? {}) as Partial<DeepDiveState>;
  return {
    imageData: typeof candidate.imageData === "string" ? candidate.imageData : null,
    overviewText:
      typeof candidate.overviewText === "string" ? candidate.overviewText : null,
    topic: typeof candidate.topic === "string" ? candidate.topic : null,
    generatedAt: candidate.generatedAt ? toSafeDate(candidate.generatedAt) : null,
    mode:
      candidate.mode === "generating" || candidate.mode === "ready"
        ? candidate.mode
        : "idle",
  };
};

const normalizeQuizSnapshot = (value: unknown): QuizSnapshotState => {
  const candidate = (value ?? {}) as Partial<QuizSnapshotState> & {
    selections?: Record<string, unknown>;
  };

  const selections = Object.entries(candidate.selections ?? {}).reduce<
    Record<number, string>
  >((acc, [key, entry]) => {
    const index = Number.parseInt(key, 10);
    if (Number.isInteger(index) && index >= 0 && typeof entry === "string") {
      acc[index] = entry;
    }
    return acc;
  }, {});

  return {
    selections,
    isSubmitted: Boolean(candidate.isSubmitted),
  };
};

const normalizeEvent = (event: unknown): SessionEvent | null => {
  if (!event || typeof event !== "object") return null;
  const candidate = event as Partial<SessionEvent>;

  const validType =
    candidate.type === "session_started" ||
    candidate.type === "session_ended" ||
    candidate.type === "tool_called" ||
    candidate.type === "tool_result" ||
    candidate.type === "artifact_created" ||
    candidate.type === "view_changed" ||
    candidate.type === "note";

  if (!validType || typeof candidate.text !== "string") {
    return null;
  }
  const eventType = candidate.type as SessionEvent["type"];

  return {
    id:
      typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : toSafeId("event"),
    type: eventType,
    timestamp: toSafeDate(candidate.timestamp),
    text: candidate.text,
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : undefined,
  };
};

const normalizeDocSections = (sections: unknown): GoogleDocSection[] => {
  if (!Array.isArray(sections)) return [];

  return sections
    .map((section) => {
      if (!section || typeof section !== "object") return null;
      const candidate = section as Record<string, unknown>;

      const heading =
        typeof candidate.heading === "string" ? candidate.heading : "Section";
      const content =
        typeof candidate.content === "string" ? candidate.content : "";
      const bullets = Array.isArray(candidate.bullets)
        ? candidate.bullets.filter((entry): entry is string => typeof entry === "string")
        : [];

      return { heading, content, bullets };
    })
    .filter(Boolean) as GoogleDocSection[];
};

const normalizeSheetTabs = (tabs: unknown): GoogleSheetTab[] => {
  if (!Array.isArray(tabs)) return [];

  return tabs
    .map((tab, index) => {
      if (!tab || typeof tab !== "object") return null;
      const candidate = tab as Record<string, unknown>;

      const columns = Array.isArray(candidate.columns)
        ? candidate.columns.filter((entry): entry is string => typeof entry === "string")
        : [];

      const safeColumns = columns.length > 1 ? columns : ["Column A", "Column B"];

      const rows = Array.isArray(candidate.rows)
        ? candidate.rows
            .map((row) => {
              if (!Array.isArray(row)) return null;
              const normalized = row
                .slice(0, safeColumns.length)
                .map((cell) => (typeof cell === "string" ? cell : String(cell ?? "")));
              while (normalized.length < safeColumns.length) {
                normalized.push("");
              }
              return normalized;
            })
            .filter(Boolean)
        : [];

      return {
        name:
          typeof candidate.name === "string" && candidate.name.length > 0
            ? candidate.name
            : `Sheet ${index + 1}`,
        columns: safeColumns,
        rows: rows as string[][],
      };
    })
    .filter(Boolean) as GoogleSheetTab[];
};

const normalizeQuizQuestions = (questions: unknown): QuizQuestion[] => {
  if (!Array.isArray(questions)) return [];

  return questions
    .map((question, index) => {
      if (!question || typeof question !== "object") return null;
      const candidate = question as Record<string, unknown>;
      const choices = Array.isArray(candidate.choices)
        ? candidate.choices.filter((entry): entry is string => typeof entry === "string")
        : [];
      const safeChoices = choices.length >= 3 ? choices.slice(0, 5) : ["Option A", "Option B", "Option C"];
      const correctAnswer =
        typeof candidate.correctAnswer === "string" &&
        safeChoices.includes(candidate.correctAnswer)
          ? candidate.correctAnswer
          : safeChoices[0];

      return {
        prompt:
          typeof candidate.prompt === "string" && candidate.prompt.length > 0
            ? candidate.prompt
            : `Question ${index + 1}`,
        choices: safeChoices,
        correctAnswer,
        explanation:
          typeof candidate.explanation === "string" ? candidate.explanation : "",
      };
    })
    .filter(Boolean) as QuizQuestion[];
};

const normalizeArtifact = (artifact: unknown): SessionArtifact | null => {
  if (!artifact || typeof artifact !== "object") return null;
  const candidate = artifact as Partial<SessionArtifact>;
  const artifactRecord = artifact as Record<string, unknown>;

  if (typeof candidate.title !== "string") return null;
  if (
    candidate.type !== "flashcard_deck" &&
    candidate.type !== "visualization_image" &&
    candidate.type !== "deep_dive_bundle" &&
    candidate.type !== "google_doc" &&
    candidate.type !== "google_sheet" &&
    candidate.type !== "quiz"
  ) {
    return null;
  }

  const base = {
    id:
      typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : toSafeId("artifact"),
    type: candidate.type,
    title: candidate.title,
    createdAt: toSafeDate(candidate.createdAt),
    summary: typeof candidate.summary === "string" ? candidate.summary : "",
  };

  if (candidate.type === "flashcard_deck") {
    return {
      ...base,
      type: "flashcard_deck",
      cardCount:
        typeof artifactRecord.cardCount === "number"
          ? artifactRecord.cardCount
          : 0,
    };
  }

  if (candidate.type === "visualization_image") {
    return {
      ...base,
      type: "visualization_image",
      description:
        typeof artifactRecord.description === "string"
          ? artifactRecord.description
          : "",
      imageData:
        typeof artifactRecord.imageData === "string"
          ? artifactRecord.imageData
          : "",
    };
  }

  if (candidate.type === "deep_dive_bundle") {
    return {
      ...base,
      type: "deep_dive_bundle",
      topic: typeof artifactRecord.topic === "string" ? artifactRecord.topic : "",
      overviewText:
        typeof artifactRecord.overviewText === "string"
          ? artifactRecord.overviewText
          : "",
      imageData:
        typeof artifactRecord.imageData === "string"
          ? artifactRecord.imageData
          : "",
    };
  }

  if (candidate.type === "google_doc") {
    return {
      ...base,
      type: "google_doc",
      sections: normalizeDocSections(artifactRecord.sections),
    };
  }

  if (candidate.type === "google_sheet") {
    return {
      ...base,
      type: "google_sheet",
      sheets: normalizeSheetTabs(artifactRecord.sheets),
    };
  }

  return {
    ...base,
    type: "quiz",
    questions: normalizeQuizQuestions(artifactRecord.questions),
  };
};

export const loadTutorSessions = (): TutorSession[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((session) => {
        if (!session || typeof session !== "object") return null;
        const candidate = session as Partial<TutorSession>;

        if (typeof candidate.id !== "string" || typeof candidate.title !== "string") {
          return null;
        }

        const contentView = coerceContentView(candidate.snapshot?.contentView);

        return {
          id: candidate.id,
          title: candidate.title,
          summary: typeof candidate.summary === "string" ? candidate.summary : "",
          status: candidate.status === "ended" ? "ended" : "active",
          createdAt: toSafeDate(candidate.createdAt),
          updatedAt: toSafeDate(candidate.updatedAt),
          endedAt: candidate.endedAt ? toSafeDate(candidate.endedAt) : null,
          events: Array.isArray(candidate.events)
            ? candidate.events.map(normalizeEvent).filter(Boolean) as SessionEvent[]
            : [],
          artifacts: Array.isArray(candidate.artifacts)
            ? candidate.artifacts
                .map(normalizeArtifact)
                .filter(Boolean) as SessionArtifact[]
            : [],
          snapshot: {
            contentView,
            activeTab: coerceWorkspaceTab(
              candidate.snapshot?.activeTab,
              defaultTabForContentView(contentView),
            ),
            flashcardSession: normalizeFlashcardSession(
              candidate.snapshot?.flashcardSession,
            ),
            visualizationState: normalizeVisualization(
              candidate.snapshot?.visualizationState,
            ),
            deepDiveState: normalizeDeepDive(candidate.snapshot?.deepDiveState),
            quizState: normalizeQuizSnapshot(candidate.snapshot?.quizState),
          },
        } satisfies TutorSession;
      })
      .filter(Boolean) as TutorSession[];
  } catch {
    return [];
  }
};

export const saveTutorSessions = (sessions: TutorSession[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(
        sessions
          .slice(0, MAX_SESSIONS)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ),
    );
  } catch {
    // Intentionally ignore storage write errors.
  }
};

export const buildSessionSummary = (session: TutorSession) => {
  return generateDeterministicSummary(session).text;
};

export const createSessionId = () =>
  `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createEventId = () =>
  `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createArtifactId = () =>
  `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
