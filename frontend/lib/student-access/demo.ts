import type {
  StudentCourse,
  StudentCourseDetailResponse,
  StudentCourseOnboardingState,
  StudentGraphResponse,
  StudentSession,
  StudentUser,
} from "@/lib/student-app/types";
import { buildCourseConceptFallbackGraph } from "@/lib/student-access/course-concepts";
import demoData from "@/lib/student-access/demo-data.json";
import { encodeCursor } from "@/lib/student-access/cursor";
import { buildStudentGraphStats } from "@/lib/student-access/graph";
import { StudentAccessHttpError } from "@/lib/student-access/http";
import { formatDateInTimeZone } from "@/lib/student-access/timezone";
import type { StudentExamKind, StudentOnboardingStatus } from "@/types/study-context";

type DemoCourseRecord = {
  id: string;
  slug: string;
  title: string;
  courseCode: string | null;
  termLabel: string | null;
  colorToken: string | null;
  description: string | null;
  meetingPattern: string | null;
  timeZone: string;
  activeExam: {
    id: string;
    slug: string;
    title: string;
    examKind: StudentExamKind;
    scheduledFor: string | null;
    scopeSummary: string;
    focusTopics: string[];
  } | null;
  onboarding: {
    examId: string;
    status: StudentOnboardingStatus;
    confidenceLevel: number | null;
    selectedFocusTopics: string[];
    goalText: string;
    completedAt: string | null;
  } | null;
};

type DemoSessionRecord = {
  artifactCount: number;
  courseId: string;
  eventCount: number;
  externalSessionId: string;
  summary: string;
  title: string;
};

const DEMO_STUDENT_ID = "5e3dd6a8-d0fa-4cf8-b4f0-e0901110c421";
const DEMO_STUDENT = demoData.student;
const DEMO_COURSES = demoData.courses as DemoCourseRecord[];
const DEMO_SESSIONS = demoData.sessions as DemoSessionRecord[];
const DEMO_COURSE_MAP = new Map(DEMO_COURSES.map((course) => [course.id, course]));

function buildDemoSessions(): StudentSession[] {
  return DEMO_SESSIONS.map((session) => ({
    artifactCount: session.artifactCount,
    courseId: session.courseId,
    courseTitle: DEMO_COURSE_MAP.get(session.courseId)?.title ?? null,
    endedAt: null,
    entryPoint: "manual" as const,
    eventCount: session.eventCount,
    examId: null,
    examTitle: null,
    externalSessionId: session.externalSessionId,
    focusTopic: null,
    lastActivityAt: new Date().toISOString(),
    sessionGoal: "",
    startedAt: new Date().toISOString(),
    status: "ended" as const,
    studyContext: null,
    summary: session.summary,
    title: session.title,
  })).sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));
}

function ensureAuthorizedDemoCourse(courseId?: string) {
  if (!courseId) {
    return;
  }

  if (!DEMO_COURSE_MAP.has(courseId)) {
    throw new StudentAccessHttpError(403, "You do not have access to that course.");
  }
}

function getDemoCoursesFromSessions(sessions: StudentSession[]): StudentCourse[] {
  const aggregateMap = new Map<string, { lastActivityAt: string | null; sessionCount: number }>();

  for (const course of DEMO_COURSES) {
    aggregateMap.set(course.id, {
      lastActivityAt: null,
      sessionCount: 0,
    });
  }

  for (const session of sessions) {
    if (!session.courseId) {
      continue;
    }

    const aggregate = aggregateMap.get(session.courseId);
    if (!aggregate) {
      continue;
    }

    aggregate.sessionCount += 1;
    if (!aggregate.lastActivityAt || session.lastActivityAt > aggregate.lastActivityAt) {
      aggregate.lastActivityAt = session.lastActivityAt;
    }
  }

  return DEMO_COURSES.map((course) => {
    const aggregate = aggregateMap.get(course.id);

    return {
      activeExam: course.activeExam,
      colorToken: course.colorToken,
      courseCode: course.courseCode,
      description: course.description,
      id: course.id,
      lastActivityAt: aggregate?.lastActivityAt ?? null,
      meetingPattern: course.meetingPattern,
      onboarding: course.onboarding,
      onboardingStatus: course.onboarding?.status ?? "not_started",
      sessionCount: aggregate?.sessionCount ?? 0,
      slug: course.slug,
      termLabel: course.termLabel,
      timeZone: course.timeZone,
      title: course.title,
    };
  }).sort((left, right) => left.title.localeCompare(right.title));
}

export function getDemoStudentUser(): StudentUser {
  return {
    display_name: DEMO_STUDENT.displayName,
    email: DEMO_STUDENT.email,
    id: DEMO_STUDENT_ID,
    memorySettings: {
      memoryOptIn: false,
      memoryOptedInAt: null,
      memoryConsentVersion: null,
    },
  };
}

export function getDemoStudentCourses() {
  return getDemoCoursesFromSessions(buildDemoSessions());
}

export function getDemoCourseById(courseId: string) {
  return getDemoStudentCourses().find((course) => course.id === courseId) ?? null;
}

export function getDemoStudentCourseDetail(courseId: string): StudentCourseDetailResponse {
  const course = getDemoCourseById(courseId);

  if (!course) {
    throw new StudentAccessHttpError(404, "Course not found.");
  }

  return { course };
}

export function upsertDemoStudentCourseOnboarding(
  courseId: string,
  payload: StudentCourseOnboardingState,
) {
  const course = getDemoCourseById(courseId);

  if (!course) {
    throw new StudentAccessHttpError(404, "Course not found.");
  }

  return {
    ...payload,
    completedAt:
      payload.status === "completed"
        ? payload.completedAt ?? new Date().toISOString()
        : null,
  };
}

export function listDemoCalendarDays(options: {
  courseId?: string;
  month: string;
  timeZone: string;
}) {
  ensureAuthorizedDemoCourse(options.courseId);

  const sessions = buildDemoSessions().filter(
    (session) => !options.courseId || session.courseId === options.courseId,
  );
  const counts = new Map<string, number>();

  for (const session of sessions) {
    const localDay = formatDateInTimeZone(new Date(session.lastActivityAt), options.timeZone);

    if (!localDay.startsWith(`${options.month}-`)) {
      continue;
    }

    counts.set(localDay, (counts.get(localDay) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, sessionCount]) => ({
      day,
      sessionCount,
    }));
}

export function listDemoSessions(options: {
  courseId?: string;
  cursor?: string;
  day?: string;
  limit: number;
  timeZone?: string;
}) {
  ensureAuthorizedDemoCourse(options.courseId);

  const offset = options.cursor
    ? JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")).offset
    : 0;
  const normalizedOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  let sessions = buildDemoSessions().filter(
    (session) => !options.courseId || session.courseId === options.courseId,
  );

  if (options.day && options.timeZone) {
    const timeZone = options.timeZone;

    sessions = sessions.filter(
      (session) =>
        formatDateInTimeZone(new Date(session.lastActivityAt), timeZone) === options.day,
    );
  }

  const page = sessions.slice(normalizedOffset, normalizedOffset + options.limit);
  const nextOffset = normalizedOffset + options.limit;

  return {
    nextCursor: nextOffset < sessions.length ? encodeCursor(nextOffset) : null,
    sessions: page,
  };
}

export function getDemoStudentGraph(courseId: string): StudentGraphResponse {
  ensureAuthorizedDemoCourse(courseId);

  const course = getDemoCourseById(courseId);
  const fallbackGraph = course ? buildCourseConceptFallbackGraph(course) : null;

  if (fallbackGraph) {
    return fallbackGraph;
  }

  return {
    course: course ?? null,
    edges: [],
    lastUpdatedAt: null,
    nodes: [],
    recommendations: [],
    stats: buildStudentGraphStats([]),
  };
}

export function getDemoStudentHomeState() {
  return {
    courses: getDemoStudentCourses(),
    user: getDemoStudentUser(),
  };
}

export function getDemoSeedPayload() {
  return {
    courses: DEMO_COURSES,
    graphs: [],
    sessions: buildDemoSessions(),
    studentUser: getDemoStudentUser(),
  };
}
