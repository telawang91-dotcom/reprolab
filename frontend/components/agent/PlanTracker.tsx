"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import type { TimelineStep } from "@/lib/agentTimeline";
import { agentSpring } from "@/lib/motion";
import { RoleChip } from "./RoleChip";

export function PlanTracker({ steps }: { steps: TimelineStep[] }) {
  const reduceMotion = useReducedMotion();
  const complete = steps.filter((step) => step.status === "success").length;
  if (!steps.length) return null;
  const progress = Math.round((complete / steps.length) * 100);
  return (
    <section className="rounded-appleLg border bg-surface p-4">
      <div className="flex items-center gap-3"><RoleChip role="plan" /><span className="text-xs text-muted">{complete} / {steps.length} 步完成</span><span className="ml-auto text-xs font-semibold text-brand">{progress}%</span></div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink/[.07]"><motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${progress}%` }} transition={reduceMotion ? { duration: 0 } : agentSpring} /></div>
      <ol className="mt-4 flex gap-2 overflow-x-auto pb-1">{steps.map((step, index) => <li key={step.id} className={`flex min-w-max items-center gap-2 rounded-full px-3 py-2 text-xs ${step.status === "success" ? "bg-status-ok/10 text-status-ok" : step.status === "pending" ? "bg-ink/[.05] text-muted" : "bg-brand/10 text-brand"}`}>{step.status === "success" ? <motion.span initial={reduceMotion ? false : { scale: .4 }} animate={{ scale: 1 }} transition={agentSpring} className="grid h-5 w-5 place-items-center rounded-full bg-status-ok text-white"><Check size={12} /></motion.span> : <span className="grid h-5 w-5 place-items-center rounded-full bg-current/10 font-semibold">{index + 1}</span>}<span>{step.title}</span></li>)}</ol>
    </section>
  );
}
