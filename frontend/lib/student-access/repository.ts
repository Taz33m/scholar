import type { SupabaseClient } from "@supabase/supabase-js";

import { decodeCursor, encodeCursor } from "@/lib/student-access/cursor";
import { assertAuthorizedCourseAccess } from "@/lib/student-access/context";
import { StudentAccessHttpError } from "@/lib/student-access/http";
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
      id: course.id,
      lastActivityAt: aggregate?.lastActivityAt ?? null,
      sessionCount: aggregate?.sessionCount ?? 0,
      title: course.title,
    };
  });
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
