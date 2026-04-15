import {
  compareBloomLevels,
  type BloomLevel,
  type CourseBrain,
  type SessionChecklistItem,
  type SessionChecklistStatus,
  type StudentConceptProgress,
} from "@/types/course-brain";
import type { SessionChecklistArtifact } from "@/types/session";
import {
  buildEmptyConceptProgress,
  clampConfidenceSignal,
} from "@/lib/course-brain/index";

export type SessionProgressTrigger =
  | "quiz_submission"
  | "worksheet_checkpoint"
  | "session_exit";

export interface SessionProgressEvaluationInput {
  courseBrain: CourseBrain;
  checklistArtifact: SessionChecklistArtifact;
  existingProgressSnapshot: StudentConceptProgress[];
  trigger: SessionProgressTrigger;
  quiz:
    | {
        isSubmitted: boolean;
        score: number | null;
        totalQuestions: number;
      }
    | null;
  worksheet:
    | {
        answeredCount: number;
        totalQuestions: number;
      }
    | null;
  transcriptText: string;
  sessionSummary: string;
  evaluatedAt: string;
}

export interface SessionLearningEvidenceRecord {
  conceptId: string | null;
  sourceType: "transcript" | "quiz" | "worksheet" | "session_summary";
  excerpt: string;
  score: number | null;
}

export interface SessionProgressEvaluationResult {
  checklistArtifact: SessionChecklistArtifact;
  conceptProgressSnapshot: StudentConceptProgress[];
  nextRecommendedConceptIds: string[];
  misconceptionsFound: string[];
  learningEvidence: SessionLearningEvidenceRecord[];
}

function getNextIncompleteIndex(items: SessionChecklistItem[]) {
  return items.findIndex(
    (item) => item.status === "not_started" || item.status === "in_progress",
  );
}

function normalizeChecklistStatus(
  current: SessionChecklistStatus,
  next: SessionChecklistStatus,
) {
  const order: SessionChecklistStatus[] = [
    "not_started",
    "in_progress",
    "completed",
  ];

  if (current === "needs_review" || next === "needs_review") {
    return next;
  }

  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

function updateChecklistForQuiz(
  items: SessionChecklistItem[],
  quiz:
    | {
        isSubmitted: boolean;
        score: number | null;
        totalQuestions: number;
      }
    | null,
): SessionChecklistItem[] {
  if (!quiz?.isSubmitted || !quiz.totalQuestions) {
    return items;
  }

  const ratio =
    typeof quiz.score === "number" && quiz.totalQuestions > 0
      ? quiz.score / quiz.totalQuestions
      : 0;
  const currentIndex = getNextIncompleteIndex(items);

  if (currentIndex === -1) {
    return items;
  }

  return items.map((item, index) => {
    if (index !== currentIndex) {
      if (index === currentIndex + 1 && item.status === "not_started" && ratio >= 0.7) {
        return {
          ...item,
          status: "in_progress",
          evidenceNote: "Moved into focus after a strong quiz check-in.",
        };
      }
      return item;
    }

    if (ratio >= 0.8) {
      return {
        ...item,
        status: "completed",
        evidenceNote: `Quiz check-in was strong (${quiz.score ?? 0}/${quiz.totalQuestions}).`,
      };
    }

    if (ratio >= 0.55) {
      return {
        ...item,
        status: normalizeChecklistStatus(item.status, "in_progress"),
        evidenceNote: `Quiz check-in showed partial understanding (${quiz.score ?? 0}/${quiz.totalQuestions}).`,
      };
    }

    return {
      ...item,
      status: "needs_review",
      evidenceNote: `Quiz check-in exposed gaps (${quiz.score ?? 0}/${quiz.totalQuestions}).`,
    };
  });
}

function updateChecklistForWorksheet(
  items: SessionChecklistItem[],
  worksheet:
    | {
        answeredCount: number;
        totalQuestions: number;
      }
    | null,
): SessionChecklistItem[] {
  if (!worksheet || worksheet.answeredCount <= 0) {
    return items;
  }

  const currentIndex = getNextIncompleteIndex(items);
  if (currentIndex === -1) {
    return items;
  }

  return items.map((item, index) =>
    index === currentIndex && item.status === "not_started"
      ? {
          ...item,
          status: "in_progress",
          evidenceNote: `Worked examples started (${worksheet.answeredCount}/${worksheet.totalQuestions} worksheet responses).`,
        }
      : item,
  );
}

function updateChecklistForSessionExit(
  items: SessionChecklistItem[],
  transcriptText: string,
): SessionChecklistItem[] {
  const hasMeaningfulTranscript = transcriptText.trim().length >= 120;

  return items.map((item, index) => {
    if (item.status !== "in_progress") {
      return item;
    }

    return {
      ...item,
      status: hasMeaningfulTranscript && index === 0 ? "completed" : "needs_review",
      evidenceNote: hasMeaningfulTranscript
        ? "The session covered this objective with enough discussion to count as demonstrated."
        : "The session ended before this objective was clearly demonstrated.",
    };
  });
}

function deriveConceptProgressStatus(
  status: SessionChecklistStatus,
  bloomLevel: BloomLevel,
): StudentConceptProgress["status"] {
  if (status === "needs_review") return "needs_review";
  if (status === "completed") {
    if (bloomLevel === "analyze") return "confident";
    if (bloomLevel === "apply") return "developing";
    return "emerging";
  }
  if (status === "in_progress") {
    return bloomLevel === "analyze" ? "developing" : "emerging";
  }
  return "not_assessed";
}

function deriveConfidenceSignal(
  status: SessionChecklistStatus,
  bloomLevel: BloomLevel,
  quizScoreRatio: number | null,
) {
  if (status === "needs_review") {
    return 0.25;
  }

  if (status === "completed") {
    const base =
      bloomLevel === "analyze"
        ? 0.85
        : bloomLevel === "apply"
          ? 0.72
          : 0.58;
    return clampConfidenceSignal(
      quizScoreRatio === null ? base : Math.max(base, quizScoreRatio),
    );
  }

  if (status === "in_progress") {
    return clampConfidenceSignal(
      quizScoreRatio === null ? 0.42 : Math.max(0.42, quizScoreRatio * 0.7),
    );
  }

  return 0;
}

function getChecklistMisconceptions(
  courseBrain: CourseBrain,
  item: SessionChecklistItem,
  status: SessionChecklistStatus,
) {
  if (status !== "needs_review") {
    return "";
  }

  return (
    courseBrain.misconceptions.find(
      (misconception) => misconception.conceptId === item.conceptId,
    )?.correction ?? ""
  );
}

function mergeConceptProgress(
  courseBrain: CourseBrain,
  existingProgressSnapshot: StudentConceptProgress[],
  items: SessionChecklistItem[],
  quizScoreRatio: number | null,
  evaluatedAt: string,
  sessionSummary: string,
) {
  const progressMap = new Map(
    existingProgressSnapshot.map((entry) => [entry.conceptId, entry]),
  );

  return items.map((item) => {
    const concept =
      courseBrain.concepts.find((entry) => entry.id === item.conceptId) ?? null;
    const current =
      progressMap.get(item.conceptId) ??
      (concept ? buildEmptyConceptProgress(concept) : null);

    if (!concept || !current) {
      return null;
    }

    const nextStatus = deriveConceptProgressStatus(item.status, item.bloomLevel);
    const nextBloom =
      item.status === "completed" || item.status === "in_progress"
        ? compareBloomLevels(
            current.highestDemonstratedBloomLevel,
            item.bloomLevel,
          ) >= 0
          ? current.highestDemonstratedBloomLevel
          : item.bloomLevel
        : current.highestDemonstratedBloomLevel;

    const evidenceCount =
      item.status === "completed" || item.status === "in_progress"
        ? current.evidenceCount + 1
        : current.evidenceCount;

    return {
      conceptId: item.conceptId,
      conceptName: concept.label,
      highestDemonstratedBloomLevel: nextBloom,
      status: nextStatus,
      confidenceSignal: deriveConfidenceSignal(
        item.status,
        item.bloomLevel,
        quizScoreRatio,
      ),
      misconceptionSummary: getChecklistMisconceptions(
        courseBrain,
        item,
        item.status,
      ),
      evidenceCount,
      lastDemonstratedAt:
        item.status === "completed" || item.status === "in_progress"
          ? evaluatedAt
          : current.lastDemonstratedAt,
      evidenceSummary: item.evidenceNote || sessionSummary,
    } satisfies StudentConceptProgress;
  }).filter(Boolean) as StudentConceptProgress[];
}

function buildLearningEvidence(
  input: SessionProgressEvaluationInput,
  checklistItems: SessionChecklistItem[],
): SessionLearningEvidenceRecord[] {
  const evidence: SessionLearningEvidenceRecord[] = [];

  if (input.sessionSummary.trim()) {
    evidence.push({
      conceptId: checklistItems[0]?.conceptId ?? null,
      sourceType: "session_summary",
      excerpt: input.sessionSummary.trim().slice(0, 400),
      score: null,
    });
  }

  if (input.transcriptText.trim()) {
    evidence.push({
      conceptId: checklistItems[0]?.conceptId ?? null,
      sourceType: "transcript",
      excerpt: input.transcriptText.trim().slice(0, 600),
      score: null,
    });
  }

  if (input.quiz?.isSubmitted && input.quiz.totalQuestions > 0) {
    evidence.push({
      conceptId: checklistItems[0]?.conceptId ?? null,
      sourceType: "quiz",
      excerpt: `Quiz checkpoint: ${input.quiz.score ?? 0}/${input.quiz.totalQuestions}`,
      score:
        typeof input.quiz.score === "number"
          ? input.quiz.score / input.quiz.totalQuestions
          : null,
    });
  }

  if (input.worksheet && input.worksheet.answeredCount > 0) {
    evidence.push({
      conceptId: checklistItems[0]?.conceptId ?? null,
      sourceType: "worksheet",
      excerpt: `Worksheet checkpoint: ${input.worksheet.answeredCount}/${input.worksheet.totalQuestions} answered.`,
      score:
        input.worksheet.totalQuestions > 0
          ? input.worksheet.answeredCount / input.worksheet.totalQuestions
          : null,
    });
  }

  return evidence;
}

export function evaluateSessionProgress(
  input: SessionProgressEvaluationInput,
): SessionProgressEvaluationResult {
  const quizScoreRatio =
    input.quiz?.isSubmitted &&
    typeof input.quiz.score === "number" &&
    input.quiz.totalQuestions > 0
      ? input.quiz.score / input.quiz.totalQuestions
      : null;

  let nextItems = [...input.checklistArtifact.items];

  if (input.trigger === "quiz_submission") {
    nextItems = updateChecklistForQuiz(nextItems, input.quiz);
  }

  if (input.trigger === "worksheet_checkpoint") {
    nextItems = updateChecklistForWorksheet(nextItems, input.worksheet);
  }

  if (input.trigger === "session_exit") {
    nextItems = updateChecklistForSessionExit(nextItems, input.transcriptText);
  }

  const conceptProgressSnapshot = mergeConceptProgress(
    input.courseBrain,
    input.existingProgressSnapshot,
    nextItems,
    quizScoreRatio,
    input.evaluatedAt,
    input.sessionSummary,
  );

  const nextRecommendedConceptIds = conceptProgressSnapshot
    .filter(
      (entry) =>
        entry.status === "needs_review" ||
        entry.status === "not_assessed" ||
        entry.status === "emerging",
    )
    .sort((left, right) => {
      if (left.status === right.status) {
        return left.confidenceSignal - right.confidenceSignal;
      }
      const order = ["needs_review", "not_assessed", "emerging", "developing", "confident"];
      return order.indexOf(left.status) - order.indexOf(right.status);
    })
    .map((entry) => entry.conceptId)
    .slice(0, 3);

  const misconceptionsFound = conceptProgressSnapshot
    .map((entry) => entry.misconceptionSummary)
    .filter((entry) => entry.trim().length > 0);

  return {
    checklistArtifact: {
      ...input.checklistArtifact,
      items: nextItems,
    },
    conceptProgressSnapshot,
    nextRecommendedConceptIds,
    misconceptionsFound,
    learningEvidence: buildLearningEvidence(input, nextItems),
  };
}
