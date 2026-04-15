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
  "inline-flex items-center justify-center rounded-md bg-[var(--m3-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--m3-on-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--m3-primary)_92%,black)] disabled:cursor-not-allowed disabled:opacity-60";

interface StudentCourseHomeViewProps {
  courseId: string;
}

export function StudentCourseHomeView({ courseId }: StudentCourseHomeViewProps) {
  const {
    courses,
    openSession,
    setCurrentCourse,
    setMemorySettings,
    startSession,
    user,
  } = useStudentApp();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => getMonthKey(new Date()));
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isSavingMemoryPreference, setIsSavingMemoryPreference] = useState(false);
  const [memoryPreferenceError, setMemoryPreferenceError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
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
  const activeExam = course?.activeExam ?? null;
  const calendarAnnotations = activeExam?.scheduledFor
    ? [
        {
          day: activeExam.scheduledFor.slice(0, 10),
          detail: "8:00 AM-9:50 AM",
          label: "Exam",
        },
      ]
    : [];

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

  const resolvedCourse = course;

  async function handleStartSession(focusTopic: string | null = null) {
    setSessionError(null);

    setIsStartingSession(true);

    try {
      await startSession({
        course: resolvedCourse,
        entryPoint: "course_home",
        focusTopic:
          focusTopic ??
          resolvedCourse.onboarding?.selectedFocusTopics[0] ??
          resolvedCourse.activeExam?.focusTopics[0] ??
          null,
        sessionGoal: resolvedCourse.onboarding?.goalText ?? "",
        title: resolvedCourse.title,
      });
    } catch (cause) {
      setSessionError(
        cause instanceof Error ? cause.message : "Unable to start this course session.",
      );
      setIsStartingSession(false);
    }
  }

  async function handleToggleMemoryPreference(enabled: boolean) {
    setMemoryPreferenceError(null);
    setIsSavingMemoryPreference(true);

    try {
      const response = await fetch("/api/student/memory-preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            settings?: typeof user.memorySettings;
          }
        | null;

      if (!response.ok || !payload?.settings) {
        throw new Error(
          payload?.error ?? "Unable to update memory-enhanced tutoring right now.",
        );
      }

      setMemorySettings(payload.settings);
    } catch (cause) {
      setMemoryPreferenceError(
        cause instanceof Error
          ? cause.message
          : "Unable to update memory-enhanced tutoring right now.",
      );
    } finally {
      setIsSavingMemoryPreference(false);
    }
  }

  return (
    <StudentPageFrame
      title={resolvedCourse.title}
      description={
        resolvedCourse.description ?? "Course activity, upcoming study days, and concept progress."
      }
      actions={
        <button
          type="button"
          onClick={() => void handleStartSession()}
          disabled={isStartingSession}
          className={primaryButtonClassName}
        >
          {isStartingSession ? "Starting session..." : "New session"}
        </button>
      }
    >
      {resolvedCourse.courseCode || resolvedCourse.meetingPattern ? (
        <div className="flex flex-wrap gap-2 text-xs text-[var(--m3-on-surface-variant)]">
          {resolvedCourse.courseCode ? (
            <span className="rounded-md border border-[var(--m3-outline-variant)] bg-white px-2.5 py-1">
              {resolvedCourse.courseCode}
            </span>
          ) : null}
          {resolvedCourse.meetingPattern ? (
            <span className="rounded-md border border-[var(--m3-outline-variant)] bg-white px-2.5 py-1">
              {resolvedCourse.meetingPattern}
            </span>
          ) : null}
        </div>
      ) : null}

      {sessionError ? (
        <div className="rounded-md border border-[#fecaca] bg-[#fff7ed] px-4 py-3 text-sm text-[#7c2d12]">
          {sessionError}
        </div>
      ) : null}

      <section className="rounded-md border border-[var(--m3-outline-variant)] bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
                Memory-enhanced tutoring beta
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--m3-on-surface)]">
                {user.memorySettings.memoryOptIn ? "Enabled" : "Optional"}
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-[var(--m3-on-surface-variant)]">
              If enabled, Scholar may send compact study summaries from quiz submissions,
              worksheet checkpoints, and session exits to an external memory service to
              personalize future sessions. It does not send raw transcripts, uploaded-file
              text, or course PDF text.
            </p>
            <p className="text-xs text-[var(--m3-on-surface-variant)]">
              {user.memorySettings.memoryOptIn
                ? `Consent version ${user.memorySettings.memoryConsentVersion ?? "unknown"} recorded ${user.memorySettings.memoryOptedInAt ? `on ${new Date(user.memorySettings.memoryOptedInAt).toLocaleString()}` : "for this account"}.`
                : "You can keep tutoring exactly as it works today and leave this off."}
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              disabled={isSavingMemoryPreference}
              onClick={() => void handleToggleMemoryPreference(!user.memorySettings.memoryOptIn)}
              className={user.memorySettings.memoryOptIn
                ? "inline-flex items-center justify-center rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-4 py-2.5 text-sm font-semibold text-[var(--m3-on-surface)] transition-colors hover:bg-[var(--m3-surface-container-low)] disabled:cursor-not-allowed disabled:opacity-60"
                : primaryButtonClassName}
            >
              {isSavingMemoryPreference
                ? "Saving..."
                : user.memorySettings.memoryOptIn
                  ? "Disable memory beta"
                  : "Enable memory beta"}
            </button>
          </div>
        </div>

        {memoryPreferenceError ? (
          <div className="mt-4 rounded-md border border-[#fecaca] bg-[#fff7ed] px-4 py-3 text-sm text-[#7c2d12]">
            {memoryPreferenceError}
          </div>
        ) : null}
      </section>

      <StudentCalendarGrid
        annotations={calendarAnnotations}
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
        course={resolvedCourse}
        error={graphError}
        graph={graph}
        loading={graphLoading}
        onStartConceptSession={(node) => void handleStartSession(node.conceptName)}
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
