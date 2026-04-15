import { NextResponse } from "next/server";
import { z } from "zod";

import { getDemoStudentCourseDetail } from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { requireStudentContext } from "@/lib/student-access/context";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import { getStudentCourseDetail } from "@/lib/student-access/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const courseIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ courseId: string }>;
  },
) {
  try {
    const { courseId } = await context.params;
    const safeCourseId = courseIdSchema.parse(courseId);

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(getDemoStudentCourseDetail(safeCourseId), {
        headers: NO_STORE_HEADERS,
      });
    }

    const supabase = await createSupabaseServerClient();
    await requireStudentContext(supabase);
    const detail = await getStudentCourseDetail(supabase, safeCourseId);

    return NextResponse.json(detail, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonErrorResponse(
        new StudentAccessHttpError(400, "Please provide a valid course id."),
      );
    }

    return jsonErrorResponse(error);
  }
}
