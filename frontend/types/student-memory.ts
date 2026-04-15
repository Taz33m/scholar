export type MemoryTrustClass =
  | "authoritative_derived"
  | "behavioral_inference";

export type MemoryConfidence = "high" | "medium" | "low";

export type MemoryProvenance =
  | "authoritative_quiz_result"
  | "authoritative_worksheet_checkpoint"
  | "authoritative_session_exit"
  | "derived_profile_update";

export type StudentProfileMemoryStatus =
  | "confirmed"
  | "stale"
  | "contradicted"
  | "superseded";

export interface StudentMemorySettings {
  memoryOptIn: boolean;
  memoryOptedInAt: string | null;
  memoryConsentVersion: string | null;
}

export interface DerivedMemoryEntryBase {
  label: string;
  summary: string;
  trustClass: MemoryTrustClass;
  confidence: MemoryConfidence;
  provenance: MemoryProvenance;
  timestamp: string | null;
}

export interface RecentStudyEpisodeMemory extends DerivedMemoryEntryBase {
  memoryType: "study_episode";
  externalSessionId: string;
  trigger: "quiz_submission" | "worksheet_checkpoint" | "session_exit";
  focusConceptIds: string[];
  focusConceptLabels: string[];
  materialsTouched: Array<{
    materialId: string;
    title: string;
    kind: string;
  }>;
}

export interface ConfirmedProfileMemory extends DerivedMemoryEntryBase {
  memoryType: "student_profile";
  profileKey: string;
  status: StudentProfileMemoryStatus;
}

export interface DerivedMemoryContext {
  recentStudyEpisodes: RecentStudyEpisodeMemory[];
  confirmedProfileMemory: ConfirmedProfileMemory[];
}

export interface StudyEpisodeMemoryRecord {
  memoryType: "study_episode";
  studentId: string;
  courseId: string;
  examId: string | null;
  externalSessionId: string;
  trigger: "quiz_submission" | "worksheet_checkpoint" | "session_exit";
  focusConceptIds: string[];
  focusConceptLabels: string[];
  materialsTouched: Array<{
    materialId: string;
    title: string;
    kind: string;
  }>;
  topPointLossRisks: string[];
  stableZones: string[];
  unstableZones: string[];
  misconceptionsRemaining: string[];
  recommendedNextDrills: string[];
  summary: string;
  trustClass: "authoritative_derived";
  confidence: MemoryConfidence;
  provenance:
    | "authoritative_quiz_result"
    | "authoritative_worksheet_checkpoint"
    | "authoritative_session_exit";
  createdAt: string;
}

export interface StudentProfileMemoryRecord {
  memoryType: "student_profile";
  studentId: string;
  profileKey: string;
  summary: string;
  trustClass: MemoryTrustClass;
  confidence: MemoryConfidence;
  provenance: MemoryProvenance;
  status: StudentProfileMemoryStatus;
  lastConfirmedAt: string | null;
  sourceSessionIds: string[];
}

export interface ProfileSignalCandidate {
  profileKey: string;
  family: string;
  summary: string;
  trustClass: MemoryTrustClass;
  confidence: MemoryConfidence;
  sourceSessionId: string;
  createdAt: string;
}
