import { redirect } from "next/navigation";

import { loadStudentShellStateOrRedirect } from "@/lib/student-access/server-state";

interface StudentCourseOnboardingPageProps {
  params: Promise<{
    courseId: string;
  }>;
}

export default async function StudentCourseOnboardingPage({
  params,
}: StudentCourseOnboardingPageProps) {
  const { courseId } = await params;
  const state = await loadStudentShellStateOrRedirect();
  const course = state.courses.find((entry) => entry.id === courseId) ?? null;

  if (!course) {
    redirect("/student");
  }

  redirect(`/student/course/${course.id}`);
}
