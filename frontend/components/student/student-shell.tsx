import type { ReactNode } from "react";

export function StudentShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f4] text-[var(--m3-on-surface)]">
      <main className="mx-auto min-h-screen max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
