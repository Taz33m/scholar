import type { FunctionDeclaration } from "@google/genai";

import type { SessionChecklistItem } from "@/types/course-brain";
import type { DerivedMemoryContext } from "@/types/student-memory";
import type {
  FileArtifact,
  FileSessionContext,
  FileSnapshotState,
} from "@/types/session";
import type { SessionStudyContext } from "@/types/study-context";

export type PromptPacketPriority = "high" | "medium" | "low";

export interface PromptCourseBrain {
  courseId: string;
  courseTitle: string;
  courseVersionId: string;
  examScope: {
    label: string;
    description: string;
    includedSourceIds?: string[];
    excludedSourceIds?: string[];
  };
  conceptPackets: Array<{
    packetId: string;
    title: string;
    summary: string;
    keyConcepts?: string[];
    sourceIds?: string[];
    priority?: PromptPacketPriority;
  }>;
  casePackets: Array<{
    caseId: string;
    title: string;
    summary: string;
    centralDilemma?: string;
    stakeholders?: string[];
    likelyFrameworks?: string[];
    likelyLegalHooks?: string[];
    sourceIds?: string[];
    priority?: PromptPacketPriority;
  }>;
  misconceptions: Array<{
    misconceptionId: string;
    label: string;
    correction: string;
    relatedPacketIds?: string[];
  }>;
  likelyExamPatterns: Array<{
    patternId: string;
    description: string;
    questionTypes?: string[];
    targetSkills?: string[];
  }>;
  openableCourseMaterials: Array<{
    materialId: string;
    courseBrainVersionId: string;
    title: string;
    kind:
      | "case_pdf"
      | "practice_questions_pdf"
      | "syllabus_pdf"
      | "lecture_slide_pptx"
      | "other";
    mimeType: string;
    assetUrl?: string;
    openableInSession: boolean;
    sourceId?: string;
    notes?: string;
  }>;
}

export interface PromptStudentState {
  studentId: string;
  activeCourseId: string;
  selectedFile: {
    selectedFileId: string | null;
    selectedFileType: "uploaded_file" | "course_material_file" | null;
    selectedFileTitle?: string | null;
    selectedFileProvenance?: "uploaded" | "course_material" | null;
    materialId?: string | null;
    activeFileContextAvailable: boolean;
  };
  weakZones: Array<{
    zoneId: string;
    label: string;
    status: "unstable" | "improving" | "stable" | "unknown";
    evidenceSource?:
      | "quiz_submission"
      | "worksheet_checkpoint"
      | "session_exit"
      | "live_observation"
      | "unknown";
    notes?: string;
  }>;
  progressSnapshot: {
    isAuthoritative: boolean;
    lastAuthoritativeUpdateAt?: string | null;
    source?: "quiz_submission" | "worksheet_checkpoint" | "session_exit" | null;
    topPointLossRisks?: string[];
    stableZones?: string[];
    unstableZones?: string[];
  };
  activeChecklist?: Array<{
    itemId: string;
    label: string;
    status: "not_started" | "in_progress" | "done" | "unknown";
  }>;
}

export interface PromptToolSurfaceEntry {
  name: string;
  description: string;
  requiredParameters: string[];
  optionalParameters: string[];
}

export interface PromptValidationSummary {
  courseBrain: {
    valid: boolean;
    errors: string[];
  };
  studentState: {
    valid: boolean;
    errors: string[];
  };
}

export type TutorRouteKind = "live_voice" | "text_tutor";

export interface PromptAssemblyReport {
  bundleVersion: string;
  bundleHash: string;
  routeKind: TutorRouteKind;
  includedSections: string[];
  droppedSections: string[];
  estimatedSize: number;
  usedMinimalSafePrompt: boolean;
  validation: PromptValidationSummary;
}

export interface PromptAssemblyInput {
  routeKind: TutorRouteKind;
  toolDeclarations: FunctionDeclaration[];
  promptCourseBrain: PromptCourseBrain | null;
  promptStudentState: PromptStudentState | null;
  derivedMemoryContext?: DerivedMemoryContext | null;
  fileContext: FileSessionContext | null;
  currentTurnText?: string | null;
}

export interface PromptAssemblyResult {
  text: string;
  report: PromptAssemblyReport;
}

export interface SelectedFileRef {
  selectedFileId: string;
  selectedFileType: "uploaded_file" | "course_material_file";
  title: string;
  selectedFileProvenance: "uploaded" | "course_material";
  materialId: string | null;
}

export interface CanonicalSelectedFileSessionState {
  fileArtifacts: FileArtifact[];
  fileState: FileSnapshotState;
}

export interface SessionStatePromptInput {
  studentId?: string | null;
  studyContext: SessionStudyContext | null | undefined;
  fileContext: FileSessionContext | null | undefined;
  activeChecklistItems?: SessionChecklistItem[] | null | undefined;
  progressMeta?: {
    isAuthoritative?: boolean;
    source?: "quiz_submission" | "worksheet_checkpoint" | "session_exit" | null;
    lastAuthoritativeUpdateAt?: string | null;
  };
}
