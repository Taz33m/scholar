import type { StudentConceptProgress } from "@/types/course-brain";
import type { SessionArtifact } from "@/types/session";
import type { StudentMemorySettings } from "@/types/student-memory";
import type {
  SessionStudyContext,
  StudentExamKind,
  StudentOnboardingStatus,
  StudentSessionEntryPoint,
} from "@/types/study-context";

export interface StudentCourseExam {
  id: string;
  slug: string;
  title: string;
  examKind: StudentExamKind;
  scheduledFor: string | null;
  scopeSummary: string;
  focusTopics: string[];
}

export interface StudentCourseOnboardingState {
  examId: string;
  status: StudentOnboardingStatus;
  confidenceLevel: number | null;
  selectedFocusTopics: string[];
  goalText: string;
  completedAt: string | null;
}

export interface StudentCourse {
  id: string;
  slug: string;
  title: string;
  colorToken: string | null;
  lastActivityAt: string | null;
  sessionCount: number;
  termLabel?: string | null;
  courseCode?: string | null;
  description?: string | null;
  meetingPattern?: string | null;
  timeZone?: string | null;
  activeExam: StudentCourseExam | null;
  onboarding: StudentCourseOnboardingState | null;
  onboardingStatus: StudentOnboardingStatus;
}

export interface StudentSession {
  externalSessionId: string;
  title: string;
  summary: string;
  status: "active" | "ended";
  courseId: string | null;
  courseTitle: string | null;
  examId: string | null;
  examTitle: string | null;
  entryPoint: StudentSessionEntryPoint;
  focusTopic: string | null;
  sessionGoal: string;
  artifactCount: number;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
  studyContext: SessionStudyContext | null;
  initialArtifacts?: SessionArtifact[];
  conceptProgressSnapshot?: StudentConceptProgress[];
}

export interface StudentCalendarDay {
  day: string;
  sessionCount: number;
}

export interface StudentUser {
  id: string;
  email: string;
  display_name: string | null;
  memorySettings: StudentMemorySettings;
}

export interface StudentSessionListResponse {
  nextCursor: string | null;
  sessions: StudentSession[];
}

export interface StudentCourseDetailResponse {
  course: StudentCourse;
}

export type StudentGraphTier = "emerging" | "developing" | "confident";

export interface StudentGraphNode {
  id: string;
  conceptName: string;
  masteryScore: number;
  masteryTier: StudentGraphTier;
  evidenceCount: number;
  lastStudiedAt: string | null;
  evidenceSummary: string | null;
  x: number;
  y: number;
}

export interface StudentGraphEdge {
  id: string;
  source: string;
  target: string;
  strength: number;
}

export interface StudentGraphRecommendation {
  conceptId: string;
  conceptName: string;
  masteryTier: StudentGraphTier;
  reason: string;
}

export interface StudentGraphStats {
  conceptCount: number;
  focusCount: number;
  masteryAverage: number;
  recentlyStudiedCount: number;
}

export interface StudentGraphResponse {
  course: StudentCourse | null;
  nodes: StudentGraphNode[];
  edges: StudentGraphEdge[];
  stats: StudentGraphStats;
  recommendations: StudentGraphRecommendation[];
  lastUpdatedAt: string | null;
}
