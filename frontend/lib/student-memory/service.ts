import type { SupabaseClient } from "@supabase/supabase-js";

import type { CourseBrain } from "@/types/course-brain";
import type { SessionStudyContext } from "@/types/study-context";
import type {
  DerivedMemoryContext,
  StudentMemorySettings,
} from "@/types/student-memory";
import type { CourseMaterialFileArtifact } from "@/types/session";
import type { SessionProgressEvaluationResult, SessionProgressTrigger } from "@/lib/course-brain/progress";
import {
  buildConfirmedProfileMemoryRecord,
  buildProfileSignalCandidatesFromEpisode,
  buildStudentMemorySearchQuery,
  buildStudyEpisodeMemory,
} from "@/lib/student-memory/builders";
import {
  applyProfileSignalCandidates,
  applyProfileSignalDecay,
} from "@/lib/student-memory/profile-signals";
import {
  getStudentMemorySyncStatus,
  listStudentProfileSignalLedger,
  replaceStudentProfileSignalLedger,
  upsertStudentMemorySyncStatus,
} from "@/lib/student-memory/repository";
import {
  retrieveSupermemoryContext,
  upsertSupermemoryProfileMemory,
  upsertSupermemoryStudyEpisode,
} from "@/lib/student-memory/supermemory";

export async function retrieveStudentMemoryContext(input: {
  enabled: boolean;
  studentId: string;
  studyContext: SessionStudyContext;
}): Promise<DerivedMemoryContext | null> {
  if (!input.enabled) {
    return null;
  }

  return retrieveSupermemoryContext({
    studentId: input.studentId,
    courseId: input.studyContext.courseId,
    examId: input.studyContext.examId ?? null,
    query: buildStudentMemorySearchQuery({
      courseTitle: input.studyContext.courseTitle,
      examTitle: input.studyContext.examTitle ?? null,
      focusTopic: input.studyContext.focusTopic ?? null,
      sessionGoal: input.studyContext.sessionGoal,
      selectedConceptIds: input.studyContext.selectedConceptIds ?? [],
      selectedFocusTopics: input.studyContext.selectedFocusTopics,
    }),
  });
}

export async function syncStudyEpisodeMemory(input: {
  courseBrain: CourseBrain;
  evaluation: SessionProgressEvaluationResult;
  materialsTouched: Array<
    Pick<CourseMaterialFileArtifact, "materialId" | "title" | "sourceKind">
  >;
  sessionGoal: string;
  sessionId: string;
  settings: StudentMemorySettings;
  studentId: string;
  courseId: string;
  examId: string | null;
  supabase: SupabaseClient;
  trigger: SessionProgressTrigger;
  wroteAt: string;
}) {
  if (!input.settings.memoryOptIn) {
    return;
  }

  const record = buildStudyEpisodeMemory({
    courseBrain: input.courseBrain,
    createdAt: input.wroteAt,
    evaluation: input.evaluation,
    externalSessionId: input.sessionId,
    materialsTouched: input.materialsTouched,
    studentId: input.studentId,
    courseId: input.courseId,
    examId: input.examId,
    trigger: input.trigger,
  });
  const customId = `episode:${input.sessionId}:${input.trigger}`;
  const currentSync = await getStudentMemorySyncStatus(
    input.supabase,
    input.studentId,
    customId,
  );
  const result = await upsertSupermemoryStudyEpisode({
    customId,
    existingDocumentId: currentSync?.external_document_id ?? null,
    record,
  });

  await upsertStudentMemorySyncStatus(input.supabase, {
    customId,
    externalDocumentId: result.documentId,
    lastError: result.error,
    memoryType: "study_episode",
    studentUserId: input.studentId,
    syncStatus: result.success ? "synced" : "failed",
  });

  const existingLedger = applyProfileSignalDecay(
    await listStudentProfileSignalLedger(input.supabase, input.studentId),
    input.wroteAt,
  );
  const candidateSignals = buildProfileSignalCandidatesFromEpisode({
    createdAt: input.wroteAt,
    episode: record,
    sessionGoal: input.sessionGoal,
  });
  const nextSignals = applyProfileSignalCandidates({
    now: input.wroteAt,
    candidates: candidateSignals,
    existingLedger,
    studentId: input.studentId,
  });

  await replaceStudentProfileSignalLedger(
    input.supabase,
    input.studentId,
    nextSignals.nextLedger,
  );

  for (const signal of nextSignals.nextLedger) {
    if (signal.status === "candidate") {
      continue;
    }

    const profileCustomId = `profile:${input.studentId}:${signal.profileKey}`;
    const syncRow = await getStudentMemorySyncStatus(
      input.supabase,
      input.studentId,
      profileCustomId,
    );

    if (signal.status !== "confirmed" && !syncRow?.external_document_id) {
      continue;
    }

    const profileResult = await upsertSupermemoryProfileMemory({
      customId: profileCustomId,
      existingDocumentId: syncRow?.external_document_id ?? null,
      record: buildConfirmedProfileMemoryRecord({
        confidence: signal.confidence,
        lastConfirmedAt: signal.lastConfirmedAt,
        profileKey: signal.profileKey,
        sourceSessionIds: signal.sourceSessionIds,
        status: signal.status,
        studentId: input.studentId,
        summary: signal.summary,
        trustClass: signal.trustClass,
      }),
    });

    await upsertStudentMemorySyncStatus(input.supabase, {
      customId: profileCustomId,
      externalDocumentId: profileResult.documentId,
      lastError: profileResult.error,
      memoryType: "student_profile",
      studentUserId: input.studentId,
      syncStatus: profileResult.success ? "synced" : "failed",
    });
  }
}
