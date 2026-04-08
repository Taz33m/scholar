import type {
  StudentCourse,
  StudentGraphEdge,
  StudentGraphNode,
  StudentGraphResponse,
  StudentSession,
  StudentUser,
} from "@/lib/student-app/types";
import demoData from "@/lib/student-access/demo-data.json";
import { encodeCursor } from "@/lib/student-access/cursor";
import {
  buildStudentGraphRecommendations,
  buildStudentGraphStats,
  deriveStudentGraphTier,
} from "@/lib/student-access/graph";
import { StudentAccessHttpError } from "@/lib/student-access/http";
import { formatDateInTimeZone } from "@/lib/student-access/timezone";

type DemoCourseRecord = (typeof demoData)["courses"][number];
type DemoGraphRecord = (typeof demoData)["graphs"][number];
type DemoGraphNodeRecord = DemoGraphRecord["nodes"][number];
type DemoSessionRecord = (typeof demoData)["sessions"][number];

const DEMO_STUDENT_ID = "5e3dd6a8-d0fa-4cf8-b4f0-e0901110c421";
const DEMO_STUDENT = demoData.student;
const DEMO_COURSES = demoData.courses satisfies DemoCourseRecord[];
const DEMO_GRAPHS = demoData.graphs satisfies DemoGraphRecord[];
const DEMO_SESSIONS = demoData.sessions satisfies DemoSessionRecord[];
const DEMO_COURSE_MAP = new Map(DEMO_COURSES.map((course) => [course.id, course]));
const DEMO_GRAPH_MAP = new Map(DEMO_GRAPHS.map((graph) => [graph.courseId, graph]));

function buildDemoTimestamp(relativeDaysAgo: number, hour: number, minute: number) {
  const timestamp = new Date();
  timestamp.setHours(hour, minute, 0, 0);
  timestamp.setDate(timestamp.getDate() - relativeDaysAgo);
  return timestamp;
}

function buildDemoSessions(): StudentSession[] {
  return DEMO_SESSIONS.map((session, index) => {
    const startedAt = buildDemoTimestamp(
      session.relativeDaysAgo,
      10 + (index % 3),
      0,
    );
    const lastActivityAt = new Date(startedAt);
    lastActivityAt.setMinutes(lastActivityAt.getMinutes() + 48 + index * 7);
    const course = DEMO_COURSE_MAP.get(session.courseId);

    return {
      artifactCount: session.artifactCount,
      courseId: course?.id ?? null,
      courseTitle: course?.title ?? null,
      endedAt: lastActivityAt.toISOString(),
      eventCount: session.eventCount,
      externalSessionId: session.externalSessionId,
      lastActivityAt: lastActivityAt.toISOString(),
      startedAt: startedAt.toISOString(),
      status: "ended" as const,
      summary: session.summary,
      title: session.title,
    };
  }).sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));
}

function buildDemoGraphNode(node: DemoGraphNodeRecord): StudentGraphNode {
  const timestamp = buildDemoTimestamp(node.relativeDaysAgo, 14, 15);

  return {
    conceptName: node.conceptName,
    evidenceCount: node.evidenceCount,
    evidenceSummary: node.evidenceSummary,
    id: node.id,
    lastStudiedAt: timestamp.toISOString(),
    masteryScore: node.masteryScore,
    masteryTier: deriveStudentGraphTier(node.masteryScore),
    x: node.x,
    y: node.y,
  };
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
  const aggregateMap = new Map<
    string,
    { lastActivityAt: string | null; sessionCount: number }
  >();

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
      colorToken: course.colorToken,
      courseCode: course.courseCode,
      description: course.description,
      id: course.id,
      lastActivityAt: aggregate?.lastActivityAt ?? null,
      meetingPattern: course.meetingPattern,
      sessionCount: aggregate?.sessionCount ?? 0,
      title: course.title,
    };
  }).sort((left, right) => left.title.localeCompare(right.title));
}

export function getDemoStudentUser(): StudentUser {
  return {
    display_name: DEMO_STUDENT.displayName,
    email: DEMO_STUDENT.email,
    id: DEMO_STUDENT_ID,
  };
}

export function getDemoStudentCourses() {
  return getDemoCoursesFromSessions(buildDemoSessions());
}

export function getDemoCourseById(courseId: string) {
  return getDemoStudentCourses().find((course) => course.id === courseId) ?? null;
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
    sessions = sessions.filter(
      (session) =>
        formatDateInTimeZone(new Date(session.lastActivityAt), options.timeZone!) ===
        options.day,
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
  const graphRecord = DEMO_GRAPH_MAP.get(courseId);

  if (!course || !graphRecord) {
    return {
      course: course ?? null,
      edges: [],
      lastUpdatedAt: null,
      nodes: [],
      recommendations: [],
      stats: buildStudentGraphStats([]),
    };
  }

  const nodes = graphRecord.nodes.map(buildDemoGraphNode);
  const edges = graphRecord.edges.map(
    (edge): StudentGraphEdge => ({
      id: edge.id,
      source: edge.source,
      strength: edge.strength,
      target: edge.target,
    }),
  );
  const lastUpdatedAt = buildDemoTimestamp(
    graphRecord.lastUpdatedRelativeDaysAgo,
    16,
    30,
  ).toISOString();

  return {
    course,
    edges,
    lastUpdatedAt,
    nodes,
    recommendations: buildStudentGraphRecommendations(nodes),
    stats: buildStudentGraphStats(nodes),
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
    graphs: DEMO_GRAPHS,
    sessions: buildDemoSessions(),
    studentUser: getDemoStudentUser(),
  };
}
