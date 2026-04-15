import { z } from "zod";

const derivedMemoryEntryBaseSchema = z.object({
  label: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  trustClass: z.enum(["authoritative_derived", "behavioral_inference"]),
  confidence: z.enum(["high", "medium", "low"]),
  provenance: z.enum([
    "authoritative_quiz_result",
    "authoritative_worksheet_checkpoint",
    "authoritative_session_exit",
    "derived_profile_update",
  ]),
  timestamp: z.string().datetime({ offset: true }).nullable(),
});

const recentStudyEpisodeMemorySchema = derivedMemoryEntryBaseSchema.extend({
  memoryType: z.literal("study_episode"),
  externalSessionId: z.string().trim().min(1).max(200),
  trigger: z.enum(["quiz_submission", "worksheet_checkpoint", "session_exit"]),
  focusConceptIds: z.array(z.string().trim().min(1).max(160)).max(8),
  focusConceptLabels: z.array(z.string().trim().min(1).max(200)).max(8),
  materialsTouched: z
    .array(
      z.object({
        materialId: z.string().trim().min(1).max(160),
        title: z.string().trim().min(1).max(200),
        kind: z.string().trim().min(1).max(80),
      }),
    )
    .max(8),
});

const confirmedProfileMemorySchema = derivedMemoryEntryBaseSchema.extend({
  memoryType: z.literal("student_profile"),
  profileKey: z.string().trim().min(1).max(160),
  status: z.enum(["confirmed", "stale", "contradicted", "superseded"]),
});

export const studyContextRequestSchema = z
  .object({
    courseId: z.string().uuid(),
    courseTitle: z.string().trim().min(1).max(200),
    courseCode: z.string().trim().min(1).max(120).nullable(),
    examId: z.string().uuid().nullable(),
    examTitle: z.string().trim().min(1).max(200).nullable(),
    examKind: z.enum(["midterm", "final", "practical", "other"]).nullable(),
    examScheduledFor: z.string().datetime({ offset: true }).nullable(),
    examFocusTopics: z.array(z.string().trim().min(1).max(160)).max(16),
    selectedFocusTopics: z.array(z.string().trim().min(1).max(160)).max(16),
    sessionGoal: z.string().trim().max(1000),
    courseBrainVersionId: z.string().trim().min(1).max(120).nullable().optional(),
    selectedConceptIds: z
      .array(z.string().trim().min(1).max(160))
      .max(12)
      .optional(),
    checklistArtifactId: z.string().trim().min(1).max(200).nullable().optional(),
    conceptProgressSnapshot: z
      .array(
        z.object({
          conceptId: z.string().trim().min(1).max(160),
          conceptName: z.string().trim().min(1).max(200),
          highestDemonstratedBloomLevel: z
            .enum(["remember", "understand", "apply", "analyze"])
            .nullable(),
          status: z.enum([
            "not_assessed",
            "emerging",
            "developing",
            "confident",
            "needs_review",
          ]),
          confidenceSignal: z.number().min(0).max(1),
          misconceptionSummary: z.string().max(1000),
          evidenceCount: z.number().int().min(0),
          lastDemonstratedAt: z.string().datetime({ offset: true }).nullable(),
          evidenceSummary: z.string().max(2000),
        }),
      )
      .max(20)
      .optional(),
    derivedMemoryContext: z
      .object({
        recentStudyEpisodes: z.array(recentStudyEpisodeMemorySchema).max(4),
        confirmedProfileMemory: z.array(confirmedProfileMemorySchema).max(1),
      })
      .optional(),
    entryPoint: z
      .enum(["manual", "course_home", "exam_card", "onboarding"])
      .optional(),
    focusTopic: z.string().trim().min(1).max(200).optional(),
  })
  .nullable()
  .optional();
