"use client";
export function AnchorChip({ anchor, onClick }: { anchor: string; onClick?: () => void }) {
  return <button onClick={onClick} className="mx-0.5 inline-flex -translate-y-0.5 items-center rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand hover:bg-blue-100 dark:bg-blue-950/60">{anchor}</button>;
}

