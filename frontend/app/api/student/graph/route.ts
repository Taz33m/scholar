import { NextResponse } from "next/server";

import { requireStudentContext } from "@/lib/student-access/context";
import { getDemoStudentGraph } from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import { getStudentGraph, recordStudentGraphUpdate } from "@/lib/student-access/repository";
import {
  graphQuerySchema,
  ingestStudentGraphSchema,
} from "@/lib/student-access/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = graphQuerySchema.safeParse({
      courseId: url.searchParams.get("courseId") ?? undefined,
    });

    if (!parsed.success) {
      throw new StudentAccessHttpError(400, "Please provide a valid course to load the graph.");
    }

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(getDemoStudentGraph(parsed.data.courseId), {
        headers: NO_STORE_HEADERS,
      });
    }

    const supabase = await createSupabaseServerClient();
    await requireStudentContext(supabase);
    const graph = await getStudentGraph(supabase, parsed.data.courseId);

    return NextResponse.json(graph, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const parsed = ingestStudentGraphSchema.safeParse(payload);

    if (!parsed.success) {
      throw new StudentAccessHttpError(400, "Please provide a valid completed session graph payload.");
    }

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(
        {
          accepted: true,
          mode: "demo",
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    const context = await requireStudentContext(supabase);
    const result = await recordStudentGraphUpdate(supabase, {
      artifact_summaries: parsed.data.artifacts,
      course_id: parsed.data.courseId,
      ended_at: parsed.data.endedAt,
      external_session_id: parsed.data.externalSessionId,
      source_summary: parsed.data.summary,
      source_title: parsed.data.title,
      student_user_id: context.user.id,
      transcript_text: parsed.data.transcript,
    });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
