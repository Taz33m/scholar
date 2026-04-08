import type {
  StudentCalendarDay,
  StudentCourse,
  StudentSession,
} from "@/lib/student-app/types";

export type StudentCourseTone = {
  badgeClassName: string;
  containerClassName: string;
  fillClassName: string;
  softClassName: string;
  strokeClassName: string;
  textClassName: string;
};

const COURSE_TONES: Record<string, StudentCourseTone> = {
  amber: {
    badgeClassName: "bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]",
    containerClassName:
      "border-[color:color-mix(in_srgb,var(--m3-tertiary)_20%,white)] bg-white",
    fillClassName: "bg-[var(--m3-tertiary)]",
    softClassName: "bg-[var(--m3-tertiary-container)]",
    strokeClassName: "border-[color:color-mix(in_srgb,var(--m3-tertiary)_28%,white)]",
    textClassName: "text-[var(--m3-on-tertiary-container)]",
  },
  blue: {
    badgeClassName: "bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]",
    containerClassName:
      "border-[color:color-mix(in_srgb,var(--m3-primary)_18%,white)] bg-white",
    fillClassName: "bg-[var(--m3-primary)]",
    softClassName: "bg-[var(--m3-primary-container)]",
    strokeClassName: "border-[color:color-mix(in_srgb,var(--m3-primary)_28%,white)]",
    textClassName: "text-[var(--m3-on-primary-container)]",
  },
  emerald: {
    badgeClassName: "bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]",
    containerClassName:
      "border-[color:color-mix(in_srgb,var(--m3-secondary)_18%,white)] bg-white",
    fillClassName: "bg-[var(--m3-secondary)]",
    softClassName: "bg-[var(--m3-secondary-container)]",
    strokeClassName: "border-[color:color-mix(in_srgb,var(--m3-secondary)_28%,white)]",
    textClassName: "text-[var(--m3-on-secondary-container)]",
  },
  rose: {
    badgeClassName: "bg-[#ffd9e2] text-[#3f001a]",
    containerClassName:
      "border-[color:#efb8c8] bg-white",
    fillClassName: "bg-[#9c405f]",
    softClassName: "bg-[#ffd9e2]",
    strokeClassName: "border-[#efb8c8]",
    textClassName: "text-[#3f001a]",
  },
  sky: {
    badgeClassName: "bg-[#d3e4ff] text-[#001c38]",
    containerClassName:
      "border-[color:#a8c8ff] bg-white",
    fillClassName: "bg-[#245fa6]",
    softClassName: "bg-[#d3e4ff]",
    strokeClassName: "border-[#a8c8ff]",
    textClassName: "text-[#001c38]",
  },
  slate: {
    badgeClassName:
      "bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)]",
    containerClassName: "border-[var(--m3-outline-variant)] bg-white",
    fillClassName: "bg-[var(--m3-outline)]",
    softClassName: "bg-[var(--m3-surface-container-high)]",
    strokeClassName: "border-[var(--m3-outline-variant)]",
    textClassName: "text-[var(--m3-on-surface-variant)]",
  },
};

export function getStudentCourseTone(colorToken: string | null) {
  return COURSE_TONES[colorToken ?? "slate"] ?? COURSE_TONES.slate;
}

export function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

export function getLocalDayKey(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function shiftMonthKey(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return getMonthKey(shifted);
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function formatDayLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, date));
}

export function formatSessionTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function formatCourseActivity(value: string | null) {
  if (!value) {
    return "No study recorded yet";
  }

  return `Last session ${formatShortDate(value)}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildCalendarCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingEmptyDays = firstDay.getDay();
  const totalCells = Math.ceil((leadingEmptyDays + daysInMonth) / 7) * 7;
  const cells: Array<{ day: string | null; key: string }> = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - leadingEmptyDays + 1;

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push({
        day: null,
        key: `empty-${monthKey}-${index}`,
      });
      continue;
    }

    cells.push({
      day: `${monthKey}-${padDatePart(dayNumber)}`,
      key: `${monthKey}-${padDatePart(dayNumber)}`,
    });
  }

  return cells;
}

export function countArtifacts(sessions: StudentSession[]) {
  return sessions.reduce((total, session) => total + session.artifactCount, 0);
}

export function getLatestSession(sessions: StudentSession[]) {
  return sessions[0] ?? null;
}

export function buildCalendarCountMap(days: StudentCalendarDay[]) {
  return new Map(days.map((entry) => [entry.day, entry.sessionCount]));
}

export function getMostActiveCourse(courses: StudentCourse[]) {
  return [...courses].sort((left, right) => right.sessionCount - left.sessionCount)[0] ?? null;
}

export function getRecentSessionsForCourse(
  sessions: StudentSession[],
  courseId: string,
  limit = 3,
) {
  return sessions.filter((session) => session.courseId === courseId).slice(0, limit);
}
