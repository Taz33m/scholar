import type { HTMLAttributes } from "react";

type IconProps = HTMLAttributes<SVGElement>;

export function HomeIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M3 10.75 12 3l9 7.75" />
      <path d="M5.5 10V20h13V10" />
      <path d="M10 20v-5.75h4V20" />
    </svg>
  );
}

export function CoursesIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 6.25A2.25 2.25 0 0 1 6.25 4h11.5A2.25 2.25 0 0 1 20 6.25v11.5A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75Z" />
      <path d="M8 8h8M8 12h8M8 16h5.5" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect height="17" rx="2.5" width="18" x="3" y="4" />
      <path d="M8 2.75v3.5M16 2.75v3.5M3 9.5h18" />
    </svg>
  );
}

export function SessionsIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M12 4a8 8 0 1 1-8 8" />
      <path d="M12 8v4l2.75 1.75" />
      <path d="M4 4v5h5" />
    </svg>
  );
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" />
      <path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75Z" />
      <path d="m5.5 13.5.75 2.25L8.5 16.5l-2.25.75L5.5 19.5l-.75-2.25L2.5 16.5l2.25-.75Z" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ExitIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M14 3h4.5A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5H14" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

export function GridIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect height="7" rx="1.75" width="7" x="4" y="4" />
      <rect height="7" rx="1.75" width="7" x="13" y="4" />
      <rect height="7" rx="1.75" width="7" x="4" y="13" />
      <rect height="7" rx="1.75" width="7" x="13" y="13" />
    </svg>
  );
}
