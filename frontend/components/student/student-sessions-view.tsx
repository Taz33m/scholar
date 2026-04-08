"use client";

import Link from "next/link";
import { useState } from "react";

import { useStudentApp } from "@/components/student/student-app-provider";
import { StudentPageFrame } from "@/components/student/student-page-frame";
import { StudentSessionCard } from "@/components/student/student-session-card";
import { StudentStatCard } from "@/components/student/student-stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentData } from "@/hooks/use-student-data";
import {
  countArtifacts,
  formatDayLabel,
} from "@/lib/student-app/presentation";
import { cn } from "@/lib/utils";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-md bg-[var(--m3-primary)] px-4 py-3 text-sm font-semibold text-[var(--m3-on-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--m3-primary)_92%,black)]";

const chipClassName =
  "rounded-md border px-4 py-2 text-sm font-medium transition-colors";

interface StudentSessionsViewProps {
  initialCourseId?: string | null;
  initialDay?: string | null;
}

export function StudentSessionsView({
  initialCourseId = null,
  initialDay = null,
}: StudentSessionsViewProps) {
  const { courses, openSession } = useStudentApp();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const startSessionHref = selectedCourse
    ? `/sessions/new?title=${encodeURIComponent(selectedCourse.title)}`
    : "/sessions/new";
  const { error, loading, sessions } = useStudentData({
    courseId: selectedCourseId,
    day: selectedDay,
    limit: 50,
  });

  return (
    <StudentPageFrame
      actions={
        <Link href={startSessionHref} className={primaryButtonClassName}>
          Start a new session
        </Link>
      }
      description="Review tutoring history, narrow by course when needed, and reopen any saved session."
      eyebrow="Session History"
      title="Session History"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StudentStatCard label="Visible sessions" value={String(sessions.length)} />
        <StudentStatCard
          label="Artifacts"
          tone="highlight"
          value={String(countArtifacts(sessions))}
        />
        <StudentStatCard
          label="Course filter"
          value={selectedCourse ? selectedCourse.title : "All"}
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

      {error ? (
        <div className="rounded-md border border-[#fecaca] bg-[#fff7ed] px-4 py-3 text-sm text-[#7c2d12]">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        {loading ? (
          <>
            <div className="h-32 animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
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
            title="No sessions match this view"
            description={
              selectedCourse || selectedDay
                ? "Try clearing one of the filters or start a new tutoring session."
                : "Tutoring history will appear here once sessions are recorded."
            }
            action={
              <Link href="/sessions/new" className={primaryButtonClassName}>
                Start tutoring
              </Link>
            }
          />
        )}
      </section>
    </StudentPageFrame>
  );
}
