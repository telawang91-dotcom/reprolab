import { Check, LoaderCircle, X } from "lucide-react";

export function ProvenanceStrip({ state }: { state: "checking" | "complete" | "incomplete" }) {
  const complete = state === "complete";
  return <div className={`rounded-apple border px-3 py-3 ${complete ? "bg-status-ok/[.07]" : state === "checking" ? "bg-brand/[.06]" : "bg-status-warn/[.08]"}`}><div className="flex items-center gap-2 text-xs font-semibold">{state === "checking" ? <LoaderCircle size={13} className="animate-spin text-brand" /> : complete ? <Check size={13} className="text-status-ok" /> : <X size={13} className="text-status-warn" />}{state === "checking" ? "正在核对可信记录" : complete ? "可信链完整" : "可信链待补全"}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">{["数据", "代码", "环境"].map((item) => <span key={item} className="rounded-full bg-surface/70 px-2 py-1">{complete ? "✓" : "·"} {item}</span>)}</div></div>;
}
