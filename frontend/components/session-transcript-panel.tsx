export interface SessionTranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
}

interface SessionTranscriptPanelProps {
  entries: SessionTranscriptEntry[];
  preview?: SessionTranscriptEntry | null;
}

export function SessionTranscriptPanel({
  entries,
  preview,
}: SessionTranscriptPanelProps) {
  const visibleEntries = entries.filter((entry) => entry.role !== "system");

  if (visibleEntries.length === 0 && !preview) {
    return null;
  }

  return (
    <aside className="w-full max-w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="max-h-[320px] space-y-2 overflow-y-auto p-3">
        {visibleEntries.map((entry) => (
          <div
            key={entry.id}
            className={
              entry.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                entry.role === "assistant"
                  ? "max-w-[88%] rounded-lg border border-brand-orange-light/20 bg-brand-orange-light/10 px-3 py-2 text-sm leading-6 text-slate-700"
                  : "max-w-[88%] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700"
              }
            >
              {entry.text}
            </div>
          </div>
        ))}

        {preview ? (
          <div
            className={
              preview.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                preview.role === "assistant"
                  ? "max-w-[88%] rounded-lg border border-brand-orange-light/25 bg-brand-orange-light/10 px-3 py-2 text-sm leading-6 text-slate-500"
                  : "max-w-[88%] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-500"
              }
            >
              {preview.text}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
