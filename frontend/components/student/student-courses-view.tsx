"use client";

import { useStudentApp } from "@/components/student/student-app-provider";
import { StudentCourseCard } from "@/components/student/student-course-card";
import { StudentPageFrame } from "@/components/student/student-page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentData } from "@/hooks/use-student-data";
import { getRecentSessionsForCourse } from "@/lib/student-app/presentation";

export function StudentCoursesView() {
  const { courses, user } = useStudentApp();
  const { sessions } = useStudentData({ limit: 50 });
  const initials = (user.display_name || user.email).slice(0, 1).toUpperCase();

  return (
    <StudentPageFrame
      title="Courses"
      actions={
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--m3-outline-variant)] bg-[#111827] text-sm font-semibold text-white">
          {initials}
        </div>
      }
    >
      {courses.length > 0 ? (
        <section className="grid gap-5 xl:grid-cols-2">
          {courses.map((course) => (
            <StudentCourseCard
              key={course.id}
              course={course}
              latestSession={getRecentSessionsForCourse(sessions, course.id, 1)[0] ?? null}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title="No courses yet"
          description="Once courses are assigned, they will appear here."
        />
      )}
    </StudentPageFrame>
  );
}
