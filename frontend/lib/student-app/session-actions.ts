import {
  getLocalSessionRepository,
  createTutorSession,
  ensureSessionSummaries,
} from "@/lib/session-repository";
import {
  createEventId,
  createSessionId,
  queuePendingTutorSessionSeed,
} from "@/lib/session-storage";
import type { StudentSession } from "@/lib/student-app/types";
import type { SessionStudyContext } from "@/types/study-context";
import type { SessionArtifact, TutorSession } from "@/types/session";

function seedSessionFromHistory(summary: StudentSession, existingSessions: TutorSession[]) {
  const seeded = createTutorSession(
    existingSessions,
    summary.title,
    summary.studyContext,
    summary.initialArtifacts ?? [],
  );
  const startedAt = new Date(summary.startedAt);
  const lastActivityAt = new Date(summary.lastActivityAt);
  const endedAt = summary.endedAt ? new Date(summary.endedAt) : null;
  const events: TutorSession["events"] = [
    {
      id: createEventId(),
      text: "Session imported from student history.",
      timestamp: startedAt,
      type: "session_started",
    },
  ];

  if (summary.summary.trim()) {
    events.push({
      id: createEventId(),
      text: summary.summary,
      timestamp: lastActivityAt,
      type: "note",
    });
  }

  if (summary.status === "ended") {
    events.push({
      id: createEventId(),
      text: "Session ended.",
      timestamp: endedAt ?? lastActivityAt,
      type: "session_ended",
    });
  }

  return {
    ...seeded,
    createdAt: startedAt,
    endedAt,
    events,
    id: summary.externalSessionId,
    status: summary.status,
    summary: summary.summary || seeded.summary,
    title: summary.title,
    updatedAt: lastActivityAt,
  };
}

export function startStudentTutorSession(
  input?:
    | string
    | {
        artifacts?: SessionArtifact[];
        sessionId: string;
        studyContext?: SessionStudyContext | null;
        title?: string | null;
      },
) {
  if (typeof input === "string" || typeof input === "undefined") {
    const sessionId = createSessionId();
    queuePendingTutorSessionSeed({
      id: sessionId,
      title: input ? `${input} Session` : undefined,
    });
    return sessionId;
  }

  queuePendingTutorSessionSeed({
    artifacts: input.artifacts,
    id: input.sessionId,
    studyContext: input.studyContext ?? null,
    title: input.title ?? undefined,
  });
  return input.sessionId;
}

export function openStudentHistorySession(summary: StudentSession) {
  const repository = getLocalSessionRepository();
  const existingSession = repository.getById(summary.externalSessionId);

  if (existingSession) {
    return existingSession.id;
  }

  const allExisting = ensureSessionSummaries(repository.list());
  const seeded = seedSessionFromHistory(summary, allExisting);
  repository.upsert(seeded);
  return seeded.id;
}
