import { NextResponse } from "next/server";

import {
  buildInitialChecklistItems,
  createSessionChecklistArtifact,
  getCourseBrainForCourse,
  selectCourseBrainConceptIdsForSession,
} from "@/lib/course-brain";
import {
  getDemoStudentCourseDetail,
  listDemoSessions,
} from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { requireStudentContext } from "@/lib/student-access/context";
import { decodeCursor } from "@/lib/student-access/cursor";
import { jsonErrorResponse, NO_STORE_HEADERS, StudentAccessHttpError } from "@/lib/student-access/http";
import {
  createStudentSessionSummary,
  listStudentSessions,
} from "@/lib/student-access/repository";
import {
  createStudentSessionSchema,
  sessionsQuerySchema,
} from "@/lib/student-access/schemas";
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

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const parsed = createStudentSessionSchema.safeParse(payload);

    if (!parsed.success) {
      throw new StudentAccessHttpError(400, "Please provide a valid course-backed session payload.");
    }

    if (isStudentAccessDemoModeEnabled()) {
      const detail = getDemoStudentCourseDetail(parsed.data.courseId);
      const courseBrain = getCourseBrainForCourse({
        courseSlug: detail.course.slug,
        courseTitle: detail.course.title,
        examTitle: detail.course.activeExam?.title ?? null,
      });
      const studyContext = detail.course.activeExam
        ? {
            courseCode: detail.course.courseCode ?? null,
            courseId: detail.course.id,
            courseTitle: detail.course.title,
            entryPoint: parsed.data.entryPoint,
            examFocusTopics: detail.course.activeExam.focusTopics,
            examId: detail.course.activeExam.id,
            examKind: detail.course.activeExam.examKind,
            examScheduledFor: detail.course.activeExam.scheduledFor,
            examTitle: detail.course.activeExam.title,
            focusTopic: parsed.data.focusTopic,
            selectedFocusTopics:
              detail.course.onboarding?.selectedFocusTopics.length
                ? detail.course.onboarding.selectedFocusTopics
                : detail.course.activeExam.focusTopics,
            sessionGoal:
              parsed.data.sessionGoal.trim() || detail.course.onboarding?.goalText || "",
            courseBrainVersionId: courseBrain?.version ?? null,
            selectedConceptIds: courseBrain
              ? selectCourseBrainConceptIdsForSession({
                  courseBrain,
                  progressSnapshot: [],
                  studyContext: {
                    courseCode: detail.course.courseCode ?? null,
                    courseId: detail.course.id,
                    courseTitle: detail.course.title,
                    examFocusTopics: detail.course.activeExam.focusTopics,
                    examId: detail.course.activeExam.id,
                    examKind: detail.course.activeExam.examKind,
                    examScheduledFor: detail.course.activeExam.scheduledFor,
                    examTitle: detail.course.activeExam.title,
                    focusTopic: parsed.data.focusTopic,
                    selectedFocusTopics:
                      detail.course.onboarding?.selectedFocusTopics.length
                        ? detail.course.onboarding.selectedFocusTopics
                        : detail.course.activeExam.focusTopics,
                    sessionGoal:
                      parsed.data.sessionGoal.trim() ||
                      detail.course.onboarding?.goalText ||
                      "",
                  },
                })
              : [],
            checklistArtifactId: `checklist-session-${Date.now()}-demo`,
            conceptProgressSnapshot: [],
          }
        : null;
      const initialArtifacts =
        courseBrain && studyContext?.selectedConceptIds?.length
          ? [
              createSessionChecklistArtifact({
                checklistArtifactId: studyContext.checklistArtifactId ?? "checklist-demo",
                courseBrain,
                createdAt: new Date(),
                items: buildInitialChecklistItems({
                  courseBrain,
                  conceptIds: studyContext.selectedConceptIds,
                  progressSnapshot: [],
                }),
              }),
            ]
          : undefined;

      return NextResponse.json(
        {
          session: {
            artifactCount: 0,
            courseId: detail.course.id,
            courseTitle: detail.course.title,
            endedAt: null,
            entryPoint: parsed.data.entryPoint,
            eventCount: 1,
            examId: detail.course.activeExam?.id ?? null,
            examTitle: detail.course.activeExam?.title ?? null,
            externalSessionId: `session-${Date.now()}-demo`,
            focusTopic: parsed.data.focusTopic,
            lastActivityAt: new Date().toISOString(),
            sessionGoal:
              parsed.data.sessionGoal.trim() || detail.course.onboarding?.goalText || "",
            startedAt: new Date().toISOString(),
            status: "active",
            studyContext,
            initialArtifacts,
            conceptProgressSnapshot: [],
            summary: "Session started; no artifacts generated yet.",
            title:
              parsed.data.title?.trim() ||
              `${detail.course.title}: ${detail.course.activeExam?.title ?? "Session"}`,
          },
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const supabase = await createSupabaseServerClient();
    const student = await requireStudentContext(supabase);
    const session = await createStudentSessionSummary(supabase, {
      courseId: parsed.data.courseId,
      entryPoint: parsed.data.entryPoint,
      examId: parsed.data.examId,
      focusTopic: parsed.data.focusTopic,
      sessionGoal: parsed.data.sessionGoal,
      studentUserId: student.user.id,
      title: parsed.data.title,
    });

    return NextResponse.json({ session }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
