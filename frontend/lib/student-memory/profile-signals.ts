import {
  PROFILE_SIGNAL_WINDOW_DAYS,
  PROFILE_STALE_AFTER_DAYS,
} from "@/lib/student-memory/config";
import type {
  MemoryConfidence,
  MemoryTrustClass,
  ProfileSignalCandidate,
  StudentProfileMemoryStatus,
} from "@/types/student-memory";

export type InternalProfileSignalStatus =
  | "candidate"
  | StudentProfileMemoryStatus;

export interface StudentProfileSignalLedgerRecord {
  id?: string;
  studentId: string;
  profileKey: string;
  family: string;
  summary: string;
  trustClass: MemoryTrustClass;
  confidence: MemoryConfidence;
  status: InternalProfileSignalStatus;
  evidenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastConfirmedAt: string | null;
  sourceSessionIds: string[];
}

export interface MaterialTouchSignal {
  materialId: string;
  title: string;
  kind: string;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const differenceInDays = (left: string, right: string) =>
  Math.floor(
    Math.abs(new Date(left).getTime() - new Date(right).getTime()) / DAY_IN_MS,
  );

const uniqueStrings = (values: string[]) =>
  values.filter((value, index) => values.indexOf(value) === index);

const hasCaseMaterial = (materialsTouched: MaterialTouchSignal[]) =>
  materialsTouched.some((material) => material.kind === "case");

const mentionsTimePressure = (text: string) =>
  /\b(?:time pressure|timed|speed|faster|under time|quickly)\b/i.test(text);

export const buildProfileSignalCandidates = ({
  createdAt,
  materialsTouched,
  sessionGoal,
  sourceSessionId,
  unstableZones,
}: {
  createdAt: string;
  materialsTouched: MaterialTouchSignal[];
  sessionGoal: string;
  sourceSessionId: string;
  unstableZones: string[];
}): ProfileSignalCandidate[] => {
  const candidates: ProfileSignalCandidate[] = [];

  if (hasCaseMaterial(materialsTouched)) {
    candidates.push({
      profileKey: "prefers_case_based_drills",
      family: "drill_preference",
      summary:
        "Case-based drills and close reading of course cases are a productive tutoring mode for this student.",
      trustClass: "behavioral_inference",
      confidence: "medium",
      sourceSessionId,
      createdAt,
    });
  }

  if (unstableZones.length > 0 && mentionsTimePressure(sessionGoal)) {
    candidates.push({
      profileKey: "benefits_from_narrower_tasks_under_time_pressure",
      family: "pacing_support",
      summary:
        "Benefits from narrower one-objective-at-a-time drills when speed or time pressure is part of the study goal.",
      trustClass: "behavioral_inference",
      confidence: "medium",
      sourceSessionId,
      createdAt,
    });
  }

  return candidates;
};

const isActiveStatus = (status: InternalProfileSignalStatus) =>
  status === "candidate" || status === "confirmed" || status === "stale";

export interface ProfileSignalUpdateResult {
  nextLedger: StudentProfileSignalLedgerRecord[];
  promotedSignals: StudentProfileSignalLedgerRecord[];
}

export const applyProfileSignalCandidates = ({
  now,
  candidates,
  existingLedger,
  studentId,
}: {
  now: string;
  candidates: ProfileSignalCandidate[];
  existingLedger: StudentProfileSignalLedgerRecord[];
  studentId: string;
}): ProfileSignalUpdateResult => {
  let nextLedger = [...existingLedger];
  const promotedSignals: StudentProfileSignalLedgerRecord[] = [];

  for (const candidate of candidates) {
    const sameFamilyActive = nextLedger.filter(
      (entry) =>
        entry.family === candidate.family &&
        isActiveStatus(entry.status) &&
        differenceInDays(entry.lastSeenAt, candidate.createdAt) <=
          PROFILE_SIGNAL_WINDOW_DAYS,
    );
    const matching = sameFamilyActive.find(
      (entry) => entry.profileKey === candidate.profileKey,
    );

    if (matching) {
      const evidenceCount = matching.evidenceCount + 1;
      const nextStatus: InternalProfileSignalStatus =
        matching.status === "confirmed" || matching.status === "stale"
          ? "confirmed"
          : evidenceCount >= 2
            ? "confirmed"
            : "candidate";

      const updated: StudentProfileSignalLedgerRecord = {
        ...matching,
        summary: candidate.summary,
        confidence: candidate.confidence,
        evidenceCount,
        lastSeenAt: now,
        lastConfirmedAt: nextStatus === "confirmed" ? now : matching.lastConfirmedAt,
        sourceSessionIds: uniqueStrings([
          ...matching.sourceSessionIds,
          candidate.sourceSessionId,
        ]),
        status: nextStatus,
      };

      nextLedger = nextLedger.map((entry) =>
        entry === matching ? updated : entry,
      );

      if (nextStatus === "confirmed") {
        promotedSignals.push(updated);
      }

      continue;
    }

    const conflicting = sameFamilyActive.filter(
      (entry) => entry.profileKey !== candidate.profileKey,
    );

    if (conflicting.length > 0) {
      nextLedger = nextLedger.map((entry) =>
        conflicting.includes(entry)
          ? {
              ...entry,
              status: entry.status === "candidate" ? "contradicted" : "superseded",
            }
          : entry,
      );
    }

    const created: StudentProfileSignalLedgerRecord = {
      studentId,
      profileKey: candidate.profileKey,
      family: candidate.family,
      summary: candidate.summary,
      trustClass: candidate.trustClass,
      confidence: candidate.confidence,
      status: "candidate",
      evidenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      lastConfirmedAt: null,
      sourceSessionIds: [candidate.sourceSessionId],
    };

    nextLedger = [...nextLedger, created];
  }

  return {
    nextLedger: applyProfileSignalDecay(nextLedger, now),
    promotedSignals,
  };
};

export const applyProfileSignalDecay = (
  ledger: StudentProfileSignalLedgerRecord[],
  now: string,
) =>
  ledger.map((entry) => {
    if (
      entry.status === "confirmed" &&
      entry.lastConfirmedAt &&
      differenceInDays(entry.lastConfirmedAt, now) > PROFILE_STALE_AFTER_DAYS
    ) {
      return {
        ...entry,
        status: "stale" as const,
      };
    }

    return entry;
  });
