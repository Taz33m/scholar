export interface StudentCourse {
  id: string;
  title: string;
  colorToken: string | null;
  lastActivityAt: string | null;
  sessionCount: number;
  courseCode?: string | null;
  description?: string | null;
  meetingPattern?: string | null;
}

export interface StudentSession {
  externalSessionId: string;
  title: string;
  summary: string;
  status: "active" | "ended";
  courseId: string | null;
  courseTitle: string | null;
  artifactCount: number;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
}

export interface StudentCalendarDay {
  day: string;
  sessionCount: number;
}

export interface StudentUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface StudentSessionListResponse {
  nextCursor: string | null;
  sessions: StudentSession[];
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
