import { NextResponse } from "next/server";

import { requireStudentContext } from "@/lib/student-access/context";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import { listStudentCalendarDays } from "@/lib/student-access/repository";
import { calendarQuerySchema } from "@/lib/student-access/schemas";
import { assertIanaTimeZone } from "@/lib/student-access/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = calendarQuerySchema.safeParse({
      courseId: url.searchParams.get("courseId") ?? undefined,
      month: url.searchParams.get("month"),
      tz: url.searchParams.get("tz"),
    });

    if (!parsed.success) {
      throw new StudentAccessHttpError(400, "Please provide a valid month and time zone.");
    }

    const timeZone = assertIanaTimeZone(parsed.data.tz);
    const supabase = await createSupabaseServerClient();
    await requireStudentContext(supabase);
    const days = await listStudentCalendarDays(supabase, {
      courseId: parsed.data.courseId,
      month: parsed.data.month,
      timeZone,
    });

    return NextResponse.json(
      {
        courseId: parsed.data.courseId ?? null,
        days,
        month: parsed.data.month,
        timeZone,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
