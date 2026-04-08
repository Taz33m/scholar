import { cn } from "@/lib/utils";

interface StudentStatCardProps {
  label: string;
  tone?: "default" | "highlight";
  value: string;
}

export function StudentStatCard({
  label,
  tone = "default",
  value,
}: StudentStatCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border bg-white px-4 py-4",
        tone === "highlight"
          ? "border-[color:color-mix(in_srgb,var(--m3-primary)_20%,white)] bg-[color:color-mix(in_srgb,var(--m3-primary-container)_32%,white)] text-[var(--m3-on-surface)]"
          : "border-[var(--m3-outline-variant)] text-[var(--m3-on-surface)]",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--m3-on-surface-variant)]">
        {label}
      </p>
      <p className="mt-2 text-[1.75rem] font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}
