export type BloomLevel = "remember" | "understand" | "apply" | "analyze";

export type SessionChecklistStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "needs_review";

export type StudentConceptProgressStatus =
  | "not_assessed"
  | "emerging"
  | "developing"
  | "confident"
  | "needs_review";

export type CourseBrainSourceKind =
  | "syllabus"
  | "announcement"
  | "lecture"
  | "case"
  | "practice_questions";

export interface CourseBrainSourceMaterial {
  id: string;
  title: string;
  kind: CourseBrainSourceKind;
  relativePath: string;
  summary: string;
  inScope: boolean;
}

export interface CourseBrainConcept {
  id: string;
  label: string;
  summary: string;
  masteryHint: string;
  focusTags: string[];
  sourceIds: string[];
  caseIds: string[];
  relatedConceptIds: string[];
  suggestedBloomTargets: BloomLevel[];
  x: number;
  y: number;
}

export interface CourseBrainCase {
  id: string;
  title: string;
  summary: string;
  ethicalDilemma: string;
  sourceId: string;
  relatedConceptIds: string[];
}

export interface CourseBrainMisconception {
  id: string;
  conceptId: string;
  misconception: string;
  correction: string;
}

export interface CourseBrainQuestionArchetype {
  id: string;
  label: string;
  format: "multiple_choice" | "short_answer" | "mini_case";
  description: string;
  conceptIds: string[];
  sourceId: string;
}

export interface CourseTutorProfile {
  answerStyle: string[];
  boundaries: string[];
  emphasis: string[];
}

export interface CourseBrain {
  id: string;
  version: string;
  courseSlug: string;
  courseTitle: string;
  examSlug: string;
  examTitle: string;
  scopeSummary: string;
  focusTopics: string[];
  sourceMaterials: CourseBrainSourceMaterial[];
  concepts: CourseBrainConcept[];
  conceptEdges: Array<{
    id: string;
    source: string;
    target: string;
    strength: number;
  }>;
  cases: CourseBrainCase[];
  misconceptions: CourseBrainMisconception[];
  questionArchetypes: CourseBrainQuestionArchetype[];
  tutorProfile: CourseTutorProfile;
}

export interface StudentConceptProgress {
  conceptId: string;
  conceptName: string;
  highestDemonstratedBloomLevel: BloomLevel | null;
  status: StudentConceptProgressStatus;
  confidenceSignal: number;
  misconceptionSummary: string;
  evidenceCount: number;
  lastDemonstratedAt: string | null;
  evidenceSummary: string;
}

export interface SessionChecklistItem {
  id: string;
  conceptId: string;
  label: string;
  bloomLevel: BloomLevel;
  successCriteria: string;
  status: SessionChecklistStatus;
  evidenceNote: string;
}

export type SessionObjectiveProgress = SessionChecklistItem;

export const BLOOM_LEVEL_ORDER: BloomLevel[] = [
  "remember",
  "understand",
  "apply",
  "analyze",
];

export function getBloomLevelLabel(level: BloomLevel) {
  if (level === "remember") return "Remember";
  if (level === "understand") return "Understand";
  if (level === "apply") return "Apply";
  return "Analyze";
}

export function getChecklistStatusLabel(status: SessionChecklistStatus) {
  if (status === "not_started") return "Not started";
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Needs review";
}

export function compareBloomLevels(
  left: BloomLevel | null | undefined,
  right: BloomLevel | null | undefined,
) {
  const leftIndex = left ? BLOOM_LEVEL_ORDER.indexOf(left) : -1;
  const rightIndex = right ? BLOOM_LEVEL_ORDER.indexOf(right) : -1;
  return leftIndex - rightIndex;
}
