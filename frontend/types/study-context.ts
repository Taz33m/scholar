import type { StudentConceptProgress } from "@/types/course-brain";
import type { DerivedMemoryContext } from "@/types/student-memory";

export type StudentExamKind = "midterm" | "final" | "practical" | "other";

export type StudentOnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type StudentSessionEntryPoint =
  | "manual"
  | "course_home"
  | "exam_card"
  | "onboarding";

export interface SessionStudyContext {
  courseId: string;
  courseTitle: string;
  courseCode: string | null;
  examId: string | null;
  examTitle: string | null;
  examKind: StudentExamKind | null;
  examScheduledFor: string | null;
  examFocusTopics: string[];
  selectedFocusTopics: string[];
  sessionGoal: string;
  courseBrainVersionId?: string | null;
  selectedConceptIds?: string[];
  checklistArtifactId?: string | null;
  conceptProgressSnapshot?: StudentConceptProgress[];
  derivedMemoryContext?: DerivedMemoryContext | null;
  entryPoint?: StudentSessionEntryPoint;
  focusTopic?: string | null;
}
