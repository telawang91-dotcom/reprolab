"use client";
export function AnchorChip({ anchor, onClick }: { anchor: string; onClick?: () => void }) {
  const className = "mx-0.5 inline-flex -translate-y-0.5 items-center rounded-appleSm bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand";
  if (!onClick) return <span className={className}>{anchor}</span>;
  return <button type="button" onClick={onClick} title="打开产物详情与完整溯源" aria-label={`${anchor}，打开产物详情与完整溯源`} className={`${className} transition-colors hover:bg-brand/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}>{anchor}</button>;
}
