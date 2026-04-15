import { redirect } from "next/navigation";

import { StudentCourseHomeView } from "@/components/student/student-course-home-view";
import { loadStudentShellStateOrRedirect } from "@/lib/student-access/server-state";

interface StudentCourseHomePageProps {
  params: Promise<{
    courseId: string;
  }>;
}

export default async function StudentCourseHomePage({
  params,
}: StudentCourseHomePageProps) {
  const { courseId } = await params;
  const state = await loadStudentShellStateOrRedirect();
  const course = state.courses.find((entry) => entry.id === courseId) ?? null;

  if (!course) {
    redirect("/student/courses");
  }

  return <StudentCourseHomeView courseId={courseId} />;
}
