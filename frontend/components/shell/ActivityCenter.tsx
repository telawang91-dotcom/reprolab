"use client";

import { Activity } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readActivities, type ActivityItem } from "@/lib/api";

export function ActivityCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  useEffect(() => {
    setItems(readActivities());
    const update = (event: Event) => setItems((event as CustomEvent<ActivityItem[]>).detail || readActivities());
    window.addEventListener("reprolab-activities", update);
    return () => window.removeEventListener("reprolab-activities", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return <div className="relative">
    <button onClick={() => setOpen((value) => !value)} aria-label="任务" aria-expanded={open} className="relative grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-ink/[.06] hover:text-ink md:h-10 md:w-10">
      <Activity size={17} />
      {items.some((item) => item.state === "running") && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-status-warn" />}
    </button>
    {open && <>
      <button className="fixed inset-0 z-40" aria-label="关闭任务中心" onClick={() => setOpen(false)} />
      <div role="dialog" aria-label="任务中心" className="popover absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-24px)] rounded-appleLg border p-2">
        <div className="px-3 py-3"><strong className="text-sm">任务</strong><p className="mt-1 text-xs text-muted">上传与分析会持续反馈。</p></div>
        {items.length ? items.map((item) => {
          const status = item.state === "running" ? "进行中" : item.state === "success" ? "已完成" : item.state === "cancelled" ? "已取消" : "需要处理";
          const dot = item.state === "running" ? "bg-status-warn" : item.state === "success" ? "bg-status-ok" : item.state === "cancelled" ? "bg-subtle" : "bg-status-err";
          return <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-3 rounded-apple px-3 py-2 hover:bg-ink/[.05]"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{item.title}</strong><span className="mt-0.5 block text-[10px] text-muted">{status}</span></span></Link>;
        }) : <p className="px-3 py-6 text-center text-sm text-muted">暂时没有后台任务</p>}
      </div>
    </>}
  </div>;
}
