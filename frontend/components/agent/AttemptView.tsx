"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, BarChart3, Check, Code2, TerminalSquare } from "lucide-react";
import type { TimelineArtifact, TimelineAttempt } from "@/lib/agentTimeline";
import { agentSpring } from "@/lib/motion";
import { RoleChip } from "./RoleChip";
import { artifactKindLabel } from "./ArtifactValue";

export function AttemptView({ attempt, index, onArtifact }: { attempt: TimelineAttempt; index: number; onArtifact: (artifact: TimelineArtifact) => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <article className={`overflow-hidden rounded-apple border ${attempt.status === "error" ? "border-status-err/35" : ""}`}>
      <div className="flex items-center gap-2 border-b bg-ink/[.025] px-4 py-3"><RoleChip role="execute" /><span className="text-xs text-muted">尝试 {index + 1}</span>{attempt.status !== "working" && <span className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold ${attempt.status === "success" ? "text-status-ok" : "text-status-err"}`}>{attempt.status === "success" ? <Check size={13} /> : <AlertTriangle size={13} />}{attempt.status === "success" ? "运行成功" : "运行失败"}</span>}</div>
      {attempt.reasoning.length > 0 && <div className="border-b px-4 py-3"><div className="mb-2 flex items-center gap-2"><RoleChip role="review" /><span className="text-xs text-muted">推理与自检</span></div>{attempt.reasoning.map((note, noteIndex) => <p key={noteIndex} className="text-sm leading-6 text-muted">{note}</p>)}</div>}
      {attempt.code && <details open className="group border-b"><summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-semibold text-muted"><Code2 size={14} />{attempt.lang || "python"} · Agent 动态生成</summary><pre className="max-h-80 overflow-auto bg-[#101114] p-4 font-mono text-xs leading-6 text-[#f5f5f7]"><code>{attempt.code}</code></pre></details>}
      {attempt.run && <div className={`px-4 py-3 ${attempt.run.status === "success" ? "bg-status-ok/[.06]" : "bg-status-err/[.07]"}`}><div className="flex items-center gap-2 text-xs font-semibold"><TerminalSquare size={14} />执行结果</div><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted">{attempt.run.stdout || "无标准输出"}</pre>{attempt.run.run_id && <div className="mt-2 font-mono text-[10px] text-subtle">run {attempt.run.run_id}</div>}</div>}
      {attempt.artifacts.length > 0 && <div className="grid gap-2 border-t p-3 sm:grid-cols-2">{attempt.artifacts.map((artifact) => <motion.button key={artifact.artifact_id} layoutId={`artifact-${artifact.artifact_id}`} transition={reduceMotion ? { duration: 0 } : agentSpring} onClick={() => onArtifact(artifact)} whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: .95 }} className="flex items-center gap-2 rounded-apple border bg-surface p-3 text-left hover:border-brand/30 hover:bg-elevated"><BarChart3 size={15} className="text-brand" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{artifact.title || artifactKindLabel(artifact.kind)}</span><span className="font-mono text-[10px] text-brand">{artifact.anchor}</span></motion.button>)}</div>}
    </article>
  );
}
