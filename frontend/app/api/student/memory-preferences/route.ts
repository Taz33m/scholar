import { NextResponse } from "next/server";

import { STUDENT_MEMORY_CONSENT_VERSION } from "@/lib/student-memory/config";
import {
  getStudentMemorySettings,
  updateStudentMemorySettings,
} from "@/lib/student-memory/repository";
import { getDemoStudentHomeState } from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { requireStudentContext } from "@/lib/student-access/context";
import {
  jsonErrorResponse,
  NO_STORE_HEADERS,
  StudentAccessHttpError,
} from "@/lib/student-access/http";
import { studentMemoryPreferencesSchema } from "@/lib/student-access/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(
        { settings: getDemoStudentHomeState().user.memorySettings },
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    const student = await requireStudentContext(supabase);
    const settings = await getStudentMemorySettings(supabase, student.user.id);

    return NextResponse.json({ settings }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const parsed = studentMemoryPreferencesSchema.safeParse(payload);

    if (!parsed.success) {
      throw new StudentAccessHttpError(
        400,
        "Please provide a valid memory preference payload.",
      );
    }

    if (isStudentAccessDemoModeEnabled()) {
      return NextResponse.json(
        {
          settings: {
            memoryOptIn: parsed.data.enabled,
            memoryOptedInAt: parsed.data.enabled ? new Date().toISOString() : null,
            memoryConsentVersion: parsed.data.enabled
              ? STUDENT_MEMORY_CONSENT_VERSION
              : null,
          },
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    const student = await requireStudentContext(supabase);
    const settings = await updateStudentMemorySettings(supabase, {
      enabled: parsed.data.enabled,
      studentUserId: student.user.id,
    });

    return NextResponse.json({ settings }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
