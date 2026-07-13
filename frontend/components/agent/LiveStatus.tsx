import { LoaderCircle } from "lucide-react";

export function LiveStatus({ running, step }: { running: boolean; step?: string }) {
  return <div role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs text-muted">{running ? <LoaderCircle size={13} className="animate-spin text-brand" /> : <span className="h-2 w-2 rounded-full bg-status-ok" />}<span>{running ? step ? `正在${step}` : "Agent 正在执行下一步" : "Agent 已就绪"}</span></div>;
}
