import "server-only";

import { redirect } from "next/navigation";

import { getDemoStudentHomeState } from "@/lib/student-access/demo";
import { isStudentAccessDemoModeEnabled } from "@/lib/student-access/demo-mode";
import { requireStudentContext } from "@/lib/student-access/context";
import { listStudentCourses } from "@/lib/student-access/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loadStudentShellStateOrRedirect() {
  if (isStudentAccessDemoModeEnabled()) {
    return getDemoStudentHomeState();
  }

  let supabase;

  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("Student auth configuration error:", error);
    redirect("/login?error=unavailable");
  }

  try {
    const context = await requireStudentContext(supabase);
    const courses = await listStudentCourses(supabase);

    return {
      courses,
      user: context.appUser,
    };
  } catch (error) {
    console.error("Student access error:", error);
    redirect("/login?error=no-access");
  }
}
