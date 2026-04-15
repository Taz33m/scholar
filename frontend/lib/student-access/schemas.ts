import { z } from "zod";

const baseEmailSchema = z.string().trim().toLowerCase().email().max(320);
const onboardingStatusSchema = z.enum(["not_started", "in_progress", "completed"]);
const sessionEntryPointSchema = z.enum([
  "manual",
  "course_home",
  "exam_card",
  "onboarding",
]);
const focusTopicsSchema = z.array(z.string().trim().min(1).max(120)).max(12);

export const requestLinkPayloadSchema = z.object({
  email: baseEmailSchema,
});

export const callbackQuerySchema = z.object({
  token_hash: z.string().trim().min(1),
  type: z.enum([
    "email",
    "magiclink",
    "invite",
    "recovery",
    "email_change",
    "signup",
  ]),
});

export const calendarQuerySchema = z.object({
  month: z.string().trim().regex(/^\d{4}-\d{2}$/),
  tz: z.string().trim().min(1),
  courseId: z.string().uuid().optional(),
});

export const graphQuerySchema = z.object({
  courseId: z.string().uuid(),
});

export const sessionsQuerySchema = z
  .object({
    courseId: z.string().uuid().optional(),
    day: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    tz: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.day && !value.tz) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A valid time zone is required when filtering by day.",
        path: ["tz"],
      });
    }
  });

export const upsertStudentSessionSchema = z.object({
  courseId: z.string().uuid().nullable().optional().default(null),
  examId: z.string().uuid().nullable().optional().default(null),
  entryPoint: sessionEntryPointSchema.optional().default("manual"),
  focusTopic: z.string().trim().min(1).max(200).nullable().optional().default(null),
  sessionGoal: z.string().trim().max(1000).optional().default(""),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(4000),
  status: z.enum(["active", "ended"]),
  artifactCount: z.number().int().min(0),
  eventCount: z.number().int().min(0),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).nullable(),
  lastActivityAt: z.string().datetime({ offset: true }),
});

export const externalSessionIdSchema = z.string().trim().min(1).max(200);

export const createStudentSessionSchema = z.object({
  courseId: z.string().uuid(),
  examId: z.string().uuid().nullable().default(null),
  entryPoint: sessionEntryPointSchema.default("manual"),
  focusTopic: z.string().trim().min(1).max(200).nullable().default(null),
  sessionGoal: z.string().trim().max(1000).default(""),
  title: z.string().trim().min(1).max(200).nullable().optional(),
});

export const upsertStudentOnboardingSchema = z.object({
  examId: z.string().uuid(),
  status: onboardingStatusSchema,
  confidenceLevel: z.number().int().min(1).max(5).nullable(),
  selectedFocusTopics: focusTopicsSchema.default([]),
  goalText: z.string().trim().max(1000).default(""),
});

export const graphArtifactSchema = z.object({
  type: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4000),
});

export const sessionChecklistItemSchema = z.object({
  id: z.string().trim().min(1).max(200),
  conceptId: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(200),
  bloomLevel: z.enum(["remember", "understand", "apply", "analyze"]),
  successCriteria: z.string().trim().min(1).max(400),
  status: z.enum(["not_started", "in_progress", "completed", "needs_review"]),
  evidenceNote: z.string().trim().max(1000).default(""),
});

export const studentMemoryPreferencesSchema = z.object({
  enabled: z.boolean(),
});

export const sessionMaterialTouchSchema = z.object({
  materialId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(240),
  sourceKind: z.enum(["syllabus", "announcement", "lecture", "case", "practice_questions"]),
});

export const sessionProgressPayloadSchema = z.object({
  checklistItems: z.array(sessionChecklistItemSchema).min(1).max(8),
  evaluatedAt: z.string().datetime({ offset: true }),
  trigger: z.enum(["quiz_submission", "worksheet_checkpoint", "session_exit"]),
  sessionSummary: z.string().trim().max(4000).default(""),
  transcriptText: z.string().trim().max(40000).default(""),
  materialsTouched: z.array(sessionMaterialTouchSchema).max(12).default([]),
  quiz: z
    .object({
      isSubmitted: z.boolean(),
      score: z.number().int().min(0).nullable(),
      totalQuestions: z.number().int().min(0),
    })
    .nullable()
    .default(null),
  worksheet: z
    .object({
      answeredCount: z.number().int().min(0),
      totalQuestions: z.number().int().min(0),
    })
    .nullable()
    .default(null),
});

export const ingestStudentGraphSchema = z.object({
  externalSessionId: externalSessionIdSchema,
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4000),
  transcript: z.string().trim().min(1).max(40000),
  artifacts: z.array(graphArtifactSchema).max(50).default([]),
  endedAt: z.string().datetime({ offset: true }),
});
