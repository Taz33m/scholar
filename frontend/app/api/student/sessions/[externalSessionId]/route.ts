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

      return NextResponse.json(
        {
          session: {
            artifactCount: parsed.data.artifactCount,
            courseId: parsed.data.courseId,
            courseTitle: matchedCourse?.title ?? null,
            endedAt: parsed.data.endedAt,
            eventCount: parsed.data.eventCount,
            externalSessionId: safeExternalSessionId,
            lastActivityAt: parsed.data.lastActivityAt,
            startedAt: parsed.data.startedAt,
            status: parsed.data.status,
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
      eventCount: parsed.data.eventCount,
      lastActivityAt: parsed.data.lastActivityAt,
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
