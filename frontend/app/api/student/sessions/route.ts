import { NextResponse } from "next/server";

import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { listDemoSessions } from "@/lib/student-access/demo";
import { requireStudentContext } from "@/lib/student-access/context";
import { decodeCursor } from "@/lib/student-access/cursor";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import { listStudentSessions } from "@/lib/student-access/repository";
import { sessionsQuerySchema } from "@/lib/student-access/schemas";
import { assertIanaTimeZone } from "@/lib/student-access/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = sessionsQuerySchema.safeParse({
      courseId: url.searchParams.get("courseId") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      day: url.searchParams.get("day") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      tz: url.searchParams.get("tz") ?? undefined,
    });

    if (!parsed.success) {
      throw new StudentAccessHttpError(400, "Please provide valid student session filters.");
    }

    if (parsed.data.cursor) {
      decodeCursor(parsed.data.cursor);
    }

    const timeZone = parsed.data.tz ? assertIanaTimeZone(parsed.data.tz) : undefined;

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(
        listDemoSessions({
          courseId: parsed.data.courseId,
          cursor: parsed.data.cursor,
          day: parsed.data.day,
          limit: parsed.data.limit,
          timeZone,
        }),
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    await requireStudentContext(supabase);
    const sessions = await listStudentSessions(supabase, {
      courseId: parsed.data.courseId,
      cursor: parsed.data.cursor,
      day: parsed.data.day,
      limit: parsed.data.limit,
      timeZone,
    });

    return NextResponse.json(sessions, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
