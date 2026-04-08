import Link from "next/link";

import { ArrowRightIcon } from "@/components/student/student-icons";
import { formatCourseActivity, pluralize } from "@/lib/student-app/presentation";
import type { StudentCourse, StudentSession } from "@/lib/student-app/types";

interface StudentCourseCardProps {
  course: StudentCourse;
  latestSession?: StudentSession | null;
}

export function StudentCourseCard({
  course,
  latestSession = null,
}: StudentCourseCardProps) {
  return (
    <article className="overflow-hidden rounded-md border border-[var(--m3-outline-variant)] bg-white transition-colors hover:bg-[var(--m3-surface-container-low)]">
      <div className="h-2 w-full bg-[#111827]" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {course.courseCode ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--m3-on-surface-variant)]">
                {course.courseCode}
              </p>
            ) : null}
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--m3-on-surface)]">
              {course.title}
            </h3>
          </div>

          <span
            className="inline-flex rounded-md bg-[#111827] px-2.5 py-1 text-xs font-semibold text-white"
          >
            {pluralize(course.sessionCount, "session")}
          </span>
        </div>

        <div className="mt-4 space-y-2 text-sm leading-6 text-[var(--m3-on-surface-variant)]">
          {course.description ? <p>{course.description}</p> : null}
          <p>{formatCourseActivity(course.lastActivityAt)}</p>
        </div>

        {latestSession ? (
          <div className="mt-5 border-t border-[var(--m3-outline-variant)] pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
              Latest session
            </p>
            <p className="mt-2 text-base font-semibold text-[var(--m3-on-surface)]">
              {latestSession.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--m3-on-surface-variant)]">
              {latestSession.summary}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--m3-outline-variant)] pt-4">
          <Link
            href={`/student/course/${course.id}`}
            className="inline-flex items-center gap-2 rounded-md bg-[#111827] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0f172a]"
          >
            Open course
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
