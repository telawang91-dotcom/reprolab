import { AlertTriangle, Check, LoaderCircle, RefreshCw, X } from "lucide-react";

type TrustState = "checking" | "complete" | "incomplete" | "error";

export function ProvenanceStrip({ state, onRetry }: { state: TrustState; onRetry?: () => void }) {
  const complete = state === "complete";
  const checking = state === "checking";
  const error = state === "error";
  const message = checking
    ? "正在确认这项结果能否用于结论"
    : complete
      ? "来源完整，可以保存或用于报告"
      : error
        ? "暂时无法核对来源"
        : "来源不完整，暂不要写入结论";

  return <div className={`rounded-apple border px-3 py-3 ${complete ? "bg-status-ok/[.07]" : checking ? "bg-brand/[.06]" : "bg-status-warn/[.08]"}`}>
    <div className="flex items-center gap-2 text-xs font-semibold">
      {checking ? <LoaderCircle size={13} className="animate-spin text-brand" /> : complete ? <Check size={13} className="text-status-ok" /> : error ? <AlertTriangle size={13} className="text-status-warn" /> : <X size={13} className="text-status-warn" />}
      <span className="flex-1">{message}</span>
      {error && onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-brand hover:underline"><RefreshCw size={11}/>重试</button>}
    </div>
    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">{["输入数据", "分析代码", "运行环境"].map((item) => <span key={item} className="rounded-full bg-surface/70 px-2 py-1">{complete ? "✓" : "·"} {item}</span>)}</div>
  </div>;
}
