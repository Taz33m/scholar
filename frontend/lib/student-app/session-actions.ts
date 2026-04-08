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
import type { TutorSession } from "@/types/session";

function seedSessionFromHistory(summary: StudentSession, existingSessions: TutorSession[]) {
  const seeded = createTutorSession(existingSessions, summary.title);
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

export function startStudentTutorSession(courseTitle?: string) {
  const sessionId = createSessionId();
  queuePendingTutorSessionSeed({
    id: sessionId,
    title: courseTitle ? `${courseTitle} Session` : undefined,
  });
  return sessionId;
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
