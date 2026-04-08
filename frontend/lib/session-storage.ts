import type {
  ContentView,
  GoogleDocSection,
  GoogleSheetTab,
  QuizQuestion,
  QuizSnapshotState,
  SessionArtifact,
  SessionEvent,
  SessionTranscriptEntry,
  TutorSession,
  WorksheetAnswerKeyEntry,
  WorksheetArtifact,
  WorksheetChoiceOption,
  WorksheetDifficulty,
  WorksheetDocument,
  WorksheetItem,
  WorksheetResponse,
  WorksheetSection,
  WorksheetSnapshotState,
  UploadedFileSnapshotState,
  WorkspaceTabId,
} from "@/types/session";
import type { DeepDiveState } from "@/types/deepdive";
import type { FlashcardSessionState } from "@/types/flashcard";
import type { VisualizationState } from "@/types/visualization";
import { generateDeterministicSummary } from "@/lib/session-summary";

export const SESSION_STORAGE_KEY = "geminilearn.sessions.v1";
const PENDING_SESSION_SEED_STORAGE_KEY = "geminilearn.pending-session-seeds.v1";
const TRANSCRIPT_STORAGE_KEY_PREFIX = "geminilearn.session-transcript.";
const MAX_SESSIONS = 30;

export interface PendingSessionSeed {
  createdAt: string;
  id: string;
  title?: string;
}

const getTranscriptStorageKey = (sessionId: string) =>
  `${TRANSCRIPT_STORAGE_KEY_PREFIX}${sessionId}`;

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
    value === "quiz" ||
    value === "worksheet" ||
    value === "file"
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

const normalizeUploadedFileSnapshot = (
  value: unknown,
): UploadedFileSnapshotState => {
  const candidate = (value ?? {}) as Partial<UploadedFileSnapshotState>;
  return {
    activeUploadedFileArtifactId:
      toNonEmptyString(candidate.activeUploadedFileArtifactId) ?? null,
  };
};

const coerceWorksheetDifficulty = (
  value: unknown,
): WorksheetDifficulty | null => {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  return null;
};

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeWorksheetChoiceOptions = (
  choices: unknown,
): WorksheetChoiceOption[] => {
  if (!Array.isArray(choices)) return [];

  return choices
    .flatMap((choice, index) => {
      if (!choice || typeof choice !== "object") return [];
      const candidate = choice as Record<string, unknown>;
      const text = toNonEmptyString(candidate.text);
      if (!text) return [];

      const label = toNonEmptyString(candidate.label) ?? String.fromCharCode(65 + index);
      const id = toNonEmptyString(candidate.id) ?? `choice-${index + 1}`;

      return [{ id, label, text }];
    })
    .slice(0, 6);
};

const normalizeWorksheetItem = (
  item: unknown,
  sectionIndex: number,
  itemIndex: number,
): WorksheetItem | null => {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Record<string, unknown>;
  const prompt = toNonEmptyString(candidate.prompt);

  if (!prompt) {
    return null;
  }

  const questionId =
    toNonEmptyString(candidate.questionId) ??
    `section-${sectionIndex + 1}-question-${itemIndex + 1}`;

  if (candidate.kind === "multiple_choice") {
    const choices = normalizeWorksheetChoiceOptions(candidate.choices);
    if (choices.length < 3) {
      return null;
    }

    return {
      kind: "multiple_choice",
      questionId,
      prompt,
      choices,
    };
  }

  if (candidate.kind === "multi_select") {
    const choices = normalizeWorksheetChoiceOptions(candidate.choices);
    if (choices.length < 3) {
      return null;
    }

    return {
      kind: "multi_select",
      questionId,
      prompt,
      choices,
    };
  }

  if (candidate.kind === "short_answer") {
    const rawLineCount =
      typeof candidate.lineCount === "number" ? candidate.lineCount : 3;
    return {
      kind: "short_answer",
      questionId,
      prompt,
      placeholder: toNonEmptyString(candidate.placeholder),
      lineCount: Math.max(2, Math.min(8, Math.round(rawLineCount))),
    };
  }

  return null;
};

const normalizeWorksheetSections = (sections: unknown): WorksheetSection[] => {
  if (!Array.isArray(sections)) return [];

  return sections
    .flatMap((section, sectionIndex) => {
      if (!section || typeof section !== "object") return [];
      const candidate = section as Record<string, unknown>;
      const heading =
        toNonEmptyString(candidate.heading) ?? `Section ${sectionIndex + 1}`;
      const items = Array.isArray(candidate.items)
        ? candidate.items
            .map((item, itemIndex) =>
              normalizeWorksheetItem(item, sectionIndex, itemIndex),
            )
            .filter(Boolean)
        : [];

      if (items.length === 0) {
        return [];
      }

      return [
        {
          id:
            toNonEmptyString(candidate.id) ?? `section-${sectionIndex + 1}`,
          heading,
          directions: toNonEmptyString(candidate.directions),
          items: items as WorksheetItem[],
        },
      ];
    })
    .slice(0, 8);
};

const normalizeWorksheetDocument = (value: unknown): WorksheetDocument => {
  const candidate = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

  const learningObjectives = Array.isArray(candidate.learningObjectives)
    ? candidate.learningObjectives
        .filter((entry): entry is string => Boolean(toNonEmptyString(entry)))
        .map((entry) => entry.trim())
        .slice(0, 5)
    : [];

  return {
    subtitle: toNonEmptyString(candidate.subtitle),
    learningObjectives,
    sections: normalizeWorksheetSections(candidate.sections),
  };
};

const normalizeWorksheetAnswerKey = (
  entries: unknown,
  document: WorksheetDocument,
): WorksheetAnswerKeyEntry[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const validQuestionIds = new Set(
    document.sections.flatMap((section) => section.items.map((item) => item.questionId)),
  );

  return entries
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Record<string, unknown>;
      const questionId = toNonEmptyString(candidate.questionId);
      const answerText = toNonEmptyString(candidate.answerText);
      if (!questionId || !answerText || !validQuestionIds.has(questionId)) {
        return [];
      }

      return [
        {
          questionId,
          answerText,
          explanation: toNonEmptyString(candidate.explanation) ?? "",
        },
      ];
    })
    .slice(0, validQuestionIds.size);
};

const normalizeWorksheetResponse = (
  response: unknown,
  kind: WorksheetItem["kind"],
): WorksheetResponse | null => {
  if (!response || typeof response !== "object") {
    return null;
  }

  const candidate = response as Record<string, unknown>;
  const note = toNonEmptyString(candidate.note) ?? "";

  if (kind === "multiple_choice") {
    return {
      kind,
      note,
      selectedOptionId: toNonEmptyString(candidate.selectedOptionId),
    };
  }

  if (kind === "multi_select") {
    return {
      kind,
      note,
      selectedOptionIds: Array.isArray(candidate.selectedOptionIds)
        ? candidate.selectedOptionIds
            .filter((entry): entry is string => Boolean(toNonEmptyString(entry)))
            .map((entry) => entry.trim())
        : [],
    };
  }

  return {
    kind,
    note,
    answerText: toNonEmptyString(candidate.answerText) ?? "",
  };
};

const normalizeWorksheetSnapshot = (
  value: unknown,
  artifacts: SessionArtifact[],
): WorksheetSnapshotState => {
  const candidate = (value ?? {}) as Partial<WorksheetSnapshotState> & {
    responsesByArtifactId?: Record<string, unknown>;
  };

  const worksheetArtifacts = artifacts.filter(
    (artifact): artifact is WorksheetArtifact => artifact.type === "worksheet",
  );
  const itemKinds = new Map<string, Map<string, WorksheetItem["kind"]>>();

  worksheetArtifacts.forEach((artifact) => {
    itemKinds.set(
      artifact.id,
      new Map(
        artifact.document.sections.flatMap((section) =>
          section.items.map((item) => [item.questionId, item.kind] as const),
        ),
      ),
    );
  });

  const responsesByArtifactId = Object.entries(
    candidate.responsesByArtifactId ?? {},
  ).reduce<Record<string, Record<string, WorksheetResponse>>>(
    (artifactAcc, [artifactId, rawResponses]) => {
      const artifactKinds = itemKinds.get(artifactId);
      if (!artifactKinds || !rawResponses || typeof rawResponses !== "object") {
        return artifactAcc;
      }

      const normalizedResponses = Object.entries(
        rawResponses as Record<string, unknown>,
      ).reduce<Record<string, WorksheetResponse>>((responseAcc, [questionId, response]) => {
        const kind = artifactKinds.get(questionId);
        if (!kind) {
          return responseAcc;
        }

        const normalized = normalizeWorksheetResponse(response, kind);
        if (normalized) {
          responseAcc[questionId] = normalized;
        }
        return responseAcc;
      }, {});

      artifactAcc[artifactId] = normalizedResponses;
      return artifactAcc;
    },
    {},
  );

  const activeWorksheetArtifactId =
    typeof candidate.activeWorksheetArtifactId === "string" &&
    worksheetArtifacts.some((artifact) => artifact.id === candidate.activeWorksheetArtifactId)
      ? candidate.activeWorksheetArtifactId
      : worksheetArtifacts[0]?.id ?? null;

  return {
    activeWorksheetArtifactId,
    responsesByArtifactId,
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

const normalizeTranscriptEntry = (
  entry: unknown,
): SessionTranscriptEntry | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Partial<SessionTranscriptEntry>;
  if (
    candidate.role !== "user" &&
    candidate.role !== "assistant" &&
    candidate.role !== "system"
  ) {
    return null;
  }

  if (typeof candidate.text !== "string" || candidate.text.trim().length === 0) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : toSafeId("event"),
    role: candidate.role,
    text: candidate.text.trim(),
    timestamp: toSafeDate(candidate.timestamp),
  };
};

const normalizeTranscriptEntries = (
  entries: unknown,
): SessionTranscriptEntry[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(normalizeTranscriptEntry)
    .filter(Boolean) as SessionTranscriptEntry[];
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
    candidate.type !== "quiz" &&
    candidate.type !== "worksheet" &&
    candidate.type !== "uploaded_file"
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

  if (candidate.type === "worksheet") {
    const document = normalizeWorksheetDocument(artifactRecord.document);

    return {
      ...base,
      type: "worksheet",
      instructions: toNonEmptyString(artifactRecord.instructions) ?? "",
      estimatedTimeMinutes:
        typeof artifactRecord.estimatedTimeMinutes === "number"
          ? Math.max(5, Math.min(90, Math.round(artifactRecord.estimatedTimeMinutes)))
          : null,
      difficulty: coerceWorksheetDifficulty(artifactRecord.difficulty),
      document,
      answerKey: normalizeWorksheetAnswerKey(artifactRecord.answerKey, document),
    };
  }

  if (candidate.type === "uploaded_file") {
    return {
      ...base,
      type: "uploaded_file",
      fileName: toNonEmptyString(artifactRecord.fileName) ?? base.title,
      mimeType:
        toNonEmptyString(artifactRecord.mimeType) ?? "application/octet-stream",
      storageKey: toNonEmptyString(artifactRecord.storageKey) ?? "",
      extractedText: toNonEmptyString(artifactRecord.extractedText),
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
        const artifacts = Array.isArray(candidate.artifacts)
          ? candidate.artifacts
              .map(normalizeArtifact)
              .filter(Boolean) as SessionArtifact[]
          : [];
        const persistedTranscript = loadSessionTranscript(candidate.id);
        const normalizedInlineTranscript = normalizeTranscriptEntries(
          candidate.snapshot?.transcript,
        );
        const snapshot = {
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
          worksheetState: normalizeWorksheetSnapshot(
            candidate.snapshot?.worksheetState,
            artifacts,
          ),
          uploadedFileState: normalizeUploadedFileSnapshot(
            candidate.snapshot?.uploadedFileState,
          ),
          transcript:
            persistedTranscript.length > 0
              ? []
              : normalizedInlineTranscript,
        };

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
          artifacts,
          snapshot,
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
          .map((session) => {
            const { transcript: ignoredTranscript, ...snapshotWithoutTranscript } =
              session.snapshot;
            void ignoredTranscript;

            return {
              ...session,
              snapshot: snapshotWithoutTranscript,
            };
          })
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ),
    );
  } catch {
    // Intentionally ignore storage write errors.
  }
};

export const runLegacyTranscriptMaintenance = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw || !raw.includes("\"transcript\"")) {
      return;
    }

    const sessions = loadTutorSessions();
    sessions.forEach((session) => {
      if (
        session.snapshot.transcript.length > 0 &&
        loadSessionTranscript(session.id).length === 0
      ) {
        saveSessionTranscript(session.id, session.snapshot.transcript);
      }
    });

    saveTutorSessions(sessions);
  } catch {
    // Ignore best-effort maintenance failures.
  }
};

export const loadSessionTranscript = (
  sessionId: string,
): SessionTranscriptEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getTranscriptStorageKey(sessionId));
    if (!raw) {
      return [];
    }

    return normalizeTranscriptEntries(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const saveSessionTranscript = (
  sessionId: string,
  entries: SessionTranscriptEntry[],
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(getTranscriptStorageKey(sessionId));
      return;
    }

    window.localStorage.setItem(
      getTranscriptStorageKey(sessionId),
      JSON.stringify(entries),
    );
  } catch {
    // Intentionally ignore storage write errors.
  }
};

export const deleteSessionTranscript = (sessionId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getTranscriptStorageKey(sessionId));
  } catch {
    // Ignore storage cleanup errors.
  }
};

export const clearStoredSessionTranscripts = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(TRANSCRIPT_STORAGE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore storage cleanup errors.
  }
};

const readPendingSessionSeeds = (): Record<string, PendingSessionSeed> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_SESSION_SEED_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<
      Record<string, PendingSessionSeed>
    >((acc, [sessionId, seed]) => {
      if (!seed || typeof seed !== "object") {
        return acc;
      }

      const candidate = seed as Partial<PendingSessionSeed>;
      if (
        typeof candidate.id !== "string" ||
        candidate.id !== sessionId ||
        typeof candidate.createdAt !== "string"
      ) {
        return acc;
      }

      acc[sessionId] = {
        createdAt: candidate.createdAt,
        id: candidate.id,
        title: typeof candidate.title === "string" ? candidate.title : undefined,
      };

      return acc;
    }, {});
  } catch {
    return {};
  }
};

const writePendingSessionSeeds = (seeds: Record<string, PendingSessionSeed>) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (Object.keys(seeds).length === 0) {
      window.sessionStorage.removeItem(PENDING_SESSION_SEED_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      PENDING_SESSION_SEED_STORAGE_KEY,
      JSON.stringify(seeds),
    );
  } catch {
    // Ignore sessionStorage failures in constrained environments.
  }
};

export const queuePendingTutorSessionSeed = ({
  id,
  title,
}: {
  id: string;
  title?: string;
}) => {
  const seeds = readPendingSessionSeeds();
  seeds[id] = {
    createdAt: new Date().toISOString(),
    id,
    title: title?.trim() || undefined,
  };
  writePendingSessionSeeds(seeds);
};

export const peekPendingTutorSessionSeed = (
  sessionId: string,
): PendingSessionSeed | null => {
  const seeds = readPendingSessionSeeds();
  return seeds[sessionId] ?? null;
};

export const consumePendingTutorSessionSeed = (
  sessionId: string,
): PendingSessionSeed | null => {
  const seeds = readPendingSessionSeeds();
  const match = seeds[sessionId] ?? null;

  if (match) {
    delete seeds[sessionId];
    writePendingSessionSeeds(seeds);
  }

  return match;
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
