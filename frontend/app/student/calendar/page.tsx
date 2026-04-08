import { redirect } from "next/navigation";

import {
  readStudentFilterParams,
  type StudentRouteSearchParams,
} from "@/app/student/route-search-params";
import { loadStudentShellStateOrRedirect } from "@/lib/student-access/server-state";

interface StudentCalendarPageProps {
  searchParams: StudentRouteSearchParams;
}

export default async function StudentCalendarPage({
  searchParams,
}: StudentCalendarPageProps) {
  const { courseId } = await readStudentFilterParams(searchParams);
  const state = await loadStudentShellStateOrRedirect();
  const matchedCourse = courseId
    ? state.courses.find((course) => course.id === courseId) ?? null
    : null;
  const targetCourse = matchedCourse ?? state.courses[0] ?? null;

  if (!targetCourse) {
    redirect("/student/courses");
  }

  redirect(`/student/course/${targetCourse.id}`);
}
