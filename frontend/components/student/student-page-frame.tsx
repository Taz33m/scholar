import type { ReactNode } from "react";

interface StudentPageFrameProps {
  actions?: ReactNode;
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}

export function StudentPageFrame({
  actions,
  children,
  description,
  eyebrow,
  title,
}: StudentPageFrameProps) {
  return (
    <div className="space-y-6">
      <section className="border-b border-[var(--m3-outline-variant)] pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-2 text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--m3-on-surface)] sm:text-[1.55rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--m3-on-surface-variant)]">
                {description}
              </p>
            ) : null}
          </div>

          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </section>

      {children}
    </div>
  );
}
