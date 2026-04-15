import { hasSupabaseServerAuthConfig } from "@/lib/supabase/config";

export function isStudentAccessDemoModeEnabled() {
  if (process.env.STUDENT_ACCESS_DEMO_MODE === "true") {
    return true;
  }

  if (process.env.STUDENT_ACCESS_DEMO_MODE === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production" && !hasSupabaseServerAuthConfig();
}
