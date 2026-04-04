import { z } from "zod";

const baseEmailSchema = z.string().trim().toLowerCase().email().max(320);

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
  courseId: z.string().uuid().nullable(),
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
