import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEmptyConceptProgress,
  buildInitialChecklistItems,
  createSessionChecklistArtifact,
  getCourseBrainForCourse,
  selectCourseBrainConceptIdsForSession,
} from "@/lib/course-brain";
import { evaluateSessionProgress } from "@/lib/course-brain/progress";
import {
  buildCourseConceptFallbackGraph,
} from "@/lib/student-access/course-concepts";
import { getStudentMemorySettings } from "@/lib/student-memory/repository";
import {
  retrieveStudentMemoryContext,
  syncStudyEpisodeMemory,
} from "@/lib/student-memory/service";
import { decodeCursor, encodeCursor } from "@/lib/student-access/cursor";
import {
  buildStudentGraphRecommendations,
  buildStudentGraphStats,
  deriveStudentGraphTier,
  getFallbackGraphPosition,
} from "@/lib/student-access/graph";
import { assertAuthorizedCourseAccess } from "@/lib/student-access/context";
import { StudentAccessHttpError } from "@/lib/student-access/http";
import type {
  StudentCourse,
  StudentCourseDetailResponse,
  StudentCourseExam,
  StudentCourseOnboardingState,
  StudentGraphEdge,
  StudentGraphNode,
  StudentGraphResponse,
  StudentSession,
} from "@/lib/student-app/types";
import type {
  SessionChecklistItem,
  StudentConceptProgress,
} from "@/types/course-brain";
import type { CourseMaterialFileArtifact } from "@/types/session";
import {
  formatDateInTimeZone,
  getLocalDayUtcRange,
  getMonthUtcRange,
} from "@/lib/student-access/timezone";
import { createSessionId } from "@/lib/session-storage";
import type {
  SessionStudyContext,
  StudentOnboardingStatus,
  StudentSessionEntryPoint,
} from "@/types/study-context";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  course_code: string | null;
  term_label: string | null;
  description: string | null;
  meeting_pattern: string | null;
  time_zone: string | null;
  color_token: string | null;
};

type CourseExamRow = {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  exam_kind: StudentCourseExam["examKind"];
  scheduled_for: string | null;
  scope_summary: string | null;
  focus_topics: string[] | null;
  status: "draft" | "active" | "archived";
};

type OnboardingRow = {
  course_id: string;
  exam_id: string;
  status: StudentOnboardingStatus;
  confidence_level: number | null;
  selected_focus_topics: string[] | null;
  goal_text: string | null;
  completed_at: string | null;
};

type SessionSummaryRow = {
  external_session_id: string;
  title: string;
  summary: string;
  status: "active" | "ended";
  course_id: string | null;
  exam_id: string | null;
  entry_point: StudentSessionEntryPoint;
  focus_topic: string | null;
  session_goal: string | null;
  artifact_count: number;
  event_count: number;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
};

type SessionAggregateRow = {
  course_id: string | null;
  last_activity_at: string;
};

type GraphUpdateRow = {
  artifact_summaries: unknown;
  course_id: string;
  ended_at: string;
  external_session_id: string;
  source_summary: string;
  source_title: string;
  student_user_id: string;
  transcript_text: string;
};

type ConceptProgressRow = {
  concept_id: string;
  concept_name: string;
  highest_demonstrated_bloom_level:
    | "remember"
    | "understand"
    | "apply"
    | "analyze"
    | null;
  status:
    | "not_assessed"
    | "emerging"
    | "developing"
    | "confident"
    | "needs_review";
  confidence_signal: number | null;
  misconception_summary: string | null;
  evidence_count: number | null;
  last_demonstrated_at: string | null;
  evidence_summary: string | null;
};

type CreateStudentSessionInput = {
  courseId: string;
  entryPoint: StudentSessionEntryPoint;
  examId: string | null;
  focusTopic: string | null;
  sessionGoal: string;
  studentUserId: string;
  title?: string | null;
};

type UpsertStudentOnboardingInput = {
  confidenceLevel: number | null;
  examId: string;
  goalText: string;
  selectedFocusTopics: string[];
  status: StudentOnboardingStatus;
  studentUserId: string;
};

type UpsertStudentSessionInput = {
  artifactCount: number;
  courseId: string | null;
  endedAt: string | null;
  entryPoint?: StudentSessionEntryPoint;
  eventCount: number;
  examId?: string | null;
  focusTopic?: string | null;
  lastActivityAt: string;
  sessionGoal?: string;
  startedAt: string;
  status: "active" | "ended";
  studentUserId: string;
  summary: string;
  title: string;
};

type RecordStudentSessionProgressInput = {
  checklistItems: SessionChecklistItem[];
  evaluatedAt: string;
  externalSessionId: string;
  quiz:
    | {
        isSubmitted: boolean;
        score: number | null;
        totalQuestions: number;
      }
    | null;
  sessionSummary: string;
  studentUserId: string;
  transcriptText: string;
  trigger: "quiz_submission" | "worksheet_checkpoint" | "session_exit";
  materialsTouched: Array<
    Pick<CourseMaterialFileArtifact, "materialId" | "title" | "sourceKind">
  >;
  worksheet:
    | {
        answeredCount: number;
        totalQuestions: number;
      }
    | null;
};

function toIsoString(date: Date) {
  return date.toISOString();
}

function normalizeTextArray(value: string[] | null | undefined) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function isMissingCourseProgressRelationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "PGRST205" ||
    candidate.code === "42P01" ||
    (typeof candidate.message === "string" &&
      (candidate.message.includes("student_concept_progress") ||
        candidate.message.includes("student_session_objectives") ||
        candidate.message.includes("student_session_learning_evidence")))
  );
}

function toStudentConceptProgress(row: ConceptProgressRow): StudentConceptProgress {
  return {
    conceptId: row.concept_id,
    conceptName: row.concept_name,
    highestDemonstratedBloomLevel: row.highest_demonstrated_bloom_level,
    status: row.status,
    confidenceSignal: Math.max(0, Math.min(1, row.confidence_signal ?? 0)),
    misconceptionSummary: row.misconception_summary ?? "",
    evidenceCount: row.evidence_count ?? 0,
    lastDemonstratedAt: row.last_demonstrated_at,
    evidenceSummary: row.evidence_summary ?? "",
  };
}

function progressStatusToMasteryScore(progress: StudentConceptProgress) {
  if (progress.status === "confident") {
    return 88;
  }

  if (progress.status === "developing") {
    return 68;
  }

  if (progress.status === "emerging") {
    return 48;
  }

  if (progress.status === "needs_review") {
    return 28;
  }

  return 0;
}

function toStudentCourseExam(row: CourseExamRow | null | undefined): StudentCourseExam | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    examKind: row.exam_kind,
    scheduledFor: row.scheduled_for,
    scopeSummary: row.scope_summary ?? "",
    focusTopics: normalizeTextArray(row.focus_topics),
  };
}

function toStudentOnboardingState(
  row: OnboardingRow | null | undefined,
): StudentCourseOnboardingState | null {
  if (!row) {
    return null;
  }

  return {
    examId: row.exam_id,
    status: row.status,
    confidenceLevel:
      typeof row.confidence_level === "number" ? row.confidence_level : null,
    selectedFocusTopics: normalizeTextArray(row.selected_focus_topics),
    goalText: row.goal_text ?? "",
    completedAt: row.completed_at,
  };
}

function buildStudyContext({
  course,
  exam,
  onboarding,
  courseBrainVersionId,
  selectedConceptIds,
  checklistArtifactId,
  conceptProgressSnapshot,
  derivedMemoryContext,
  entryPoint,
  focusTopic,
  sessionGoal,
}: {
  course: StudentCourse;
  exam: StudentCourseExam | null;
  onboarding: StudentCourseOnboardingState | null;
  courseBrainVersionId?: string | null;
  selectedConceptIds?: string[];
  checklistArtifactId?: string | null;
  conceptProgressSnapshot?: StudentConceptProgress[];
  derivedMemoryContext?: SessionStudyContext["derivedMemoryContext"];
  entryPoint?: StudentSessionEntryPoint;
  focusTopic?: string | null;
  sessionGoal?: string | null;
}): SessionStudyContext {
  return {
    courseCode: course.courseCode ?? null,
    courseId: course.id,
    courseTitle: course.title,
    examFocusTopics: exam?.focusTopics ?? [],
    examId: exam?.id ?? null,
    examKind: exam?.examKind ?? null,
    examScheduledFor: exam?.scheduledFor ?? null,
    examTitle: exam?.title ?? null,
    selectedFocusTopics:
      onboarding?.selectedFocusTopics.length
        ? onboarding.selectedFocusTopics
        : exam?.focusTopics ?? [],
    sessionGoal: (sessionGoal ?? onboarding?.goalText ?? "").trim(),
    courseBrainVersionId: courseBrainVersionId ?? null,
    selectedConceptIds: selectedConceptIds ?? [],
    checklistArtifactId: checklistArtifactId ?? null,
    conceptProgressSnapshot: conceptProgressSnapshot ?? [],
    derivedMemoryContext: derivedMemoryContext ?? null,
    ...(entryPoint ? { entryPoint } : {}),
    ...(focusTopic ? { focusTopic } : {}),
  };
}

function buildDerivedSessionTitle(input: {
  courseTitle: string;
  examTitle: string | null;
  focusTopic: string | null;
  requestedTitle?: string | null;
}) {
  const requested = input.requestedTitle?.trim();
  if (requested) {
    return requested;
  }

  if (input.focusTopic?.trim()) {
    return `${input.courseTitle}: ${input.focusTopic.trim()}`;
  }

  if (input.examTitle?.trim()) {
    return `${input.courseTitle}: ${input.examTitle.trim()}`;
  }

  return `${input.courseTitle} Session`;
}

function buildCourseFromRow({
  aggregate,
  exam,
  onboarding,
  row,
}: {
  row: CourseRow;
  exam: CourseExamRow | null;
  onboarding: OnboardingRow | null;
  aggregate?: { lastActivityAt: string | null; sessionCount: number };
}): StudentCourse {
  return {
    activeExam: toStudentCourseExam(exam),
    colorToken: row.color_token,
    courseCode: row.course_code,
    description: row.description,
    id: row.id,
    lastActivityAt: aggregate?.lastActivityAt ?? null,
    meetingPattern: row.meeting_pattern,
    onboarding: toStudentOnboardingState(onboarding),
    onboardingStatus: onboarding?.status ?? "not_started",
    sessionCount: aggregate?.sessionCount ?? 0,
    slug: row.slug,
    termLabel: row.term_label,
    timeZone: row.time_zone ?? "America/New_York",
    title: row.title,
  };
}

async function getAccessibleCourses(supabase: SupabaseClient) {
  const courseResult = await supabase
    .from("courses")
    .select(
      "id, slug, title, course_code, term_label, description, meeting_pattern, time_zone, color_token",
    )
    .eq("is_active", true)
    .order("title", { ascending: true });

  if (courseResult.error) {
    throw courseResult.error;
  }

  return (courseResult.data ?? []) as CourseRow[];
}

async function getActiveCourseExamRows(
  supabase: SupabaseClient,
  courseIds: string[],
) {
  if (courseIds.length === 0) {
    return new Map<string, CourseExamRow>();
  }

  const examResult = await supabase
    .from("course_exams")
    .select(
      "id, course_id, slug, title, exam_kind, scheduled_for, scope_summary, focus_topics, status",
    )
    .in("course_id", courseIds)
    .eq("status", "active")
    .order("scheduled_for", { ascending: true, nullsFirst: false });

  if (examResult.error) {
    throw examResult.error;
  }

  const examMap = new Map<string, CourseExamRow>();

  for (const row of (examResult.data ?? []) as CourseExamRow[]) {
    if (!examMap.has(row.course_id)) {
      examMap.set(row.course_id, row);
    }
  }

  return examMap;
}

async function getOnboardingRows(
  supabase: SupabaseClient,
  courseIds: string[],
  examIds: string[],
) {
  if (courseIds.length === 0 || examIds.length === 0) {
    return new Map<string, OnboardingRow>();
  }

  const onboardingResult = await supabase
    .from("student_course_onboarding")
    .select(
      "course_id, exam_id, status, confidence_level, selected_focus_topics, goal_text, completed_at",
    )
    .in("course_id", courseIds)
    .in("exam_id", examIds)
    .order("updated_at", { ascending: false });

  if (onboardingResult.error) {
    throw onboardingResult.error;
  }

  const onboardingMap = new Map<string, OnboardingRow>();

  for (const row of (onboardingResult.data ?? []) as OnboardingRow[]) {
    const key = `${row.course_id}:${row.exam_id}`;
    if (!onboardingMap.has(key)) {
      onboardingMap.set(key, row);
    }
  }

  return onboardingMap;
}

async function getCourseAggregateMap(supabase: SupabaseClient, courseIds: string[]) {
  if (courseIds.length === 0) {
    return new Map<string, { lastActivityAt: string | null; sessionCount: number }>();
  }

  const aggregateResult = await supabase
    .from("student_session_summaries")
    .select("course_id, last_activity_at")
    .in("course_id", courseIds);

  if (aggregateResult.error) {
    throw aggregateResult.error;
  }

  const aggregates = new Map<string, { lastActivityAt: string | null; sessionCount: number }>();

  for (const courseId of courseIds) {
    aggregates.set(courseId, { lastActivityAt: null, sessionCount: 0 });
  }

  for (const row of (aggregateResult.data ?? []) as SessionAggregateRow[]) {
    if (!row.course_id) {
      continue;
    }

    const aggregate = aggregates.get(row.course_id);
    if (!aggregate) {
      continue;
    }

    aggregate.sessionCount += 1;

    if (!aggregate.lastActivityAt || row.last_activity_at > aggregate.lastActivityAt) {
      aggregate.lastActivityAt = row.last_activity_at;
    }
  }

  return aggregates;
}

async function getCourseWithDetail(
  supabase: SupabaseClient,
  courseId: string,
): Promise<StudentCourse> {
  await assertAuthorizedCourseAccess(supabase, courseId);

  const [courseResult, aggregateMap, examMap] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, slug, title, course_code, term_label, description, meeting_pattern, time_zone, color_token",
      )
      .eq("id", courseId)
      .eq("is_active", true)
      .maybeSingle(),
    getCourseAggregateMap(supabase, [courseId]),
    getActiveCourseExamRows(supabase, [courseId]),
  ]);

  if (courseResult.error) {
    throw courseResult.error;
  }

  if (!courseResult.data) {
    throw new StudentAccessHttpError(404, "Course not found.");
  }

  const exam = examMap.get(courseId) ?? null;
  const onboardingMap = await getOnboardingRows(
    supabase,
    [courseId],
    exam ? [exam.id] : [],
  );

  return buildCourseFromRow({
    aggregate: aggregateMap.get(courseId),
    exam,
    onboarding: exam ? onboardingMap.get(`${courseId}:${exam.id}`) ?? null : null,
    row: courseResult.data as CourseRow,
  });
}

async function getAccessibleExamRow(
  supabase: SupabaseClient,
  courseId: string,
  examId: string,
) {
  const examResult = await supabase
    .from("course_exams")
    .select(
      "id, course_id, slug, title, exam_kind, scheduled_for, scope_summary, focus_topics, status",
    )
    .eq("id", examId)
    .eq("course_id", courseId)
    .eq("status", "active")
    .maybeSingle();

  if (examResult.error) {
    throw examResult.error;
  }

  if (!examResult.data) {
    throw new StudentAccessHttpError(403, "You do not have access to that exam.");
  }

  return examResult.data as CourseExamRow;
}

async function getStudentConceptProgressSnapshot(
  supabase: SupabaseClient,
  courseId: string,
) {
  const result = await supabase
    .from("student_concept_progress")
    .select(
      "concept_id, concept_name, highest_demonstrated_bloom_level, status, confidence_signal, misconception_summary, evidence_count, last_demonstrated_at, evidence_summary",
    )
    .eq("course_id", courseId)
    .order("updated_at", { ascending: false });

  if (result.error) {
    if (isMissingCourseProgressRelationError(result.error)) {
      return [];
    }

    throw result.error;
  }

  return ((result.data ?? []) as ConceptProgressRow[]).map(toStudentConceptProgress);
}

function mapSessionRowToStudentSession({
  course,
  exam,
  onboarding,
  courseBrainVersionId,
  selectedConceptIds,
  checklistArtifactId,
  conceptProgressSnapshot,
  initialArtifacts,
  row,
}: {
  row: SessionSummaryRow;
  course: StudentCourse | null;
  exam: StudentCourseExam | null;
  onboarding: StudentCourseOnboardingState | null;
  courseBrainVersionId?: string | null;
  selectedConceptIds?: string[];
  checklistArtifactId?: string | null;
  conceptProgressSnapshot?: StudentConceptProgress[];
  initialArtifacts?: StudentSession["initialArtifacts"];
}): StudentSession {
  const studyContext =
    course && row.course_id
      ? buildStudyContext({
          course,
          exam,
          onboarding,
          courseBrainVersionId,
          selectedConceptIds,
          checklistArtifactId,
          conceptProgressSnapshot,
          entryPoint: row.entry_point,
          focusTopic: row.focus_topic,
          sessionGoal: row.session_goal,
        })
      : null;

  return {
    artifactCount: row.artifact_count,
    courseId: course ? row.course_id : null,
    courseTitle: course?.title ?? null,
    endedAt: row.ended_at,
    entryPoint: row.entry_point,
    eventCount: row.event_count,
    examId: exam?.id ?? null,
    examTitle: exam?.title ?? null,
    externalSessionId: row.external_session_id,
    focusTopic: row.focus_topic,
    initialArtifacts,
    lastActivityAt: row.last_activity_at,
    conceptProgressSnapshot,
    sessionGoal: row.session_goal ?? "",
    startedAt: row.started_at,
    status: row.status,
    studyContext,
    summary: row.summary,
    title: row.title,
  };
}

export async function listStudentCourses(supabase: SupabaseClient) {
  const courses = await getAccessibleCourses(supabase);

  if (courses.length === 0) {
    return [];
  }

  const courseIds = courses.map((course) => course.id);
  const [aggregates, examMap] = await Promise.all([
    getCourseAggregateMap(supabase, courseIds),
    getActiveCourseExamRows(supabase, courseIds),
  ]);
  const examIds = Array.from(examMap.values()).map((exam) => exam.id);
  const onboardingMap = await getOnboardingRows(supabase, courseIds, examIds);

  return courses.map((course) =>
    buildCourseFromRow({
      aggregate: aggregates.get(course.id),
      exam: examMap.get(course.id) ?? null,
      onboarding:
        examMap.get(course.id)
          ? onboardingMap.get(`${course.id}:${examMap.get(course.id)!.id}`) ?? null
          : null,
      row: course,
    }),
  );
}

export async function getStudentCourseDetail(
  supabase: SupabaseClient,
  courseId: string,
): Promise<StudentCourseDetailResponse> {
  const course = await getCourseWithDetail(supabase, courseId);
  return { course };
}

export async function upsertStudentCourseOnboarding(
  supabase: SupabaseClient,
  courseId: string,
  input: UpsertStudentOnboardingInput,
) {
  await assertAuthorizedCourseAccess(supabase, courseId);
  await getAccessibleExamRow(supabase, courseId, input.examId);

  const now = new Date().toISOString();
  const result = await supabase
    .from("student_course_onboarding")
    .upsert(
      {
        completed_at: input.status === "completed" ? now : null,
        confidence_level: input.confidenceLevel,
        course_id: courseId,
        exam_id: input.examId,
        goal_text: input.goalText,
        selected_focus_topics: input.selectedFocusTopics,
        status: input.status,
        student_user_id: input.studentUserId,
      },
      { onConflict: "student_user_id,course_id,exam_id" },
    )
    .select(
      "course_id, exam_id, status, confidence_level, selected_focus_topics, goal_text, completed_at",
    )
    .single();

  if (result.error) {
    if (result.error.code === "42501" || result.error.code === "23505") {
      throw new StudentAccessHttpError(403, "You do not have access to that onboarding flow.");
    }

    throw result.error;
  }

  return toStudentOnboardingState(result.data as OnboardingRow);
}

export async function createStudentSessionSummary(
  supabase: SupabaseClient,
  input: CreateStudentSessionInput,
) {
  const course = await getCourseWithDetail(supabase, input.courseId);
  const conceptProgressSnapshot = await getStudentConceptProgressSnapshot(
    supabase,
    input.courseId,
  );

  const examRow = input.examId
    ? await getAccessibleExamRow(supabase, input.courseId, input.examId)
    : null;
  const exam = toStudentCourseExam(examRow);
  const onboarding = course.onboarding;
  const courseBrain = getCourseBrainForCourse({
    courseSlug: course.slug,
    courseTitle: course.title,
    examTitle: exam?.title ?? null,
  });
  const provisionalStudyContext = buildStudyContext({
    course,
    exam,
    onboarding,
    conceptProgressSnapshot,
    entryPoint: input.entryPoint,
    focusTopic: input.focusTopic,
    sessionGoal: input.sessionGoal,
  });
  const selectedConceptIds = courseBrain
    ? selectCourseBrainConceptIdsForSession({
        courseBrain,
        progressSnapshot: conceptProgressSnapshot,
        studyContext: provisionalStudyContext,
      })
    : [];
  const now = new Date().toISOString();
  const externalSessionId = createSessionId();
  const checklistArtifactId = `checklist-${externalSessionId}`;
  const baseStudyContext = buildStudyContext({
    course,
    exam,
    onboarding,
    courseBrainVersionId: courseBrain?.version ?? null,
    selectedConceptIds,
    checklistArtifactId,
    conceptProgressSnapshot,
    entryPoint: input.entryPoint,
    focusTopic: input.focusTopic,
    sessionGoal: input.sessionGoal,
  });
  let derivedMemoryContext: SessionStudyContext["derivedMemoryContext"] = null;

  try {
    const memorySettings = await getStudentMemorySettings(supabase, input.studentUserId);
    derivedMemoryContext = await retrieveStudentMemoryContext({
      enabled: memorySettings.memoryOptIn,
      studentId: input.studentUserId,
      studyContext: baseStudyContext,
    });
  } catch (error) {
    console.error("Failed to retrieve student memory context:", error);
  }

  const studyContext = buildStudyContext({
    course,
    exam,
    onboarding,
    courseBrainVersionId: courseBrain?.version ?? null,
    selectedConceptIds,
    checklistArtifactId,
    conceptProgressSnapshot,
    derivedMemoryContext,
    entryPoint: input.entryPoint,
    focusTopic: input.focusTopic,
    sessionGoal: input.sessionGoal,
  });
  const title = buildDerivedSessionTitle({
    courseTitle: course.title,
    examTitle: exam?.title ?? null,
    focusTopic: input.focusTopic,
    requestedTitle: input.title,
  });
  const checklistArtifact =
    courseBrain && selectedConceptIds.length > 0
      ? createSessionChecklistArtifact({
          checklistArtifactId,
          courseBrain,
          createdAt: new Date(now),
          items: buildInitialChecklistItems({
            courseBrain,
            conceptIds: selectedConceptIds,
            progressSnapshot: conceptProgressSnapshot,
          }),
        })
      : null;
  const result = await supabase
    .from("student_session_summaries")
    .insert({
      artifact_count: 0,
      course_id: course.id,
      ended_at: null,
      entry_point: input.entryPoint,
      event_count: 1,
      exam_id: exam?.id ?? null,
      external_session_id: externalSessionId,
      focus_topic: input.focusTopic,
      last_activity_at: now,
      session_goal: studyContext.sessionGoal,
      started_at: now,
      status: "active",
      student_user_id: input.studentUserId,
      summary: "Session started; no artifacts generated yet.",
      title,
    })
    .select(
      "external_session_id, title, summary, status, course_id, exam_id, entry_point, focus_topic, session_goal, artifact_count, event_count, started_at, ended_at, last_activity_at",
    )
    .single();

  if (result.error) {
    if (result.error.code === "42501" || result.error.code === "23505") {
      throw new StudentAccessHttpError(403, "You do not have access to create that session.");
    }

    throw result.error;
  }

  return mapSessionRowToStudentSession({
    course,
    exam,
    onboarding,
    checklistArtifactId: checklistArtifact?.id ?? null,
    conceptProgressSnapshot,
    courseBrainVersionId: courseBrain?.version ?? null,
    initialArtifacts: checklistArtifact ? [checklistArtifact] : undefined,
    selectedConceptIds,
    row: result.data as SessionSummaryRow,
  });
}

export async function getStudentGraph(
  supabase: SupabaseClient,
  courseId: string,
): Promise<StudentGraphResponse> {
  const course = await getCourseWithDetail(supabase, courseId);
  const courseBrain = getCourseBrainForCourse({
    courseSlug: course.slug,
    courseTitle: course.title,
    examTitle: course.activeExam?.title ?? null,
  });

  if (!courseBrain) {
    const fallbackGraph = buildCourseConceptFallbackGraph(course);
    if (fallbackGraph) {
      return fallbackGraph;
    }
  }

  const progressSnapshot = await getStudentConceptProgressSnapshot(supabase, courseId);
  const progressMap = new Map(
    progressSnapshot.map((entry) => [entry.conceptId, entry]),
  );

  if (!courseBrain) {
    const fallbackGraph = buildCourseConceptFallbackGraph(course);
    if (fallbackGraph) {
      return fallbackGraph;
    }
  }

  const nodes = (courseBrain?.concepts ?? []).map(
    (concept, index): StudentGraphNode => {
      const progress =
        progressMap.get(concept.id) ?? buildEmptyConceptProgress(concept);
      const fallback = getFallbackGraphPosition(index, courseBrain?.concepts.length ?? 1);
      const masteryScore = progressStatusToMasteryScore(progress);

      return {
        conceptName: concept.label,
        evidenceCount: progress.evidenceCount,
        evidenceSummary: progress.evidenceSummary || concept.summary,
        id: concept.id,
        lastStudiedAt: progress.lastDemonstratedAt,
        masteryScore,
        masteryTier: deriveStudentGraphTier(masteryScore),
        x: concept.x ?? fallback.x,
        y: concept.y ?? fallback.y,
      };
    },
  );

  const edges: StudentGraphEdge[] = (courseBrain?.conceptEdges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    strength: edge.strength,
  }));

  const lastUpdatedAt =
    progressSnapshot
      .map((entry) => entry.lastDemonstratedAt)
      .filter((value): value is string => typeof value === "string")
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    course,
    edges,
    lastUpdatedAt,
    nodes,
    recommendations: buildStudentGraphRecommendations(nodes),
    stats: buildStudentGraphStats(nodes),
  };
}

export async function recordStudentGraphUpdate(
  supabase: SupabaseClient,
  input: GraphUpdateRow,
) {
  await assertAuthorizedCourseAccess(supabase, input.course_id);

  const result = await supabase.from("student_session_graph_updates").upsert(
    {
      artifact_summaries: input.artifact_summaries,
      course_id: input.course_id,
      ended_at: input.ended_at,
      external_session_id: input.external_session_id,
      source_summary: input.source_summary,
      source_title: input.source_title,
      student_user_id: input.student_user_id,
      transcript_text: input.transcript_text,
    },
    {
      onConflict: "external_session_id",
    },
  );

  if (result.error) {
    throw result.error;
  }

  return {
    accepted: true,
  };
}

export async function recordStudentSessionProgress(
  supabase: SupabaseClient,
  input: RecordStudentSessionProgressInput,
) {
  const sessionResult = await supabase
    .from("student_session_summaries")
    .select(
      "course_id, exam_id, title, summary, entry_point, focus_topic, session_goal",
    )
    .eq("external_session_id", input.externalSessionId)
    .maybeSingle();

  if (sessionResult.error) {
    throw sessionResult.error;
  }

  const sessionRow = sessionResult.data as {
    course_id: string | null;
    exam_id: string | null;
    title: string;
    summary: string;
    entry_point: StudentSessionEntryPoint;
    focus_topic: string | null;
    session_goal: string | null;
  } | null;

  if (!sessionRow?.course_id) {
    throw new StudentAccessHttpError(
      404,
      "Course-backed session progress can only be recorded for a course-backed session.",
    );
  }

  await assertAuthorizedCourseAccess(supabase, sessionRow.course_id);

  const course = await getCourseWithDetail(supabase, sessionRow.course_id);
  const exam =
    sessionRow.exam_id && sessionRow.course_id
      ? toStudentCourseExam(
          await getAccessibleExamRow(supabase, sessionRow.course_id, sessionRow.exam_id),
        )
      : null;
  const courseBrain = getCourseBrainForCourse({
    courseSlug: course.slug,
    courseTitle: course.title,
    examTitle: exam?.title ?? null,
  });

  if (!courseBrain || input.checklistItems.length === 0) {
    return {
      accepted: true,
      checklistArtifact: null,
      conceptProgressSnapshot: [],
      mode: "noop",
      nextRecommendedConceptIds: [],
    };
  }

  const existingProgressSnapshot = await getStudentConceptProgressSnapshot(
    supabase,
    sessionRow.course_id,
  );
  const checklistArtifact = createSessionChecklistArtifact({
    checklistArtifactId: `checklist-${input.externalSessionId}`,
    courseBrain,
    createdAt: new Date(input.evaluatedAt),
    items: input.checklistItems,
  });
  const evaluation = evaluateSessionProgress({
    checklistArtifact,
    courseBrain,
    evaluatedAt: input.evaluatedAt,
    existingProgressSnapshot,
    quiz: input.quiz,
    sessionSummary: input.sessionSummary || sessionRow.summary || sessionRow.title,
    transcriptText: input.transcriptText,
    trigger: input.trigger,
    worksheet: input.worksheet,
  });

  const objectiveRows = evaluation.checklistArtifact.items.map((item) => ({
    external_session_id: input.externalSessionId,
    student_user_id: input.studentUserId,
    course_id: sessionRow.course_id,
    exam_id: sessionRow.exam_id,
    concept_id: item.conceptId,
    label: item.label,
    bloom_target: item.bloomLevel,
    success_criteria: item.successCriteria,
    status: item.status,
    evidence_note: item.evidenceNote,
  }));

  const conceptProgressRows = evaluation.conceptProgressSnapshot.map((progress) => ({
    student_user_id: input.studentUserId,
    course_id: sessionRow.course_id,
    exam_id: sessionRow.exam_id,
    concept_id: progress.conceptId,
    concept_name: progress.conceptName,
    highest_demonstrated_bloom_level: progress.highestDemonstratedBloomLevel,
    status: progress.status,
    confidence_signal: progress.confidenceSignal,
    misconception_summary: progress.misconceptionSummary,
    evidence_count: progress.evidenceCount,
    last_demonstrated_at: progress.lastDemonstratedAt,
    evidence_summary: progress.evidenceSummary,
  }));

  const evidenceRows = evaluation.learningEvidence.map((entry) => ({
    external_session_id: input.externalSessionId,
    student_user_id: input.studentUserId,
    course_id: sessionRow.course_id,
    exam_id: sessionRow.exam_id,
    concept_id: entry.conceptId,
    source_type: entry.sourceType,
    excerpt: entry.excerpt,
    score: entry.score,
  }));

  try {
    if (objectiveRows.length > 0) {
      const objectivesResult = await supabase
        .from("student_session_objectives")
        .upsert(objectiveRows, {
          onConflict: "external_session_id,concept_id,bloom_target",
        });

      if (objectivesResult.error) {
        throw objectivesResult.error;
      }
    }

    if (conceptProgressRows.length > 0) {
      const conceptResult = await supabase.from("student_concept_progress").upsert(
        conceptProgressRows,
        {
          onConflict: "student_user_id,course_id,concept_id",
        },
      );

      if (conceptResult.error) {
        throw conceptResult.error;
      }
    }

    const deleteEvidenceResult = await supabase
      .from("student_session_learning_evidence")
      .delete()
      .eq("external_session_id", input.externalSessionId);

    if (deleteEvidenceResult.error && !isMissingCourseProgressRelationError(deleteEvidenceResult.error)) {
      throw deleteEvidenceResult.error;
    }

    if (evidenceRows.length > 0) {
      const evidenceResult = await supabase
        .from("student_session_learning_evidence")
        .insert(evidenceRows);

      if (evidenceResult.error) {
        throw evidenceResult.error;
      }
    }
  } catch (error) {
    if (isMissingCourseProgressRelationError(error)) {
      return {
        accepted: true,
        checklistArtifact: evaluation.checklistArtifact,
        conceptProgressSnapshot: evaluation.conceptProgressSnapshot,
        mode: "fallback",
        nextRecommendedConceptIds: evaluation.nextRecommendedConceptIds,
        misconceptionsFound: evaluation.misconceptionsFound,
      };
    }

    throw error;
  }

  try {
    const memorySettings = await getStudentMemorySettings(supabase, input.studentUserId);
    await syncStudyEpisodeMemory({
      courseBrain,
      evaluation,
      materialsTouched: input.materialsTouched,
      sessionGoal: sessionRow.session_goal ?? "",
      sessionId: input.externalSessionId,
      settings: memorySettings,
      studentId: input.studentUserId,
      courseId: sessionRow.course_id,
      examId: sessionRow.exam_id,
      supabase,
      trigger: input.trigger,
      wroteAt: input.evaluatedAt,
    });
  } catch (error) {
    console.error("Failed to sync student memory:", error);
  }

  return {
    accepted: true,
    checklistArtifact: evaluation.checklistArtifact,
    conceptProgressSnapshot: evaluation.conceptProgressSnapshot,
    nextRecommendedConceptIds: evaluation.nextRecommendedConceptIds,
    misconceptionsFound: evaluation.misconceptionsFound,
  };
}

export async function listStudentCalendarDays(
  supabase: SupabaseClient,
  options: {
    courseId?: string;
    month: string;
    timeZone: string;
  },
) {
  if (options.courseId) {
    await assertAuthorizedCourseAccess(supabase, options.courseId);
  }

  const range = getMonthUtcRange(options.month, options.timeZone);
  let query = supabase
    .from("student_session_summaries")
    .select("last_activity_at, course_id")
    .gte("last_activity_at", toIsoString(range.start))
    .lt("last_activity_at", toIsoString(range.end));

  if (options.courseId) {
    query = query.eq("course_id", options.courseId);
  }

  const result = await query;

  if (result.error) {
    throw result.error;
  }

  const dayCounts = new Map<string, number>();

  for (const row of (result.data ?? []) as SessionAggregateRow[]) {
    const localDay = formatDateInTimeZone(new Date(row.last_activity_at), options.timeZone);
    dayCounts.set(localDay, (dayCounts.get(localDay) ?? 0) + 1);
  }

  return Array.from(dayCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, sessionCount]) => ({
      day,
      sessionCount,
    }));
}

export async function listStudentSessions(
  supabase: SupabaseClient,
  options: {
    courseId?: string;
    cursor?: string;
    day?: string;
    limit: number;
    timeZone?: string;
  },
) {
  if (options.courseId) {
    await assertAuthorizedCourseAccess(supabase, options.courseId);
  }

  const safeOffset = decodeCursor(options.cursor);

  let query = supabase
    .from("student_session_summaries")
    .select(
      "external_session_id, title, summary, status, course_id, exam_id, entry_point, focus_topic, session_goal, artifact_count, event_count, started_at, ended_at, last_activity_at",
    )
    .order("last_activity_at", { ascending: false })
    .order("external_session_id", { ascending: false })
    .range(safeOffset, safeOffset + options.limit);

  if (options.courseId) {
    query = query.eq("course_id", options.courseId);
  }

  if (options.day && options.timeZone) {
    const range = getLocalDayUtcRange(options.day, options.timeZone);
    query = query
      .gte("last_activity_at", toIsoString(range.start))
      .lt("last_activity_at", toIsoString(range.end));
  }

  const result = await query;

  if (result.error) {
    throw result.error;
  }

  const rows = (result.data as SessionSummaryRow[]) ?? [];
  const hasMore = rows.length > options.limit;
  const pageRows = hasMore ? rows.slice(0, options.limit) : rows;
  const courseIds = Array.from(
    new Set(
      pageRows.map((row) => row.course_id).filter((value): value is string => typeof value === "string"),
    ),
  );
  const courses = courseIds.length ? await getAccessibleCourses(supabase) : [];
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const examIds = Array.from(
    new Set(
      pageRows.map((row) => row.exam_id).filter((value): value is string => typeof value === "string"),
    ),
  );
  const examResult = examIds.length
    ? await supabase
        .from("course_exams")
        .select(
          "id, course_id, slug, title, exam_kind, scheduled_for, scope_summary, focus_topics, status",
        )
        .in("id", examIds)
        .eq("status", "active")
    : { data: [], error: null };

  if (examResult.error) {
    throw examResult.error;
  }

  const examMap = new Map(
    ((examResult.data ?? []) as CourseExamRow[]).map((exam) => [exam.id, exam]),
  );
  const onboardingMap = await getOnboardingRows(
    supabase,
    courseIds,
    Array.from(examMap.keys()),
  );

  return {
    nextCursor: hasMore ? encodeCursor(safeOffset + options.limit) : null,
    sessions: pageRows.map((row) => {
      const courseRow = row.course_id ? courseMap.get(row.course_id) ?? null : null;
      const examRow = row.exam_id ? examMap.get(row.exam_id) ?? null : null;
      const onboardingRow =
        courseRow && examRow
          ? onboardingMap.get(`${courseRow.id}:${examRow.id}`) ?? null
          : null;
      const course = courseRow
        ? buildCourseFromRow({
            row: courseRow,
            exam: examRow,
            onboarding: onboardingRow,
          })
        : null;

      return mapSessionRowToStudentSession({
        course,
        exam: toStudentCourseExam(examRow),
        onboarding: toStudentOnboardingState(onboardingRow),
        row,
      });
    }),
  };
}

export async function upsertStudentSessionSummary(
  supabase: SupabaseClient,
  externalSessionId: string,
  input: UpsertStudentSessionInput,
) {
  const existingResult = await supabase
    .from("student_session_summaries")
    .select("course_id, exam_id, entry_point, focus_topic, session_goal")
    .eq("external_session_id", externalSessionId)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existing = existingResult.data as {
    course_id: string | null;
    exam_id: string | null;
    entry_point: StudentSessionEntryPoint;
    focus_topic: string | null;
    session_goal: string | null;
  } | null;

  const courseId = input.courseId ?? existing?.course_id ?? null;
  const examId = input.examId ?? existing?.exam_id ?? null;
  const entryPoint = input.entryPoint ?? existing?.entry_point ?? "manual";
  const focusTopic = input.focusTopic ?? existing?.focus_topic ?? null;
  const sessionGoal = input.sessionGoal ?? existing?.session_goal ?? "";

  if (courseId) {
    await assertAuthorizedCourseAccess(supabase, courseId);
  }

  if (courseId && examId) {
    await getAccessibleExamRow(supabase, courseId, examId);
  }

  const result = await supabase
    .from("student_session_summaries")
    .upsert(
      {
        artifact_count: input.artifactCount,
        course_id: courseId,
        ended_at: input.endedAt,
        entry_point: entryPoint,
        event_count: input.eventCount,
        exam_id: examId,
        external_session_id: externalSessionId,
        focus_topic: focusTopic,
        last_activity_at: input.lastActivityAt,
        session_goal: sessionGoal,
        started_at: input.startedAt,
        status: input.status,
        student_user_id: input.studentUserId,
        summary: input.summary,
        title: input.title,
      },
      {
        onConflict: "external_session_id",
      },
    )
    .select(
      "external_session_id, title, summary, status, course_id, exam_id, entry_point, focus_topic, session_goal, artifact_count, event_count, started_at, ended_at, last_activity_at",
    )
    .single();

  if (result.error) {
    if (result.error.code === "42501" || result.error.code === "23505") {
      throw new StudentAccessHttpError(403, "You do not have access to that session.");
    }

    throw result.error;
  }

  const row = result.data as SessionSummaryRow;
  const course = row.course_id ? await getCourseWithDetail(supabase, row.course_id) : null;
  const exam =
    row.course_id && row.exam_id
      ? toStudentCourseExam(await getAccessibleExamRow(supabase, row.course_id, row.exam_id))
      : null;

  return mapSessionRowToStudentSession({
    course,
    exam,
    onboarding: course?.onboarding ?? null,
    row,
  });
}

export async function deleteStudentSessionSummary(
  supabase: SupabaseClient,
  externalSessionId: string,
) {
  const result = await supabase
    .from("student_session_summaries")
    .delete()
    .eq("external_session_id", externalSessionId)
    .select("external_session_id")
    .maybeSingle();

  if (result.error) {
    if (result.error.code === "42501") {
      throw new StudentAccessHttpError(403, "You do not have access to that session.");
    }

    throw result.error;
  }
}
