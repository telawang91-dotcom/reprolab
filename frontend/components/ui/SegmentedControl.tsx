"use client";

export type Segment<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  value,
  segments,
  onChange,
  label = "视图切换",
}: {
  value: T;
  segments: Segment<T>[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-apple bg-ink/[.06] p-1 dark:bg-white/[.10]"
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.value)}
            className="relative min-h-11 rounded-appleSm px-4 text-sm text-muted transition duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[.96] aria-selected:text-ink motion-reduce:transform-none motion-reduce:transition-none sm:min-h-9"
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-appleSm border border-line/[.08] bg-surface shadow-[0_1px_2px_rgba(0,0,0,.08)] dark:border-line/[.12]"
              />
            )}
            <span className="relative z-10">{segment.label}</span>
          </button>
        );
      })}
    </div>
  );
}
