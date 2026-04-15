import type { StudentMemorySettings } from "@/types/student-memory";
import { getLocalDevStudentEmail } from "@/lib/student-access/dev-auth";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { StudentAccessHttpError } from "@/lib/student-access/http";

type AppUserRow = {
  id: string;
  email: string;
  role: "student" | "professor";
  display_name: string | null;
  memory_opt_in: boolean | null;
  memory_opted_in_at: string | null;
  memory_consent_version: string | null;
};

const APP_USER_BASE_SELECT = "id, email, role, display_name";
const APP_USER_MEMORY_SELECT =
  "id, email, role, display_name, memory_opt_in, memory_opted_in_at, memory_consent_version";

export type StudentContext = {
  appUser: AppUserRow & {
    memorySettings: StudentMemorySettings;
  };
  supabase: SupabaseClient;
  user: User;
};

const STUDENT_ACCESS_DENIED_MESSAGE = "Student access is not available for this account.";

const toStudentMemorySettings = (appUser: AppUserRow): StudentMemorySettings => ({
  memoryOptIn: Boolean(appUser.memory_opt_in),
  memoryOptedInAt: appUser.memory_opted_in_at ?? null,
  memoryConsentVersion: appUser.memory_consent_version ?? null,
});

const hasMissingStudentMemoryColumnError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "42703" ||
    (typeof candidate.message === "string" &&
      (candidate.message.includes("memory_opt_in") ||
        candidate.message.includes("memory_opted_in_at") ||
        candidate.message.includes("memory_consent_version")))
  );
};

async function loadAppUserRow(
  supabase: SupabaseClient,
  user: User | null,
  localDevEmail: string | null,
) {
  const buildLookup = (selectClause: string) =>
    user
      ? supabase
          .from("app_users")
          .select(selectClause)
          .eq("id", user.id)
          .maybeSingle<AppUserRow>()
      : supabase
          .from("app_users")
          .select(selectClause)
          .eq("email", localDevEmail ?? "")
          .maybeSingle<AppUserRow>();

  const withMemoryResult = await buildLookup(APP_USER_MEMORY_SELECT);
  if (!withMemoryResult.error) {
    return withMemoryResult.data;
  }

  if (!hasMissingStudentMemoryColumnError(withMemoryResult.error)) {
    throw withMemoryResult.error;
  }

  const fallbackResult = await buildLookup(APP_USER_BASE_SELECT);
  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  if (!fallbackResult.data) {
    return null;
  }

  return {
    ...fallbackResult.data,
    memory_opt_in: false,
    memory_opted_in_at: null,
    memory_consent_version: null,
  } satisfies AppUserRow;
}

export async function requireStudentContext(supabase: SupabaseClient): Promise<StudentContext> {
  const userResult = await supabase.auth.getUser();
  const localDevEmail = await getLocalDevStudentEmail();
  const user = userResult.data.user;

  if (userResult.error && !localDevEmail) {
    throw new StudentAccessHttpError(401, "Please sign in to continue.");
  }

  if (!user && !localDevEmail) {
    throw new StudentAccessHttpError(401, "Please sign in to continue.");
  }

  const appUser = await loadAppUserRow(supabase, user, localDevEmail);

  if (!appUser || appUser.role !== "student") {
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
    appUser: {
      ...appUser,
      memorySettings: toStudentMemorySettings(appUser),
    },
    supabase,
    user:
      user ??
      ({
        email: appUser.email,
        id: appUser.id,
      } as User),
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
