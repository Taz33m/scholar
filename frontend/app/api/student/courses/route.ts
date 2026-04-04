import { NextResponse } from "next/server";

import { requireStudentContext } from "@/lib/student-access/context";
import { jsonErrorResponse, NO_STORE_HEADERS } from "@/lib/student-access/http";
import { listStudentCourses } from "@/lib/student-access/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    await requireStudentContext(supabase);
    const courses = await listStudentCourses(supabase);

    return NextResponse.json({ courses }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
