import {
  compareBloomLevels,
  type BloomLevel,
  type CourseBrain,
  type CourseBrainConcept,
  type SessionChecklistItem,
  type SessionChecklistStatus,
  type StudentConceptProgress,
} from "@/types/course-brain";
import type { SessionStudyContext } from "@/types/study-context";
import type { SessionChecklistArtifact } from "@/types/session";
import { BUSINESS_ETHICS_AND_LAW_EXAM_2_BRAIN } from "@/lib/course-brain/business-ethics-and-law-exam-2";

const COURSE_BRAINS: CourseBrain[] = [BUSINESS_ETHICS_AND_LAW_EXAM_2_BRAIN];

const normalize = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const splitFocusTerm = (value: string | null | undefined) =>
  normalize(value)
    .split(/[,/]| and /g)
    .map((entry) => entry.trim())
    .filter(Boolean);

function isBusinessEthicsAndLawStudyContext(
  studyContext: SessionStudyContext | null | undefined,
) {
  return normalize(studyContext?.courseTitle) === "business ethics and law";
}

export function getCourseBrainForStudyContext(
  studyContext: SessionStudyContext | null | undefined,
) {
  if (!studyContext?.courseId) {
    return null;
  }

  if (studyContext.courseBrainVersionId) {
    return (
      COURSE_BRAINS.find((brain) => brain.version === studyContext.courseBrainVersionId) ??
      null
    );
  }

  if (!isBusinessEthicsAndLawStudyContext(studyContext)) {
    return null;
  }

  return BUSINESS_ETHICS_AND_LAW_EXAM_2_BRAIN;
}

export function getCourseBrainForCourse(input: {
  courseSlug?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
}) {
  const courseSlug = normalize(input.courseSlug);
  const courseTitle = normalize(input.courseTitle);
  const examTitle = normalize(input.examTitle);

  if (
    courseSlug === "bel" ||
    courseTitle === "business ethics and law" ||
    examTitle === "exam 2 review"
  ) {
    return BUSINESS_ETHICS_AND_LAW_EXAM_2_BRAIN;
  }

  return null;
}

export function buildEmptyConceptProgress(
  concept: CourseBrainConcept,
): StudentConceptProgress {
  return {
    conceptId: concept.id,
    conceptName: concept.label,
    highestDemonstratedBloomLevel: null,
    status: "not_assessed",
    confidenceSignal: 0,
    misconceptionSummary: "",
    evidenceCount: 0,
    lastDemonstratedAt: null,
    evidenceSummary: "",
  };
}

export function getProgressMap(progressSnapshot: StudentConceptProgress[] | null | undefined) {
  return new Map((progressSnapshot ?? []).map((entry) => [entry.conceptId, entry]));
}

export function clampConfidenceSignal(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function selectCourseBrainConceptIdsForSession({
  courseBrain,
  progressSnapshot,
  studyContext,
}: {
  courseBrain: CourseBrain;
  progressSnapshot: StudentConceptProgress[];
  studyContext: SessionStudyContext;
}) {
  const progressMap = getProgressMap(progressSnapshot);
  const focusTerms = [
    ...splitFocusTerm(studyContext.focusTopic),
    ...studyContext.selectedFocusTopics.flatMap((entry) => splitFocusTerm(entry)),
    ...studyContext.examFocusTopics.flatMap((entry) => splitFocusTerm(entry)),
  ];

  const prioritized = [...courseBrain.concepts].sort((left, right) => {
    const leftProgress = progressMap.get(left.id) ?? buildEmptyConceptProgress(left);
    const rightProgress = progressMap.get(right.id) ?? buildEmptyConceptProgress(right);

    const rank = (status: StudentConceptProgress["status"]) => {
      if (status === "needs_review") return 0;
      if (status === "not_assessed") return 1;
      if (status === "emerging") return 2;
      if (status === "developing") return 3;
      return 4;
    };

    return rank(leftProgress.status) - rank(rightProgress.status);
  });

  const matched = prioritized.filter((concept) => {
    if (focusTerms.length === 0) {
      return false;
    }

    const haystack = [concept.label, ...concept.focusTags].map(normalize);
    return focusTerms.some((term) => haystack.some((entry) => entry.includes(term)));
  });

  const selected = [...matched, ...prioritized]
    .map((concept) => concept.id)
    .filter((value, index, entries) => entries.indexOf(value) === index)
    .slice(0, 4);

  return selected;
}

export function chooseBloomLevelForConcept(
  concept: CourseBrainConcept,
  progress: StudentConceptProgress | undefined,
): BloomLevel {
  if (!progress || progress.status === "not_assessed") {
    return concept.suggestedBloomTargets.includes("understand")
      ? "understand"
      : concept.suggestedBloomTargets[0];
  }

  if (progress.status === "needs_review") {
    return "understand";
  }

  if (progress.status === "emerging") {
    return concept.suggestedBloomTargets.includes("apply") ? "apply" : "understand";
  }

  return "analyze";
}

function buildSuccessCriteria(concept: CourseBrainConcept, bloomLevel: BloomLevel) {
  if (bloomLevel === "remember") {
    return `Recall the core rule, framework, or distinction for ${concept.label} without needing a hint.`;
  }

  if (bloomLevel === "understand") {
    return `Explain ${concept.label} clearly in your own words and distinguish it from nearby concepts.`;
  }

  if (bloomLevel === "apply") {
    return `Apply ${concept.label} to a course-style scenario or case and justify the result.`;
  }

  return `Analyze a course-style case using ${concept.label} and defend the strongest judgment.`;
}

function buildStartingStatus(
  index: number,
  progress: StudentConceptProgress | undefined,
): SessionChecklistStatus {
  if (progress?.status === "needs_review") {
    return "needs_review";
  }

  return index === 0 ? "in_progress" : "not_started";
}

export function buildInitialChecklistItems({
  courseBrain,
  conceptIds,
  progressSnapshot,
}: {
  courseBrain: CourseBrain;
  conceptIds: string[];
  progressSnapshot: StudentConceptProgress[];
}) {
  const progressMap = getProgressMap(progressSnapshot);

  return conceptIds
    .map((conceptId) => courseBrain.concepts.find((concept) => concept.id === conceptId))
    .filter(Boolean)
    .map((concept, index): SessionChecklistItem => {
      const progress = progressMap.get(concept!.id);
      const bloomLevel = chooseBloomLevelForConcept(concept!, progress);

      return {
        id: `${concept!.id}-${bloomLevel}`,
        conceptId: concept!.id,
        label: concept!.label,
        bloomLevel,
        successCriteria: buildSuccessCriteria(concept!, bloomLevel),
        status: buildStartingStatus(index, progress),
        evidenceNote:
          progress?.evidenceSummary?.trim() ||
          (progress?.status === "needs_review"
            ? "This concept already needs another pass."
            : "Not assessed yet in a course-backed session."),
      };
    })
    .slice(0, 4);
}

export function createSessionChecklistArtifact({
  checklistArtifactId,
  courseBrain,
  createdAt,
  items,
}: {
  checklistArtifactId: string;
  courseBrain: CourseBrain;
  createdAt: Date;
  items: SessionChecklistItem[];
}): SessionChecklistArtifact {
  return {
    id: checklistArtifactId,
    type: "session_checklist",
    title: "Checklist",
    createdAt,
    summary: `Session objectives aligned to ${courseBrain.examTitle}.`,
    courseBrainVersionId: courseBrain.version,
    items,
  };
}

export function buildCourseBrainPromptPacket(
  studyContext: SessionStudyContext | null | undefined,
) {
  const courseBrain = getCourseBrainForStudyContext(studyContext);

  if (!courseBrain || !studyContext?.courseId) {
    return null;
  }

  const selectedConceptIds =
    studyContext.selectedConceptIds?.length
      ? studyContext.selectedConceptIds
      : selectCourseBrainConceptIdsForSession({
          courseBrain,
          progressSnapshot: studyContext.conceptProgressSnapshot ?? [],
          studyContext,
        });

  const selectedConcepts = selectedConceptIds
    .map((conceptId) =>
      courseBrain.concepts.find((concept) => concept.id === conceptId) ?? null,
    )
    .filter(Boolean) as CourseBrainConcept[];

  const selectedCases = Array.from(
    new Set(selectedConcepts.flatMap((concept) => concept.caseIds)),
  )
    .map((caseId) => courseBrain.cases.find((entry) => entry.id === caseId) ?? null)
    .filter(Boolean)
    .slice(0, 3);

  const selectedMisconceptions = selectedConcepts
    .flatMap((concept) =>
      courseBrain.misconceptions.filter(
        (misconception) => misconception.conceptId === concept.id,
      ),
    )
    .slice(0, 4);

  const relevantArchetypes = courseBrain.questionArchetypes.filter((archetype) =>
    archetype.conceptIds.some((conceptId) => selectedConceptIds.includes(conceptId)),
  );

  return [
    `Active course brain: ${courseBrain.courseTitle} / ${courseBrain.examTitle} (${courseBrain.version})`,
    `Exam scope: ${courseBrain.scopeSummary}`,
    "Course-only rule: answer from the supplied course brain. If the student asks for facts that are outside these materials, say that the point is outside the active course materials instead of guessing.",
    "Selected concept packets:",
    ...selectedConcepts.map(
      (concept) =>
        `- ${concept.label}: ${concept.summary} Mastery target: ${concept.masteryHint}`,
    ),
    selectedCases.length > 0 ? "Case packets:" : null,
    ...selectedCases.map(
      (entry) => `- ${entry!.title}: ${entry!.summary} Dilemma: ${entry!.ethicalDilemma}`,
    ),
    selectedMisconceptions.length > 0 ? "Common misconceptions:" : null,
    ...selectedMisconceptions.map(
      (entry) => `- ${entry.misconception} Correction: ${entry.correction}`,
    ),
    relevantArchetypes.length > 0 ? "Likely exam patterns:" : null,
    ...relevantArchetypes.map(
      (entry) => `- ${entry.label}: ${entry.description}`,
    ),
    "Tutor profile:",
    ...courseBrain.tutorProfile.answerStyle.map((line) => `- ${line}`),
    ...courseBrain.tutorProfile.boundaries.map((line) => `- ${line}`),
    ...courseBrain.tutorProfile.emphasis.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function mergeProgressSnapshots(
  existing: StudentConceptProgress[],
  updates: StudentConceptProgress[],
) {
  const byId = new Map(existing.map((entry) => [entry.conceptId, entry]));

  updates.forEach((update) => {
    const current = byId.get(update.conceptId);
    if (!current) {
      byId.set(update.conceptId, update);
      return;
    }

    byId.set(update.conceptId, {
      ...current,
      ...update,
      confidenceSignal: clampConfidenceSignal(update.confidenceSignal),
      highestDemonstratedBloomLevel:
        compareBloomLevels(
          current.highestDemonstratedBloomLevel,
          update.highestDemonstratedBloomLevel,
        ) >= 0
          ? current.highestDemonstratedBloomLevel
          : update.highestDemonstratedBloomLevel,
      evidenceCount: Math.max(current.evidenceCount, update.evidenceCount),
      evidenceSummary: update.evidenceSummary || current.evidenceSummary,
      misconceptionSummary:
        update.misconceptionSummary || current.misconceptionSummary,
      lastDemonstratedAt: update.lastDemonstratedAt ?? current.lastDemonstratedAt,
    });
  });

  return Array.from(byId.values());
}
