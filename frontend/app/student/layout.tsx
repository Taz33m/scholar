import type { ReactNode } from "react";

import { StudentAppProvider } from "@/components/student/student-app-provider";
import { StudentShell } from "@/components/student/student-shell";
import { loadStudentShellStateOrRedirect } from "@/lib/student-access/server-state";

interface StudentLayoutProps {
  children: ReactNode;
}

export default async function StudentLayout({ children }: StudentLayoutProps) {
  const state = await loadStudentShellStateOrRedirect();

  return (
    <StudentAppProvider courses={state.courses} user={state.user}>
      <StudentShell>{children}</StudentShell>
    </StudentAppProvider>
  );
}
