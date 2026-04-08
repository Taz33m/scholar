"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useStudentApp } from "@/components/student/student-app-provider";
import { StudentCalendarGrid } from "@/components/student/student-calendar-grid";
import { StudentKnowledgeGraph } from "@/components/student/student-knowledge-graph";
import { StudentPageFrame } from "@/components/student/student-page-frame";
import { StudentSessionCard } from "@/components/student/student-session-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentData } from "@/hooks/use-student-data";
import { useStudentGraph } from "@/hooks/use-student-graph";
import {
  formatDayLabel,
  getLocalDayKey,
  getMonthKey,
  shiftMonthKey,
} from "@/lib/student-app/presentation";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-md bg-[var(--m3-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--m3-on-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--m3-primary)_92%,black)]";

interface StudentCourseHomeViewProps {
  courseId: string;
}

export function StudentCourseHomeView({ courseId }: StudentCourseHomeViewProps) {
  const { courses, openSession, setCurrentCourse, startSession } = useStudentApp();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => getMonthKey(new Date()));
  const course = useMemo(
    () => courses.find((entry) => entry.id === courseId) ?? null,
    [courseId, courses],
  );
  const {
    calendarDays,
    error: calendarError,
    loading: calendarLoading,
    sessions,
  } = useStudentData({
    courseId,
    day: selectedDay,
    includeCalendar: true,
    includeSessions: true,
    limit: 8,
    month: visibleMonth,
  });
  const { error: graphError, graph, loading: graphLoading } = useStudentGraph(courseId);
  const newSessionHref = course?.title
    ? `/sessions/new?title=${encodeURIComponent(course.title)}`
    : "/sessions/new";

  useEffect(() => {
    if (course) {
      setCurrentCourse(course.id);
    }
  }, [course, setCurrentCourse]);

  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        description="Choose one of your assigned courses to open its dashboard."
        action={
          <Link href="/student" className={primaryButtonClassName}>
            View courses
          </Link>
        }
      />
    );
  }

  return (
    <StudentPageFrame
      title={course.title}
      description={course.description ?? "Course activity, upcoming study days, and concept progress."}
      actions={
        <Link
          href={newSessionHref}
          onClick={(event) => {
            event.preventDefault();
            startSession(course.title);
          }}
          className={primaryButtonClassName}
        >
          New session
        </Link>
      }
    >
      {course.courseCode || course.meetingPattern ? (
        <div className="flex flex-wrap gap-2 text-xs text-[var(--m3-on-surface-variant)]">
          {course.courseCode ? (
            <span className="rounded-md border border-[var(--m3-outline-variant)] bg-white px-2.5 py-1">
              {course.courseCode}
            </span>
          ) : null}
          {course.meetingPattern ? (
            <span className="rounded-md border border-[var(--m3-outline-variant)] bg-white px-2.5 py-1">
              {course.meetingPattern}
            </span>
          ) : null}
        </div>
      ) : null}

      <StudentCalendarGrid
        days={calendarDays}
        loading={calendarLoading}
        month={visibleMonth}
        onMonthChange={(direction) => {
          setVisibleMonth((current) => shiftMonthKey(current, direction));
          setSelectedDay(null);
        }}
        onSelectDay={(day) => {
          setSelectedDay((current) => (current === day ? null : day));
        }}
        selectedDay={selectedDay}
        todayKey={getLocalDayKey(new Date())}
      />

      {calendarError ? (
        <div className="rounded-md border border-[#fecaca] bg-[#fff7ed] px-4 py-3 text-sm text-[#7c2d12]">
          {calendarError}
        </div>
      ) : null}

      <StudentKnowledgeGraph
        course={course}
        error={graphError}
        graph={graph}
        loading={graphLoading}
        onStartConceptSession={(node) => startSession(course.title, node.conceptName)}
      />

      <section className="rounded-md border border-[var(--m3-outline-variant)] bg-white">
        <div className="border-b border-[var(--m3-outline-variant)] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
                Session history
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--m3-on-surface)]">
                {selectedDay ? `Sessions from ${formatDayLabel(selectedDay)}` : "Recent course sessions"}
              </h2>
            </div>
            {selectedDay ? (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="inline-flex items-center justify-center rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-3 py-2 text-sm font-medium text-[var(--m3-on-surface)] transition-colors hover:bg-[var(--m3-surface-container-low)]"
              >
                Clear day filter
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 p-5">
          {calendarLoading ? (
            <>
              <div className="h-28 animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
              <div className="h-28 animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
            </>
          ) : sessions.length > 0 ? (
            sessions.map((session) => (
              <StudentSessionCard
                key={session.externalSessionId}
                onOpen={openSession}
                session={session}
              />
            ))
          ) : (
            <EmptyState
              title={selectedDay ? "No sessions on this day" : "No sessions yet"}
              description={
                selectedDay
                  ? "Pick another highlighted day or clear the filter."
                  : "Once tutoring starts in this course, the session history will show here."
              }
            />
          )}
        </div>
      </section>
    </StudentPageFrame>
  );
}
