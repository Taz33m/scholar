import { NextResponse } from "next/server";

import { getDemoCourseById } from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { requireStudentContext } from "@/lib/student-access/context";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import {
  deleteStudentSessionSummary,
  upsertStudentSessionSummary,
} from "@/lib/student-access/repository";
import {
  externalSessionIdSchema,
  upsertStudentSessionSchema,
} from "@/lib/student-access/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ externalSessionId: string }>;
  },
) {
  try {
    const { externalSessionId } = await context.params;
    const safeExternalSessionId = externalSessionIdSchema.parse(externalSessionId);
    const payload = await request.json().catch(() => null);
    const parsed = upsertStudentSessionSchema.safeParse(payload);

    if (!parsed.success) {
      throw new StudentAccessHttpError(400, "Please provide a valid student session payload.");
    }

    if (isStudentAccessDemoModeEnabled()) {
      const matchedCourse = parsed.data.courseId
        ? getDemoCourseById(parsed.data.courseId)
        : null;
      const matchedExam =
        matchedCourse?.activeExam && matchedCourse.activeExam.id === parsed.data.examId
          ? matchedCourse.activeExam
          : matchedCourse?.activeExam ?? null;
      const studyContext =
        matchedCourse && (matchedExam || matchedCourse.activeExam)
          ? {
              courseCode: matchedCourse.courseCode ?? null,
              courseId: matchedCourse.id,
              courseTitle: matchedCourse.title,
              entryPoint: parsed.data.entryPoint,
              examFocusTopics: matchedExam?.focusTopics ?? [],
              examId: matchedExam?.id ?? null,
              examKind: matchedExam?.examKind ?? null,
              examScheduledFor: matchedExam?.scheduledFor ?? null,
              examTitle: matchedExam?.title ?? null,
              focusTopic: parsed.data.focusTopic,
              selectedFocusTopics:
                matchedCourse.onboarding?.selectedFocusTopics ?? [],
              sessionGoal: parsed.data.sessionGoal,
            }
          : null;

      return NextResponse.json(
        {
          session: {
            artifactCount: parsed.data.artifactCount,
            courseId: parsed.data.courseId,
            courseTitle: matchedCourse?.title ?? null,
            endedAt: parsed.data.endedAt,
            entryPoint: parsed.data.entryPoint,
            eventCount: parsed.data.eventCount,
            examId: matchedExam?.id ?? null,
            examTitle: matchedExam?.title ?? null,
            externalSessionId: safeExternalSessionId,
            focusTopic: parsed.data.focusTopic,
            lastActivityAt: parsed.data.lastActivityAt,
            sessionGoal: parsed.data.sessionGoal,
            startedAt: parsed.data.startedAt,
            status: parsed.data.status,
            studyContext,
            summary: parsed.data.summary,
            title: parsed.data.title,
          },
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    const student = await requireStudentContext(supabase);
    const session = await upsertStudentSessionSummary(supabase, safeExternalSessionId, {
      artifactCount: parsed.data.artifactCount,
      courseId: parsed.data.courseId,
      endedAt: parsed.data.endedAt,
      entryPoint: parsed.data.entryPoint,
      eventCount: parsed.data.eventCount,
      examId: parsed.data.examId,
      focusTopic: parsed.data.focusTopic,
      lastActivityAt: parsed.data.lastActivityAt,
      sessionGoal: parsed.data.sessionGoal,
      startedAt: parsed.data.startedAt,
      status: parsed.data.status,
      studentUserId: student.user.id,
      summary: parsed.data.summary,
      title: parsed.data.title,
    });

    return NextResponse.json({ session }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{ externalSessionId: string }>;
  },
) {
  try {
    const { externalSessionId } = await context.params;
    const safeExternalSessionId = externalSessionIdSchema.parse(externalSessionId);

    if (isStudentAccessDemoModeEnabled()) {
      return new NextResponse(null, { headers: NO_STORE_HEADERS, status: 204 });
    }

    const supabase = await createSupabaseServerClient();
    await requireStudentContext(supabase);
    await deleteStudentSessionSummary(supabase, safeExternalSessionId);

    return new NextResponse(null, { headers: NO_STORE_HEADERS, status: 204 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
