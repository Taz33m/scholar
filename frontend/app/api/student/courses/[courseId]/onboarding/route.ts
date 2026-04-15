import { NextResponse } from "next/server";
import { z } from "zod";

import { upsertDemoStudentCourseOnboarding } from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { requireStudentContext } from "@/lib/student-access/context";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import { upsertStudentCourseOnboarding } from "@/lib/student-access/repository";
import { upsertStudentOnboardingSchema } from "@/lib/student-access/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const courseIdSchema = z.string().uuid();

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ courseId: string }>;
  },
) {
  try {
    const { courseId } = await context.params;
    const safeCourseId = courseIdSchema.parse(courseId);
    const payload = await request.json().catch(() => null);
    const parsed = upsertStudentOnboardingSchema.safeParse(payload);

    if (!parsed.success) {
      throw new StudentAccessHttpError(400, "Please provide a valid onboarding payload.");
    }

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(
        {
          onboarding: upsertDemoStudentCourseOnboarding(safeCourseId, {
            completedAt: parsed.data.status === "completed" ? new Date().toISOString() : null,
            confidenceLevel: parsed.data.confidenceLevel,
            examId: parsed.data.examId,
            goalText: parsed.data.goalText,
            selectedFocusTopics: parsed.data.selectedFocusTopics,
            status: parsed.data.status,
          }),
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    const student = await requireStudentContext(supabase);
    const onboarding = await upsertStudentCourseOnboarding(supabase, safeCourseId, {
      confidenceLevel: parsed.data.confidenceLevel,
      examId: parsed.data.examId,
      goalText: parsed.data.goalText,
      selectedFocusTopics: parsed.data.selectedFocusTopics,
      status: parsed.data.status,
      studentUserId: student.user.id,
    });

    return NextResponse.json({ onboarding }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonErrorResponse(
        new StudentAccessHttpError(400, "Please provide a valid course id."),
      );
    }

    return jsonErrorResponse(error);
  }
}
