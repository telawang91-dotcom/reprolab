"use client";
export function AnchorChip({ anchor, onClick }: { anchor: string; onClick?: () => void }) {
  return <button onClick={onClick} className="mx-0.5 inline-flex -translate-y-0.5 items-center rounded-appleSm bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand hover:bg-brand/15">{anchor}</button>;
}
