"use client";

import { motion, useReducedMotion } from "framer-motion";

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
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-apple bg-ink/[.06] p-1 dark:bg-white/[.10]"
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <motion.button
            key={segment.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.value)}
            whileHover={reduceMotion ? undefined : { y: -1 }}
            whileTap={reduceMotion ? undefined : { scale: .96, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 34 }}
            className="relative min-h-11 rounded-appleSm px-4 text-sm text-muted transition-colors aria-selected:text-ink sm:min-h-9"
          >
            {active && (
              <motion.span
                layoutId="segmented-control-active"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 34 }}
                className="absolute inset-0 rounded-appleSm border border-line/[.08] bg-surface shadow-[0_1px_2px_rgba(0,0,0,.08)] dark:border-line/[.12]"
              />
            )}
            <span className="relative z-10">{segment.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
