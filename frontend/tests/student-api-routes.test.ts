import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudentAccessHttpError } from "@/lib/student-access/http";

const {
  createSupabaseServerClientMock,
  deleteStudentSessionSummaryMock,
  getStudentGraphMock,
  isStudentAccessDemoModeEnabledMock,
  listStudentCalendarDaysMock,
  listStudentCoursesMock,
  listStudentSessionsMock,
  recordStudentGraphUpdateMock,
  requireStudentContextMock,
  upsertStudentSessionSummaryMock,
} = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(async () => ({})),
  deleteStudentSessionSummaryMock: vi.fn(),
  getStudentGraphMock: vi.fn(),
  isStudentAccessDemoModeEnabledMock: vi.fn(() => false),
  listStudentCalendarDaysMock: vi.fn(),
  listStudentCoursesMock: vi.fn(),
  listStudentSessionsMock: vi.fn(),
  recordStudentGraphUpdateMock: vi.fn(),
  requireStudentContextMock: vi.fn(),
  upsertStudentSessionSummaryMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/student-access/context", () => ({
  assertAuthorizedCourseAccess: vi.fn(),
  requireStudentContext: requireStudentContextMock,
}));

vi.mock("@/lib/student-access/demo-mode", () => ({
  isStudentAccessDemoModeEnabled: isStudentAccessDemoModeEnabledMock,
}));

vi.mock("@/lib/student-access/repository", () => ({
  deleteStudentSessionSummary: deleteStudentSessionSummaryMock,
  getStudentGraph: getStudentGraphMock,
  listStudentCalendarDays: listStudentCalendarDaysMock,
  listStudentCourses: listStudentCoursesMock,
  listStudentSessions: listStudentSessionsMock,
  recordStudentGraphUpdate: recordStudentGraphUpdateMock,
  upsertStudentSessionSummary: upsertStudentSessionSummaryMock,
}));

import { GET as calendarGet } from "@/app/api/student/calendar/route";
import { GET as coursesGet } from "@/app/api/student/courses/route";
import { GET as graphGet, POST as graphPost } from "@/app/api/student/graph/route";
import { GET as sessionsGet } from "@/app/api/student/sessions/route";
import {
  DELETE as sessionDelete,
  PUT as sessionPut,
} from "@/app/api/student/sessions/[externalSessionId]/route";

describe("student data routes", () => {
  beforeEach(() => {
    createSupabaseServerClientMock.mockClear();
    requireStudentContextMock.mockReset();
    isStudentAccessDemoModeEnabledMock.mockReset();
    listStudentCoursesMock.mockReset();
    listStudentCalendarDaysMock.mockReset();
    listStudentSessionsMock.mockReset();
    upsertStudentSessionSummaryMock.mockReset();
    deleteStudentSessionSummaryMock.mockReset();
    getStudentGraphMock.mockReset();
    recordStudentGraphUpdateMock.mockReset();

    isStudentAccessDemoModeEnabledMock.mockReturnValue(false);
    requireStudentContextMock.mockResolvedValue({
      user: {
        id: "student-1",
      },
    });
  });

  it("rejects unauthenticated course requests", async () => {
    requireStudentContextMock.mockRejectedValue(
      new StudentAccessHttpError(401, "Please sign in to continue."),
    );

    const response = await coursesGet();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Please sign in to continue.",
    });
  });

  it("validates calendar query input before touching Supabase", async () => {
    const response = await calendarGet(
      new Request("http://localhost/api/student/calendar?month=2026-04&tz=Not/AZone"),
    );

    expect(response.status).toBe(400);
    expect(requireStudentContextMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Please provide a valid IANA time zone.",
    });
  });

  it("returns session history with parsed filters", async () => {
    listStudentSessionsMock.mockResolvedValue({
      nextCursor: "next-cursor",
      sessions: [
        {
          courseId: null,
          courseTitle: null,
          externalSessionId: "session-1",
          title: "Linear algebra",
        },
      ],
    });

    const response = await sessionsGet(
      new Request(
        "http://localhost/api/student/sessions?day=2026-04-03&tz=America/New_York&limit=25",
      ),
    );

    expect(response.status).toBe(200);
    expect(listStudentSessionsMock).toHaveBeenCalledWith(
      {},
      {
        courseId: undefined,
        cursor: undefined,
        day: "2026-04-03",
        limit: 25,
        timeZone: "America/New_York",
      },
    );
    await expect(response.json()).resolves.toEqual({
      nextCursor: "next-cursor",
      sessions: [
        {
          courseId: null,
          courseTitle: null,
          externalSessionId: "session-1",
          title: "Linear algebra",
        },
      ],
    });
  });

  it("returns a course-scoped graph payload", async () => {
    getStudentGraphMock.mockResolvedValue({
      course: {
        id: "course-1",
        title: "Operating Systems",
      },
      edges: [],
      lastUpdatedAt: "2026-04-04T10:00:00.000Z",
      nodes: [],
      recommendations: [],
      stats: {
        conceptCount: 0,
        focusCount: 0,
        masteryAverage: 0,
        recentlyStudiedCount: 0,
      },
    });

    const response = await graphGet(
      new Request("http://localhost/api/student/graph?courseId=de305d54-75b4-431b-adb2-eb6b9e546014"),
    );

    expect(response.status).toBe(200);
    expect(getStudentGraphMock).toHaveBeenCalledWith(
      {},
      "de305d54-75b4-431b-adb2-eb6b9e546014",
    );
  });

  it("records graph ingestion payloads for completed sessions", async () => {
    recordStudentGraphUpdateMock.mockResolvedValue({ accepted: true });

    const response = await graphPost(
      new Request("http://localhost/api/student/graph", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          artifacts: [
            {
              summary: "A worksheet on paging and replacement.",
              title: "Paging worksheet",
              type: "worksheet",
            },
          ],
          courseId: "de305d54-75b4-431b-adb2-eb6b9e546014",
          endedAt: "2026-04-03T15:30:00.000Z",
          externalSessionId: "session-graph-1",
          summary: "Reviewed paging and TLB misses.",
          title: "Virtual Memory Review",
          transcript: "We worked through paging, TLB hits, and replacement.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(recordStudentGraphUpdateMock).toHaveBeenCalledWith({}, {
      artifact_summaries: [
        {
          summary: "A worksheet on paging and replacement.",
          title: "Paging worksheet",
          type: "worksheet",
        },
      ],
      course_id: "de305d54-75b4-431b-adb2-eb6b9e546014",
      ended_at: "2026-04-03T15:30:00.000Z",
      external_session_id: "session-graph-1",
      source_summary: "Reviewed paging and TLB misses.",
      source_title: "Virtual Memory Review",
      student_user_id: "student-1",
      transcript_text: "We worked through paging, TLB hits, and replacement.",
    });
  });

  it("upserts student-owned session summaries", async () => {
    upsertStudentSessionSummaryMock.mockResolvedValue({
      externalSessionId: "session-1",
      title: "Biology review",
    });

    const response = await sessionPut(
      new Request("http://localhost/api/student/sessions/session-1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          artifactCount: 2,
          courseId: null,
          endedAt: null,
          eventCount: 5,
          lastActivityAt: "2026-04-03T15:30:00.000Z",
          startedAt: "2026-04-03T15:00:00.000Z",
          status: "active",
          summary: "Reviewed chapter 4",
          title: "Biology review",
        }),
      }),
      {
        params: Promise.resolve({ externalSessionId: "session-1" }),
      },
    );

    expect(upsertStudentSessionSummaryMock).toHaveBeenCalledWith({}, "session-1", {
      artifactCount: 2,
      courseId: null,
      endedAt: null,
      eventCount: 5,
      lastActivityAt: "2026-04-03T15:30:00.000Z",
      startedAt: "2026-04-03T15:00:00.000Z",
      status: "active",
      studentUserId: "student-1",
      summary: "Reviewed chapter 4",
      title: "Biology review",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: {
        externalSessionId: "session-1",
        title: "Biology review",
      },
    });
  });

  it("deletes student-owned session summaries", async () => {
    const response = await sessionDelete(
      new Request("http://localhost/api/student/sessions/session-1", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ externalSessionId: "session-1" }),
      },
    );

    expect(deleteStudentSessionSummaryMock).toHaveBeenCalledWith({}, "session-1");
    expect(response.status).toBe(204);
  });
});
