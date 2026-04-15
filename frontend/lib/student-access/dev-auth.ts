import "server-only";

import { cookies } from "next/headers";

export const DEV_STUDENT_EMAIL_COOKIE = "scholar-dev-student-email";

export function isLocalDevStudentAuthEnabled() {
  return process.env.NODE_ENV !== "production";
}

export async function getLocalDevStudentEmail() {
  if (!isLocalDevStudentAuthEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(DEV_STUDENT_EMAIL_COOKIE)?.value?.trim().toLowerCase() ?? null;
}
