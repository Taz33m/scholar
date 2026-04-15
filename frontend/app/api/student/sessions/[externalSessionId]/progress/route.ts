import { NextResponse } from "next/server";

import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { requireStudentContext } from "@/lib/student-access/context";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import {
  externalSessionIdSchema,
  sessionProgressPayloadSchema,
} from "@/lib/student-access/schemas";
import { recordStudentSessionProgress } from "@/lib/student-access/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ externalSessionId: string }>;
  },
) {
  try {
    const { externalSessionId } = await context.params;
    const safeExternalSessionId = externalSessionIdSchema.parse(externalSessionId);
    const payload = await request.json().catch(() => null);
    const parsed = sessionProgressPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new StudentAccessHttpError(
        400,
        "Please provide a valid course progress payload.",
      );
    }

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(
        {
          accepted: true,
          checklistArtifact: {
            id: `checklist-${safeExternalSessionId}`,
            type: "session_checklist",
            title: "Checklist",
            createdAt: parsed.data.evaluatedAt,
            summary: "Session objectives aligned to the active exam.",
            courseBrainVersionId: "2026-04-13",
            items: parsed.data.checklistItems,
          },
          conceptProgressSnapshot: [],
          nextRecommendedConceptIds: [],
          mode: "demo",
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    const student = await requireStudentContext(supabase);
    const result = await recordStudentSessionProgress(supabase, {
      checklistItems: parsed.data.checklistItems,
      evaluatedAt: parsed.data.evaluatedAt,
      externalSessionId: safeExternalSessionId,
      materialsTouched: parsed.data.materialsTouched,
      quiz: parsed.data.quiz,
      sessionSummary: parsed.data.sessionSummary,
      studentUserId: student.user.id,
      transcriptText: parsed.data.transcriptText,
      trigger: parsed.data.trigger,
      worksheet: parsed.data.worksheet,
    });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
