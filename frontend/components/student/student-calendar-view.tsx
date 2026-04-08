"use client";

import Link from "next/link";
import { useState } from "react";

import { useStudentApp } from "@/components/student/student-app-provider";
import { StudentCalendarGrid } from "@/components/student/student-calendar-grid";
import { StudentPageFrame } from "@/components/student/student-page-frame";
import { StudentSessionCard } from "@/components/student/student-session-card";
import { StudentStatCard } from "@/components/student/student-stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentData } from "@/hooks/use-student-data";
import {
  formatDayLabel,
  formatMonthLabel,
  getLocalDayKey,
  getMonthKey,
  pluralize,
  shiftMonthKey,
} from "@/lib/student-app/presentation";
import { cn } from "@/lib/utils";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-md bg-[var(--m3-primary)] px-4 py-3 text-sm font-semibold text-[var(--m3-on-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--m3-primary)_92%,black)]";

const chipClassName =
  "rounded-md border px-4 py-2 text-sm font-medium transition-colors";

interface StudentCalendarViewProps {
  initialCourseId?: string | null;
  initialDay?: string | null;
}

export function StudentCalendarView({
  initialCourseId = null,
  initialDay = null,
}: StudentCalendarViewProps) {
  const { courses, openSession } = useStudentApp();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    if (initialDay) {
      return initialDay.slice(0, 7);
    }

    return getMonthKey(new Date());
  });
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const { calendarDays, error, loading, sessions } = useStudentData({
    courseId: selectedCourseId,
    day: selectedDay,
    includeCalendar: true,
    month: visibleMonth,
  });
  const startSessionHref = selectedCourse
    ? `/sessions/new?title=${encodeURIComponent(selectedCourse.title)}`
    : "/sessions/new";

  return (
    <StudentPageFrame
      actions={
        <Link href={startSessionHref} className={primaryButtonClassName}>
          Start from this view
        </Link>
      }
      description="Review study activity by month. Filter by course, choose a day, and reopen the exact tutoring session from that date."
      eyebrow="Study Calendar"
      title="Study Calendar"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <StudentStatCard label="Month in view" value={formatMonthLabel(visibleMonth)} />
        <StudentStatCard
          label="Active days"
          tone="highlight"
          value={String(calendarDays.length)}
        />
      </div>

      <section className="rounded-md border border-[var(--m3-outline-variant)] bg-white p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCourseId(null)}
            className={cn(
              chipClassName,
              selectedCourseId === null
                ? "border-[var(--m3-primary)] bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]"
                : "border-[var(--m3-outline-variant)] bg-[#fbfbf8] text-[var(--m3-on-surface-variant)]",
            )}
          >
            All courses
          </button>

          {courses.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => setSelectedCourseId(course.id)}
              className={cn(
                chipClassName,
                selectedCourseId === course.id
                  ? "border-[var(--m3-primary)] bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]"
                  : "border-[var(--m3-outline-variant)] bg-[#fbfbf8] text-[var(--m3-on-surface-variant)]",
              )}
            >
              {course.title}
            </button>
          ))}

          {selectedDay ? (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-4 py-2 text-sm font-semibold text-[var(--m3-on-surface)]"
            >
              Clear {formatDayLabel(selectedDay)}
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <StudentCalendarGrid
          days={calendarDays}
          loading={loading}
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

        <div className="rounded-md border border-[var(--m3-outline-variant)] bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
            {selectedDay ? "Selected day" : "Current month"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--m3-on-surface)]">
            {selectedDay
              ? formatDayLabel(selectedDay)
              : `${pluralize(calendarDays.length, "active day")} in ${formatMonthLabel(visibleMonth)}`}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--m3-on-surface-variant)]">
            {selectedDay
              ? "Open a session from this day to jump directly back into the tutoring workspace."
              : "Select any highlighted day to see the sessions that landed there."}
          </p>

          {error ? (
            <div className="mt-5 rounded-md border border-[#fecaca] bg-[#fff7ed] px-4 py-3 text-sm text-[#7c2d12]">
              {error}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {loading ? (
              <>
                <div className="h-32 animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
                <div className="h-32 animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
              </>
            ) : sessions.length > 0 ? (
              sessions.map((session) => (
                <StudentSessionCard
                  key={session.externalSessionId}
                  onOpen={openSession}
                  session={session}
                  showCourse={selectedCourseId === null}
                />
              ))
            ) : (
              <EmptyState
                title="No sessions in this slice"
                description={
                  selectedDay
                    ? "Choose another active day or clear the day filter."
                    : "This month does not have any recorded study activity yet."
                }
              />
            )}
          </div>
        </div>
      </section>
    </StudentPageFrame>
  );
}
