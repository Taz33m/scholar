import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudentAccessHttpError } from "@/lib/student-access/http";

const {
  createSupabaseServerClientMock,
  deleteStudentSessionSummaryMock,
  listStudentCalendarDaysMock,
  listStudentCoursesMock,
  listStudentSessionsMock,
  requireStudentContextMock,
  upsertStudentSessionSummaryMock,
} = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(async () => ({})),
  deleteStudentSessionSummaryMock: vi.fn(),
  listStudentCalendarDaysMock: vi.fn(),
  listStudentCoursesMock: vi.fn(),
  listStudentSessionsMock: vi.fn(),
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

vi.mock("@/lib/student-access/repository", () => ({
  deleteStudentSessionSummary: deleteStudentSessionSummaryMock,
  listStudentCalendarDays: listStudentCalendarDaysMock,
  listStudentCourses: listStudentCoursesMock,
  listStudentSessions: listStudentSessionsMock,
  upsertStudentSessionSummary: upsertStudentSessionSummaryMock,
}));

import { GET as calendarGet } from "@/app/api/student/calendar/route";
import { GET as coursesGet } from "@/app/api/student/courses/route";
import { GET as sessionsGet } from "@/app/api/student/sessions/route";
import {
  DELETE as sessionDelete,
  PUT as sessionPut,
} from "@/app/api/student/sessions/[externalSessionId]/route";

describe("student data routes", () => {
  beforeEach(() => {
    createSupabaseServerClientMock.mockClear();
    requireStudentContextMock.mockReset();
    listStudentCoursesMock.mockReset();
    listStudentCalendarDaysMock.mockReset();
    listStudentSessionsMock.mockReset();
    upsertStudentSessionSummaryMock.mockReset();
    deleteStudentSessionSummaryMock.mockReset();

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
