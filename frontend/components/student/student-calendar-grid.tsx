import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/student/student-icons";
import {
  buildCalendarCells,
  buildCalendarCountMap,
  formatDayLabel,
  formatMonthLabel,
  pluralize,
} from "@/lib/student-app/presentation";
import type { StudentCalendarDay } from "@/lib/student-app/types";
import { cn } from "@/lib/utils";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface StudentCalendarGridProps {
  days: StudentCalendarDay[];
  loading?: boolean;
  month: string;
  onMonthChange: (direction: -1 | 1) => void;
  onSelectDay?: (day: string) => void;
  selectedDay?: string | null;
  todayKey: string;
}

export function StudentCalendarGrid({
  days,
  loading = false,
  month,
  onMonthChange,
  onSelectDay,
  selectedDay = null,
  todayKey,
}: StudentCalendarGridProps) {
  const cells = buildCalendarCells(month);
  const dayCounts = buildCalendarCountMap(days);

  return (
    <section className="rounded-md border border-[var(--m3-outline-variant)] bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--m3-on-surface-variant)]">
            Activity Calendar
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--m3-on-surface)]">
            {formatMonthLabel(month)}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(-1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] text-[var(--m3-on-surface-variant)] transition-colors hover:bg-[var(--m3-surface-container-low)] hover:text-[var(--m3-on-surface)]"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] text-[var(--m3-on-surface-variant)] transition-colors hover:bg-[var(--m3-surface-container-low)] hover:text-[var(--m3-on-surface)]"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 border-l border-t border-[var(--m3-outline-variant)] text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="border-b border-r border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-2 py-2"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-[var(--m3-outline-variant)]">
        {loading
          ? Array.from({ length: 35 }).map((_, index) => (
              <div
                key={`loading-${index}`}
                className="min-h-[92px] animate-pulse border-b border-r border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)]"
              />
            ))
          : cells.map((cell) => {
              if (!cell.day) {
                return (
                  <div
                    key={cell.key}
                    className="min-h-[92px] border-b border-r border-[var(--m3-outline-variant)] bg-[#fcfcfa]"
                  />
                );
              }

              const dayKey = cell.day;
              const count = dayCounts.get(dayKey) ?? 0;
              const isActive = count > 0;
              const isInteractive = Boolean(onSelectDay) && isActive;
              const isSelected = selectedDay === dayKey;
              const isToday = dayKey === todayKey;
              const label = Number(dayKey.slice(-2));

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    if (isInteractive && onSelectDay) {
                      onSelectDay(dayKey);
                    }
                  }}
                  disabled={!isInteractive}
                  title={
                    isActive
                      ? `${pluralize(count, "session")} on ${formatDayLabel(dayKey)}`
                      : `No sessions on ${formatDayLabel(dayKey)}`
                  }
                  className={cn(
                    "min-h-[92px] border-b border-r border-[var(--m3-outline-variant)] p-2 text-left transition-colors",
                    isSelected
                      ? "bg-[color:color-mix(in_srgb,var(--m3-primary-container)_60%,white)] text-[var(--m3-on-surface)]"
                      : isActive
                        ? "bg-white text-[var(--m3-on-surface)] hover:bg-[var(--m3-surface-container-low)]"
                        : "bg-[#fcfcfa] text-[var(--m3-on-surface-variant)]",
                    isToday && !isSelected ? "bg-[color:color-mix(in_srgb,var(--m3-primary-container)_28%,white)]" : "",
                    !isInteractive ? "cursor-default" : "",
                  )}
                >
                  <div className="flex h-full flex-col">
                    <span className="text-sm font-semibold">{label}</span>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          isActive
                            ? "text-[var(--m3-on-surface-variant)]"
                            : "text-[var(--m3-outline)]",
                        )}
                      >
                        {isActive ? pluralize(count, "session") : ""}
                      </span>
                      {isActive ? (
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            isSelected
                              ? "bg-[var(--m3-primary)]"
                              : "bg-[var(--m3-primary)]/70",
                          )}
                        />
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}
