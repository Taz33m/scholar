"use client";

import type {
  SessionChecklistArtifact,
} from "@/types/session";
import {
  getBloomLevelLabel,
  getChecklistStatusLabel,
} from "@/types/course-brain";
import { cn } from "@/lib/utils";

interface SessionChecklistPanelProps {
  artifact: SessionChecklistArtifact | null;
}

const STATUS_STYLES: Record<
  NonNullable<SessionChecklistArtifact>["items"][number]["status"],
  string
> = {
  not_started: "border-slate-200 bg-white text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  needs_review: "border-rose-200 bg-rose-50 text-rose-800",
};

export function SessionChecklistPanel({
  artifact,
}: SessionChecklistPanelProps) {
  if (!artifact) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        No checklist yet. Start a course-backed session to see the live lesson checklist.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Session Checklist
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              {artifact.title}
            </h2>
            <p className="max-w-2xl text-sm text-slate-600">{artifact.summary}</p>
          </div>
          {artifact.courseBrainVersionId ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
              {artifact.courseBrainVersionId}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {artifact.items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                    Objective {index + 1}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {getBloomLevelLabel(item.bloomLevel)}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  {item.label}
                </h3>
              </div>

              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold",
                  STATUS_STYLES[item.status],
                )}
              >
                {getChecklistStatusLabel(item.status)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Success Criteria
                </p>
                <p className="mt-1 text-sm text-slate-700">{item.successCriteria}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Evidence Note
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {item.evidenceNote || "No evidence note yet."}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
