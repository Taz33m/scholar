import type { SupabaseClient } from "@supabase/supabase-js";

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
  StudentGraphEdge,
  StudentGraphNode,
  StudentGraphResponse,
} from "@/lib/student-app/types";
import { formatDateInTimeZone, getLocalDayUtcRange, getMonthUtcRange } from "@/lib/student-access/timezone";

type CourseRow = {
  id: string;
  title: string;
  color_token: string | null;
};

type SessionSummaryRow = {
  external_session_id: string;
  title: string;
  summary: string;
  status: "active" | "ended";
  course_id: string | null;
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

type GraphNodeRow = {
  concept_name: string;
  course_id: string;
  evidence_count: number | null;
  evidence_summary: string | null;
  id: string;
  last_studied_at: string | null;
  mastery_score: number | null;
  position_x: number | null;
  position_y: number | null;
};

type GraphEdgeRow = {
  id: string;
  source_node_id: string;
  strength: number | null;
  target_node_id: string;
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

type UpsertStudentSessionInput = {
  artifactCount: number;
  courseId: string | null;
  endedAt: string | null;
  eventCount: number;
  lastActivityAt: string;
  startedAt: string;
  status: "active" | "ended";
  studentUserId: string;
  summary: string;
  title: string;
};

function toIsoString(date: Date) {
  return date.toISOString();
}

async function getAccessibleCourses(supabase: SupabaseClient) {
  const courseResult = await supabase
    .from("courses")
    .select("id, title, color_token")
    .eq("is_active", true)
    .order("title", { ascending: true });

  if (courseResult.error) {
    throw courseResult.error;
  }

  return courseResult.data as CourseRow[];
}

export async function listStudentCourses(supabase: SupabaseClient) {
  const courses = await getAccessibleCourses(supabase);

  if (courses.length === 0) {
    return [];
  }

  const aggregateResult = await supabase
    .from("student_session_summaries")
    .select("course_id, last_activity_at")
    .in(
      "course_id",
      courses.map((course) => course.id),
    );

  if (aggregateResult.error) {
    throw aggregateResult.error;
  }

  const aggregates = new Map<string, { lastActivityAt: string | null; sessionCount: number }>();

  for (const course of courses) {
    aggregates.set(course.id, { lastActivityAt: null, sessionCount: 0 });
  }

  for (const row of aggregateResult.data as SessionAggregateRow[]) {
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

  return courses.map((course) => {
    const aggregate = aggregates.get(course.id);

    return {
      colorToken: course.color_token,
      courseCode: null,
      description: null,
      id: course.id,
      lastActivityAt: aggregate?.lastActivityAt ?? null,
      meetingPattern: null,
      sessionCount: aggregate?.sessionCount ?? 0,
      title: course.title,
    };
  });
}

export async function getStudentGraph(
  supabase: SupabaseClient,
  courseId: string,
): Promise<StudentGraphResponse> {
  await assertAuthorizedCourseAccess(supabase, courseId);

  const [courseResult, nodeResult, edgeResult] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, color_token")
      .eq("id", courseId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("student_concept_nodes")
      .select(
        "id, course_id, concept_name, mastery_score, evidence_count, last_studied_at, evidence_summary, position_x, position_y",
      )
      .eq("course_id", courseId)
      .order("concept_name", { ascending: true }),
    supabase
      .from("student_concept_edges")
      .select("id, source_node_id, target_node_id, strength")
      .eq("course_id", courseId),
  ]);

  if (courseResult.error) {
    throw courseResult.error;
  }

  if (nodeResult.error) {
    throw nodeResult.error;
  }

  if (edgeResult.error) {
    throw edgeResult.error;
  }

  const course = courseResult.data
    ? {
        colorToken: courseResult.data.color_token,
        courseCode: null,
        description: null,
        id: courseResult.data.id,
        lastActivityAt: null,
        meetingPattern: null,
        sessionCount: 0,
        title: courseResult.data.title,
      }
    : null;
  const nodeRows = (nodeResult.data as GraphNodeRow[]) ?? [];
  const nodes = nodeRows.map((row, index): StudentGraphNode => {
    const fallback = getFallbackGraphPosition(index, nodeRows.length);
    const masteryScore = Math.max(
      0,
      Math.min(100, Math.round(row.mastery_score ?? 0)),
    );

    return {
      conceptName: row.concept_name,
      evidenceCount: row.evidence_count ?? 0,
      evidenceSummary: row.evidence_summary ?? null,
      id: row.id,
      lastStudiedAt: row.last_studied_at,
      masteryScore,
      masteryTier: deriveStudentGraphTier(masteryScore),
      x: row.position_x ?? fallback.x,
      y: row.position_y ?? fallback.y,
    };
  });
  const edges = ((edgeResult.data as GraphEdgeRow[]) ?? []).map(
    (row): StudentGraphEdge => ({
      id: row.id,
      source: row.source_node_id,
      strength: Math.max(0, Math.min(1, row.strength ?? 0.5)),
      target: row.target_node_id,
    }),
  );
  const lastUpdatedAt = nodes
    .map((node) => node.lastStudiedAt)
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

  for (const row of result.data as SessionAggregateRow[]) {
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
      "external_session_id, title, summary, status, course_id, artifact_count, event_count, started_at, ended_at, last_activity_at",
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
      pageRows
        .map((row) => row.course_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );
  const courses = courseIds.length
    ? await supabase
        .from("courses")
        .select("id, title")
        .in("id", courseIds)
        .eq("is_active", true)
    : { data: [], error: null };

  if (courses.error) {
    throw courses.error;
  }

  const courseMap = new Map(
    (courses.data ?? []).map((course) => [course.id, course.title]),
  );

  return {
    nextCursor: hasMore ? encodeCursor(safeOffset + options.limit) : null,
    sessions: pageRows.map((row) => {
      const courseTitle = row.course_id ? courseMap.get(row.course_id) ?? null : null;

      return {
        artifactCount: row.artifact_count,
        courseId: courseTitle ? row.course_id : null,
        courseTitle,
        endedAt: row.ended_at,
        eventCount: row.event_count,
        externalSessionId: row.external_session_id,
        lastActivityAt: row.last_activity_at,
        startedAt: row.started_at,
        status: row.status,
        summary: row.summary,
        title: row.title,
      };
    }),
  };
}

export async function upsertStudentSessionSummary(
  supabase: SupabaseClient,
  externalSessionId: string,
  input: UpsertStudentSessionInput,
) {
  if (input.courseId) {
    await assertAuthorizedCourseAccess(supabase, input.courseId);
  }

  const result = await supabase
    .from("student_session_summaries")
    .upsert(
      {
        artifact_count: input.artifactCount,
        course_id: input.courseId,
        ended_at: input.endedAt,
        event_count: input.eventCount,
        external_session_id: externalSessionId,
        last_activity_at: input.lastActivityAt,
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
      "external_session_id, title, summary, status, course_id, artifact_count, event_count, started_at, ended_at, last_activity_at",
    )
    .single();

  if (result.error) {
    if (result.error.code === "42501" || result.error.code === "23505") {
      throw new StudentAccessHttpError(403, "You do not have access to that session.");
    }

    throw result.error;
  }

  const row = result.data as SessionSummaryRow;
  let courseTitle: string | null = null;

  if (row.course_id) {
    const courseResult = await supabase
      .from("courses")
      .select("title")
      .eq("id", row.course_id)
      .eq("is_active", true)
      .maybeSingle();

    if (courseResult.error) {
      throw courseResult.error;
    }

    courseTitle = courseResult.data?.title ?? null;
  }

  return {
    artifactCount: row.artifact_count,
    courseId: courseTitle ? row.course_id : null,
    courseTitle,
    endedAt: row.ended_at,
    eventCount: row.event_count,
    externalSessionId: row.external_session_id,
    lastActivityAt: row.last_activity_at,
    startedAt: row.started_at,
    status: row.status,
    summary: row.summary,
    title: row.title,
  };
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
