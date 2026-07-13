import { ArrowDown, RotateCcw } from "lucide-react";

export function RepairConnector({ note }: { note?: string }) {
  return <div className="my-3 flex items-stretch gap-3 pl-3"><div className="flex w-6 flex-col items-center text-status-warn"><span className="grid h-6 w-6 place-items-center rounded-full bg-status-warn/10"><RotateCcw size={12} /></span><span className="my-1 h-full w-px bg-status-warn/30" /><ArrowDown size={12} /></div><div className="py-1"><strong className="text-xs text-status-warn">自检 → 修正</strong><p className="mt-1 text-xs leading-5 text-muted">{note || "执行结果未通过，Agent 根据错误信息生成新的修复尝试。"}</p></div></div>;
}
