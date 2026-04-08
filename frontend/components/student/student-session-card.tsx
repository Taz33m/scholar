import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowRightIcon } from "@/components/student/student-icons";
import {
  formatSessionTimestamp,
  formatShortDate,
} from "@/lib/student-app/presentation";
import type { StudentSession } from "@/lib/student-app/types";

interface StudentSessionCardProps {
  onOpen: (session: StudentSession) => void;
  session: StudentSession;
  showCourse?: boolean;
}

export function StudentSessionCard({
  onOpen,
  session,
  showCourse = true,
}: StudentSessionCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className="group w-full rounded-md border border-[var(--m3-outline-variant)] bg-white p-4 text-left transition-colors hover:bg-[var(--m3-surface-container-low)]"
    >
      <div className="grid gap-4 xl:grid-cols-[108px_minmax(0,1fr)_184px] xl:items-start">
        <div className="rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
            Started
          </p>
          <p className="mt-2 text-lg font-semibold text-[var(--m3-on-surface)]">
            {formatShortDate(session.startedAt)}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={session.status} />
            {showCourse && session.courseTitle ? (
              <span className="rounded-md bg-[var(--m3-surface-container-highest)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
                {session.courseTitle}
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--m3-on-surface)]">
            {session.title}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--m3-on-surface-variant)]">
            {session.summary || "No summary available for this session."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <div className="rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
              Artifacts
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--m3-on-surface)]">
              {session.artifactCount}
            </p>
          </div>
          <div className="rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
              Last active
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--m3-on-surface)]">
              {formatSessionTimestamp(session.lastActivityAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--m3-outline-variant)] pt-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
          {session.eventCount} recorded events
        </p>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--m3-primary)] transition-transform group-hover:translate-x-0.5">
          Open session
          <ArrowRightIcon className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}
