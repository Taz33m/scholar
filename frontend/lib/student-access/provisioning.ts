import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function canRequestStudentAccess(supabase: SupabaseClient, email: string) {
  const normalizedEmail = normalizeEmail(email);
  const enrollmentResult = await supabase
    .rpc("can_request_student_access", { candidate_email: normalizedEmail });

  if (enrollmentResult.error) {
    throw enrollmentResult.error;
  }

  return Boolean(enrollmentResult.data);
}

export async function provisionStudentAccess(user: User) {
  const email = user.email ? normalizeEmail(user.email) : null;

  if (!email) {
    return { hasAccess: false as const };
  }

  const supabase = getSupabaseAdminClient();
  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  const upsertResult = await supabase
    .from("app_users")
    .upsert(
      {
        display_name: displayName,
        email,
        id: user.id,
        role: "student",
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();

  if (upsertResult.error) {
    throw upsertResult.error;
  }

  const enrollmentResult = await supabase
    .from("course_enrollments")
    .select("course_id, status")
    .eq("student_email", email)
    .in("status", ["invited", "active"]);

  if (enrollmentResult.error) {
    throw enrollmentResult.error;
  }

  const requestedCourseIds = Array.from(
    new Set((enrollmentResult.data ?? []).map((row) => row.course_id)),
  );

  if (requestedCourseIds.length === 0) {
    return { hasAccess: false as const };
  }

  const activeCoursesResult = await supabase
    .from("courses")
    .select("id")
    .in("id", requestedCourseIds)
    .eq("is_active", true);

  if (activeCoursesResult.error) {
    throw activeCoursesResult.error;
  }

  const activeCourseIds = Array.from(
    new Set((activeCoursesResult.data ?? []).map((course) => course.id)),
  );

  if (activeCourseIds.length === 0) {
    return { hasAccess: false as const };
  }

  const activatedAt = new Date().toISOString();
  const invitedUpdateResult = await supabase
    .from("course_enrollments")
    .update({
      activated_at: activatedAt,
      status: "active",
      student_user_id: user.id,
    })
    .eq("student_email", email)
    .eq("status", "invited")
    .in("course_id", activeCourseIds);

  if (invitedUpdateResult.error) {
    throw invitedUpdateResult.error;
  }

  const activeUpdateResult = await supabase
    .from("course_enrollments")
    .update({
      student_user_id: user.id,
    })
    .eq("student_email", email)
    .eq("status", "active")
    .in("course_id", activeCourseIds);

  if (activeUpdateResult.error) {
    throw activeUpdateResult.error;
  }

  return {
    hasAccess: true as const,
  };
}
