"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Database, Sparkles } from "lucide-react";
import Link from "next/link";
import type { AgentTimeline, TimelineArtifact } from "@/lib/agentTimeline";
import { agentSpring } from "@/lib/motion";
import { ConclusionCard } from "./ConclusionCard";
import { PlanTracker } from "./PlanTracker";
import { StepBlock } from "./StepBlock";

export function AgentTimelineView({ timeline, hasDatasets, hasSelection, onExample, onAnchor, onArtifact }: { timeline: AgentTimeline; hasDatasets: boolean; hasSelection: boolean; onExample: (text: string) => void; onAnchor: (anchor: string) => void; onArtifact: (artifact: TimelineArtifact) => void }) {
  const reduceMotion = useReducedMotion();
  if (!timeline.steps.length && !timeline.conclusion) return <div className="grid min-h-[52vh] place-items-center text-center"><div className="max-w-xl"><span className="mx-auto grid h-14 w-14 place-items-center rounded-appleLg bg-brand/10 text-brand">{hasDatasets ? <Sparkles size={24} /> : <Database size={24} />}</span><h2 className="mt-5 text-2xl font-semibold tracking-tight">{hasDatasets ? "从一个科研问题开始" : "先添加一份可分析的数据"}</h2><p className="mt-3 text-sm leading-6 text-muted">{hasDatasets ? hasSelection ? "描述你要比较、检验或解释什么。Agent 会完整展示规划、执行、自检与可信产物。" : "先选择数据集，避免生成没有来源的分析。" : "上传 CSV 或 XLSX 后，Agent 会按问题动态生成代码并登记完整血缘。"}</p>{hasDatasets ? <div className="mt-6 grid gap-2 sm:grid-cols-3">{["比较不同组的均值并绘图", "分析两个变量的相关性", "建立回归模型并解释系数"].map((prompt) => <button key={prompt} disabled={!hasSelection} onClick={() => onExample(prompt)} className="rounded-apple border bg-surface p-3 text-left text-sm hover:border-brand/35 disabled:opacity-40">{prompt}</button>)}</div> : <Link href="/knowledge" className="btn-primary mt-6">上传数据</Link>}</div></div>;
  return <div className="space-y-4"><PlanTracker steps={timeline.steps} /><AnimatePresence initial={false}>{timeline.steps.map((step, index) => <StepBlock key={step.id} step={step} index={index} onArtifact={onArtifact} />)}</AnimatePresence>{timeline.conclusion && <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={agentSpring}><ConclusionCard text={timeline.conclusion.text} onAnchor={onAnchor} /></motion.div>}</div>;
}
