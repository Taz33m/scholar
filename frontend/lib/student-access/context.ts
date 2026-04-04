import type { SupabaseClient, User } from "@supabase/supabase-js";

import { StudentAccessHttpError } from "@/lib/student-access/http";

type AppUserRow = {
  id: string;
  email: string;
  role: "student" | "professor";
  display_name: string | null;
};

export type StudentContext = {
  appUser: AppUserRow;
  supabase: SupabaseClient;
  user: User;
};

const STUDENT_ACCESS_DENIED_MESSAGE = "Student access is not available for this account.";

export async function requireStudentContext(supabase: SupabaseClient): Promise<StudentContext> {
  const userResult = await supabase.auth.getUser();

  if (userResult.error) {
    throw new StudentAccessHttpError(401, "Please sign in to continue.");
  }

  const user = userResult.data.user;

  if (!user) {
    throw new StudentAccessHttpError(401, "Please sign in to continue.");
  }

  const appUserResult = await supabase
    .from("app_users")
    .select("id, email, role, display_name")
    .eq("id", user.id)
    .maybeSingle<AppUserRow>();

  if (appUserResult.error) {
    throw appUserResult.error;
  }

  if (!appUserResult.data || appUserResult.data.role !== "student") {
    throw new StudentAccessHttpError(403, STUDENT_ACCESS_DENIED_MESSAGE);
  }

  const courseResult = await supabase.from("courses").select("id").limit(1).maybeSingle();

  if (courseResult.error) {
    throw courseResult.error;
  }

  if (!courseResult.data) {
    throw new StudentAccessHttpError(403, STUDENT_ACCESS_DENIED_MESSAGE);
  }

  return {
    appUser: appUserResult.data,
    supabase,
    user,
  };
}

export async function assertAuthorizedCourseAccess(
  supabase: SupabaseClient,
  courseId: string,
) {
  const courseResult = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("is_active", true)
    .maybeSingle();

  if (courseResult.error) {
    throw courseResult.error;
  }

  if (!courseResult.data) {
    throw new StudentAccessHttpError(403, "You do not have access to that course.");
  }
}
