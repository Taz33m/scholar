import { StudentSessionsView } from "@/components/student/student-sessions-view";

import {
  readStudentFilterParams,
  type StudentRouteSearchParams,
} from "@/app/student/route-search-params";

interface StudentSessionsPageProps {
  searchParams: StudentRouteSearchParams;
}

export default async function StudentSessionsPage({
  searchParams,
}: StudentSessionsPageProps) {
  const { courseId, day } = await readStudentFilterParams(searchParams);

  return <StudentSessionsView initialCourseId={courseId} initialDay={day} />;
}
