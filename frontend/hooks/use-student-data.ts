"use client";

import { useEffect, useState } from "react";

import type {
  StudentCalendarDay,
  StudentSession,
  StudentSessionListResponse,
} from "@/lib/student-app/types";

interface StudentCalendarResponse {
  days: StudentCalendarDay[];
}

interface StudentErrorResponse {
  error?: string;
}

interface UseStudentDataOptions {
  courseId?: string | null;
  day?: string | null;
  includeCalendar?: boolean;
  includeSessions?: boolean;
  limit?: number;
  month?: string | null;
}

interface UseStudentDataResult {
  calendarDays: StudentCalendarDay[];
  error: string | null;
  loading: boolean;
  sessions: StudentSession[];
  timeZone: string | null;
}

const hasErrorMessage = (value: unknown): value is StudentErrorResponse =>
  value !== null &&
  typeof value === "object" &&
  "error" in value &&
  typeof (value as { error?: unknown }).error === "string";

const hasSessionList = (value: unknown): value is StudentSessionListResponse =>
  value !== null &&
  typeof value === "object" &&
  "sessions" in value &&
  Array.isArray((value as { sessions?: unknown }).sessions);

const hasCalendarDays = (value: unknown): value is StudentCalendarResponse =>
  value !== null &&
  typeof value === "object" &&
  "days" in value &&
  Array.isArray((value as { days?: unknown }).days);

export function useStudentData({
  courseId = null,
  day = null,
  includeCalendar = false,
  includeSessions = true,
  limit = 50,
  month = null,
}: UseStudentDataOptions): UseStudentDataResult {
  const [calendarDays, setCalendarDays] = useState<StudentCalendarDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  }, []);

  useEffect(() => {
    if (!timeZone) {
      return;
    }

    const resolvedTimeZone = timeZone;
    const controller = new AbortController();

    async function loadStudentData() {
      setLoading(true);
      setError(null);

      try {
        let sessionRequest: Promise<Response> | null = null;
        let calendarRequest: Promise<Response> | null = null;

        if (includeSessions) {
          const sessionUrl = new URL("/api/student/sessions", window.location.origin);
          sessionUrl.searchParams.set("limit", String(limit));

          if (courseId) {
            sessionUrl.searchParams.set("courseId", courseId);
          }

          if (day) {
            sessionUrl.searchParams.set("day", day);
            sessionUrl.searchParams.set("tz", resolvedTimeZone);
          }

          sessionRequest = fetch(sessionUrl.toString(), {
            credentials: "include",
            signal: controller.signal,
          });
        }

        if (includeCalendar && month) {
          const calendarUrl = new URL("/api/student/calendar", window.location.origin);
          calendarUrl.searchParams.set("month", month);
          calendarUrl.searchParams.set("tz", resolvedTimeZone);

          if (courseId) {
            calendarUrl.searchParams.set("courseId", courseId);
          }

          calendarRequest = fetch(calendarUrl.toString(), {
            credentials: "include",
            signal: controller.signal,
          });
        }

        const [sessionResponse, calendarResponse] = await Promise.all([
          sessionRequest,
          calendarRequest,
        ]);

        if (sessionResponse) {
          const sessionBody = (await sessionResponse.json().catch(() => null)) as
            | StudentSessionListResponse
            | StudentErrorResponse
            | null;

          if (!sessionResponse.ok) {
            throw new Error(
              hasErrorMessage(sessionBody)
                ? sessionBody.error
                : "Unable to load student sessions.",
            );
          }

          setSessions(hasSessionList(sessionBody) ? sessionBody.sessions : []);
        } else {
          setSessions([]);
        }

        if (calendarResponse) {
          const calendarBody = (await calendarResponse.json().catch(() => null)) as
            | StudentCalendarResponse
            | StudentErrorResponse
            | null;

          if (!calendarResponse.ok) {
            throw new Error(
              hasErrorMessage(calendarBody)
                ? calendarBody.error
                : "Unable to load study activity.",
            );
          }

          setCalendarDays(hasCalendarDays(calendarBody) ? calendarBody.days : []);
        } else {
          setCalendarDays([]);
        }
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Failed to load student data:", cause);
        setCalendarDays([]);
        setError(
          cause instanceof Error ? cause.message : "Unable to load the student workspace.",
        );
        setSessions([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadStudentData();

    return () => {
      controller.abort();
    };
  }, [courseId, day, includeCalendar, includeSessions, limit, month, timeZone]);

  return {
    calendarDays,
    error,
    loading,
    sessions,
    timeZone,
  };
}
