"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { TimelineArtifact, TimelineStep } from "@/lib/agentTimeline";
import { agentSpring } from "@/lib/motion";
import { AttemptView } from "./AttemptView";
import { RepairConnector } from "./RepairConnector";

export function StepBlock({ step, index, onArtifact, defaultOpen = false, running = false }: { step: TimelineStep; index: number; onArtifact: (artifact: TimelineArtifact) => void; defaultOpen?: boolean; running?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const reduceMotion = useReducedMotion();
  const repairNote = step.attempts.flatMap((attempt) => attempt.reasoning).at(-1) || step.notes.at(-1);
  return <motion.section layout className="apple-interactive rounded-appleLg border bg-surface" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={agentSpring}>
    <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 p-4 text-left"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${step.status === "success" ? "bg-status-ok text-white" : step.status === "repairing" ? "bg-status-warn/10 text-status-warn" : "bg-brand/10 text-brand"}`}>{step.status === "success" ? <Check size={16} /> : index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate">{step.title}</strong><span className="mt-0.5 block text-xs text-muted">{step.status === "pending" ? "等待执行" : step.status === "repairing" ? running ? "正在自检并修正" : "分析未完成，查看诊断" : step.status === "success" ? "步骤完成" : running ? "正在执行" : "执行记录"}</span></span><ChevronDown size={16} className={`text-subtle transition ${open ? "rotate-180" : ""}`} /></button>
    <AnimatePresence initial={false}>{open && <motion.div initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : agentSpring} className="overflow-hidden"><div className="space-y-3 border-t p-4">{step.rationale && <p className="text-sm leading-6 text-muted">{step.rationale}</p>}{step.notes.map((note, noteIndex) => <p key={noteIndex} className="rounded-apple bg-role-review/[.07] px-3 py-2 text-sm leading-6 text-muted">{note}</p>)}{step.attempts.map((attempt, attemptIndex) => <div key={attempt.id}>{attemptIndex > 0 && <RepairConnector note={repairNote} />}<AttemptView attempt={attempt} index={attemptIndex} recovered={attempt.status === "error" && step.attempts.slice(attemptIndex + 1).some((item) => item.status === "success")} onArtifact={onArtifact} /></div>)}</div></motion.div>}</AnimatePresence>
  </motion.section>;
}
