import { buildSessionSummary } from "./session-storage";
import type {
  SessionArtifact,
  SessionEvent,
  SessionSnapshot,
  TutorSession,
  } from "../types/session";
import type { SessionStudyContext } from "../types/study-context";

const MAX_SESSION_ARTIFACTS = 24;

interface ApplySessionUpdateInput {
  sessions: TutorSession[];
  sessionId: string;
  snapshot: SessionSnapshot;
  appendEvent?: SessionEvent;
  appendArtifact?: SessionArtifact;
  replaceArtifacts?: SessionArtifact[];
  nextStatus?: TutorSession["status"];
  nextEndedAt?: Date | null;
  nextSummary?: string;
  nextStudyContext?: SessionStudyContext | null;
  updatedAt?: Date;
}

export const applySessionUpdate = ({
  sessions,
  sessionId,
  snapshot,
  appendEvent,
  appendArtifact,
  replaceArtifacts,
  nextStatus,
  nextEndedAt,
  nextSummary,
  nextStudyContext,
  updatedAt = new Date(),
}: ApplySessionUpdateInput): TutorSession[] =>
  sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    const updatedSession: TutorSession = {
      ...session,
      status: nextStatus ?? session.status,
      studyContext:
        nextStudyContext !== undefined ? nextStudyContext : session.studyContext,
      endedAt: nextEndedAt !== undefined ? nextEndedAt : session.endedAt,
      summary: nextSummary ?? session.summary,
      updatedAt,
      events: appendEvent ? [...session.events, appendEvent] : session.events,
      artifacts: replaceArtifacts
        ? replaceArtifacts.slice(0, MAX_SESSION_ARTIFACTS)
        : appendArtifact
          ? [appendArtifact, ...session.artifacts].slice(0, MAX_SESSION_ARTIFACTS)
          : session.artifacts,
      snapshot,
    };

    return {
      ...updatedSession,
      summary: buildSessionSummary(updatedSession),
    };
  });
