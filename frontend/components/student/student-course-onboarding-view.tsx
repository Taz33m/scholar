"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useStudentApp } from "@/components/student/student-app-provider";
import { StudentPageFrame } from "@/components/student/student-page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import type { StudentCourse, StudentCourseDetailResponse } from "@/lib/student-app/types";

const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-[var(--m3-outline-variant)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--m3-on-surface)] transition-colors hover:bg-[var(--m3-surface-container-low)]";
const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-md bg-[var(--m3-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--m3-on-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--m3-primary)_92%,black)] disabled:cursor-not-allowed disabled:opacity-60";

const CONFIDENCE_OPTIONS = [
  { helper: "Need heavy guidance", value: 1 },
  { helper: "Still pretty shaky", value: 2 },
  { helper: "Can follow, need reps", value: 3 },
  { helper: "Mostly there", value: 4 },
  { helper: "Want to sharpen edge cases", value: 5 },
] as const;

function formatExamDate(value: string | null) {
  if (!value) {
    return "Exam date coming soon";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
  }).format(new Date(value));
}

export function StudentCourseOnboardingView({
  courseId,
}: {
  courseId: string;
}) {
  const router = useRouter();
  const { courses, startSession } = useStudentApp();
  const fallbackCourse = useMemo(
    () => courses.find((entry) => entry.id === courseId) ?? null,
    [courseId, courses],
  );
  const [course, setCourse] = useState<StudentCourse | null>(fallbackCourse);
  const [confidenceLevel, setConfidenceLevel] = useState<number | null>(
    fallbackCourse?.onboarding?.confidenceLevel ?? null,
  );
  const [selectedFocusTopics, setSelectedFocusTopics] = useState<string[]>(
    fallbackCourse?.onboarding?.selectedFocusTopics ?? [],
  );
  const [goalText, setGoalText] = useState(fallbackCourse?.onboarding?.goalText ?? "");
  const [isLoading, setIsLoading] = useState(!fallbackCourse);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function loadCourseDetail() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/student/courses/${courseId}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | StudentCourseDetailResponse
          | { error?: string }
          | null;

        if (!response.ok || !payload || !("course" in payload)) {
          throw new Error(
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Unable to load course setup.",
          );
        }

        if (!isMounted) {
          return;
        }

        setCourse(payload.course);
        setConfidenceLevel(payload.course.onboarding?.confidenceLevel ?? null);
        setSelectedFocusTopics(payload.course.onboarding?.selectedFocusTopics ?? []);
        setGoalText(payload.course.onboarding?.goalText ?? "");
      } catch (cause) {
        if (!controller.signal.aborted && isMounted) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load course setup.",
          );
        }
      } finally {
        if (!controller.signal.aborted && isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCourseDetail();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [courseId]);

  const activeExam = course?.activeExam ?? null;

  function toggleFocusTopic(topic: string) {
    setSelectedFocusTopics((current) =>
      current.includes(topic)
        ? current.filter((entry) => entry !== topic)
        : [...current, topic],
    );
  }

  async function handleSubmit() {
    if (!course || !activeExam) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/student/courses/${course.id}/onboarding`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          confidenceLevel,
          examId: activeExam.id,
          goalText: goalText.trim(),
          selectedFocusTopics,
          status: "completed",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | { onboarding?: unknown }
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to save setup.",
        );
      }

      await startSession({
        course: {
          ...course,
          onboarding: {
            completedAt: new Date().toISOString(),
            confidenceLevel,
            examId: activeExam.id,
            goalText: goalText.trim(),
            selectedFocusTopics,
            status: "completed",
          },
          onboardingStatus: "completed",
        },
        entryPoint: "onboarding",
        focusTopic: selectedFocusTopics[0] ?? null,
        sessionGoal: goalText.trim(),
        title: course.title,
      });

      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start your first session.",
      );
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <StudentPageFrame
        title="Loading course setup"
        description="Preparing the course-backed session setup."
      >
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
          <div className="h-48 animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
        </div>
      </StudentPageFrame>
    );
  }

  if (!course || !activeExam) {
    return (
      <EmptyState
        title="Course setup unavailable"
        description="This course is not ready for exam-backed sessions yet."
        action={
          <Link href="/student" className={secondaryButtonClassName}>
            Back to courses
          </Link>
        }
      />
    );
  }

  return (
    <StudentPageFrame
      eyebrow={course.termLabel ?? "Closed Beta"}
      title={course.title}
      description="Finish the exam setup once, then the regular dashboard can launch grounded sessions from the current exam."
      actions={
        <Link href={`/student/course/${course.id}`} className={secondaryButtonClassName}>
          Back to course
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

      <section className="rounded-md border border-[var(--m3-outline-variant)] bg-white p-5">
        <div className="flex flex-col gap-6">
          <div className="rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
              Current exam
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--m3-on-surface)]">
              {activeExam.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--m3-on-surface-variant)]">
              {activeExam.scopeSummary}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--m3-on-surface)]">
              {formatExamDate(activeExam.scheduledFor)}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--m3-on-surface)]">
              Confidence
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              {CONFIDENCE_OPTIONS.map((option) => {
                const isSelected = confidenceLevel === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConfidenceLevel(option.value)}
                    className={`rounded-md border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-[var(--m3-primary)] bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]"
                        : "border-[var(--m3-outline-variant)] bg-white text-[var(--m3-on-surface)] hover:bg-[var(--m3-surface-container-low)]"
                    }`}
                  >
                    <p className="text-lg font-semibold">{option.value}</p>
                    <p className="mt-1 text-xs leading-5">{option.helper}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--m3-on-surface)]">
              Focus topics
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeExam.focusTopics.map((topic) => {
                const isSelected = selectedFocusTopics.includes(topic);

                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleFocusTopic(topic)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      isSelected
                        ? "border-[var(--m3-primary)] bg-[var(--m3-primary)] text-[var(--m3-on-primary)]"
                        : "border-[var(--m3-outline-variant)] bg-white text-[var(--m3-on-surface)] hover:bg-[var(--m3-surface-container-low)]"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-[var(--m3-on-surface)]">
              Session goal
            </span>
            <textarea
              value={goalText}
              onChange={(event) => setGoalText(event.target.value)}
              rows={6}
              placeholder="Example: I want to practice the short-answer style questions and catch the mistakes I keep making under time pressure."
              className="mt-3 w-full rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-4 py-3 text-sm text-[var(--m3-on-surface)] outline-none transition-colors placeholder:text-[var(--m3-on-surface-variant)] focus:border-[var(--m3-primary)] focus:bg-white"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-[#fecaca] bg-[#fff7ed] px-4 py-3 text-sm text-[#7c2d12]">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--m3-outline-variant)] pt-4">
            <p className="text-sm leading-6 text-[var(--m3-on-surface-variant)]">
              Save this once and the regular course dashboard will start sessions with the exam context already attached.
            </p>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSaving}
              className={primaryButtonClassName}
            >
              {isSaving ? "Starting session..." : "Save and start first session"}
            </button>
          </div>
        </div>
      </section>
    </StudentPageFrame>
  );
}
