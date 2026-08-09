"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { FeedbackItem } from "@/lib/feedback";

const icons = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };
const tones = {
  success: "border-status-ok/20 text-status-ok",
  warning: "border-status-warn/20 text-status-warn",
  error: "border-status-err/20 text-status-err",
  info: "border-brand/20 text-brand",
};

export function FeedbackCenter() {
  const [item, setItem] = useState<FeedbackItem>();

  useEffect(() => {
    const receive = (event: Event) => setItem((event as CustomEvent<FeedbackItem>).detail);
    window.addEventListener("reprolab-feedback", receive);
    return () => window.removeEventListener("reprolab-feedback", receive);
  }, []);

  useEffect(() => {
    if (!item) return;
    const timeout = window.setTimeout(() => setItem((current) => current?.id === item.id ? undefined : current), item.action ? 7000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [item]);

  if (!item) return null;
  const Icon = icons[item.tone];
  return <div role="status" aria-live="polite" className={`fixed bottom-5 left-1/2 z-[90] flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-apple border bg-surface px-4 py-3 shadow-float ${tones[item.tone]}`}>
    <Icon size={17} className="shrink-0"/>
    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{item.message}</span>
    {item.action && <button onClick={() => { void item.action?.run(); setItem(undefined); }} className="shrink-0 text-sm font-semibold hover:underline">{item.action.label}</button>}
    <button onClick={() => setItem(undefined)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-subtle hover:bg-ink/[.05]" aria-label="关闭提示"><X size={14}/></button>
  </div>;
}
