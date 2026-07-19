"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, BarChart3, Check, Code2, TerminalSquare } from "lucide-react";
import type { TimelineArtifact, TimelineAttempt } from "@/lib/agentTimeline";
import { agentSpring } from "@/lib/motion";
import { RoleChip } from "./RoleChip";
import { artifactKindLabel } from "./ArtifactValue";

function lastError(stdout?: string) {
  const lines = (stdout || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return [...lines].reverse().find((line) => /(?:Error|Exception|failed|exceeded|timeout)/i.test(line)) || lines.at(-1) || "执行未完成，未产生可信结果。";
}

function errorTitle(stdout?: string) {
  const value = stdout || "";
  if (/OverflowError|recursion/i.test(value)) return "结果序列化失败";
  if (/budget exceeded/i.test(value)) return "产物数量超过上限";
  if (/KeyError|not in index/i.test(value)) return "字段或索引不存在";
  if (/timeout/i.test(value)) return "执行超时";
  return "代码执行未完成";
}

export function AttemptView({ attempt, index, recovered = false, onArtifact }: { attempt: TimelineAttempt; index: number; recovered?: boolean; onArtifact: (artifact: TimelineArtifact) => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <article className={`overflow-hidden rounded-apple border ${attempt.status === "error" ? recovered ? "border-status-warn/30" : "border-status-err/35" : ""}`}>
      <div className="flex items-center gap-2 border-b bg-ink/[.025] px-4 py-3"><RoleChip role="execute" /><span className="text-xs text-muted">尝试 {index + 1}</span>{attempt.status !== "working" && <span className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold ${attempt.status === "success" ? "text-status-ok" : recovered ? "text-status-warn" : "text-status-err"}`}>{attempt.status === "success" ? <Check size={13} /> : <AlertTriangle size={13} />}{attempt.status === "success" ? "运行成功" : recovered ? "未通过 · 已自动修复" : "运行失败"}</span>}</div>
      {attempt.run?.status === "error" && <div className={`border-b px-4 py-3 ${recovered ? "bg-status-warn/[.06]" : "bg-status-err/[.06]"}`}><div className="flex items-start gap-2"><AlertTriangle size={15} className={`mt-0.5 shrink-0 ${recovered ? "text-status-warn" : "text-status-err"}`} /><div className="min-w-0"><p className="text-sm font-semibold">{errorTitle(attempt.run.stdout)}</p><p className="mt-1 break-words font-mono text-[11px] leading-5 text-muted">{lastError(attempt.run.stdout)}</p>{recovered && <p className="mt-1 text-xs text-muted">Agent 已根据错误信息重新生成并执行下一次尝试。</p>}</div></div></div>}
      {attempt.reasoning.length > 0 && <div className="border-b px-4 py-3"><div className="mb-2 flex items-center gap-2"><RoleChip role="review" /><span className="text-xs text-muted">推理与自检</span></div>{attempt.reasoning.map((note, noteIndex) => <p key={noteIndex} className="text-sm leading-6 text-muted">{note}</p>)}</div>}
      {attempt.code && <details className="group border-b"><summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-semibold text-muted"><Code2 size={14} />查看生成的 {attempt.lang || "python"} 代码</summary><pre className="max-h-80 overflow-auto bg-[#101114] p-4 font-mono text-xs leading-6 text-[#f5f5f7]"><code>{attempt.code}</code></pre></details>}
      {attempt.run && <details className="group border-b"><summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-semibold text-muted"><TerminalSquare size={14} />完整运行日志<span className="ml-auto">{attempt.run.stdout ? "可展开" : "无标准输出"}</span></summary><div className="px-4 pb-3"><pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-appleSm bg-ink/[.035] p-3 font-mono text-xs leading-5 text-muted">{attempt.run.stdout || "无标准输出"}</pre>{attempt.run.run_id && <div className="mt-2 font-mono text-[10px] text-subtle">run {attempt.run.run_id}</div>}</div></details>}
      {attempt.artifacts.length > 0 && <div className="grid gap-2 border-t p-3 sm:grid-cols-2">{attempt.artifacts.map((artifact) => <motion.button key={artifact.artifact_id} layoutId={`artifact-${artifact.artifact_id}`} transition={reduceMotion ? { duration: 0 } : agentSpring} onClick={() => onArtifact(artifact)} whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: .95 }} className="flex items-center gap-2 rounded-apple border bg-surface p-3 text-left hover:border-brand/30 hover:bg-elevated"><BarChart3 size={15} className="text-brand" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{artifact.title || artifactKindLabel(artifact.kind)}</span><span className="font-mono text-[10px] text-brand">{artifact.anchor}</span></motion.button>)}</div>}
    </article>
  );
}
