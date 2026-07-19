"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Database, Sparkles } from "lucide-react";
import Link from "next/link";
import type { AgentTimeline, TimelineArtifact } from "@/lib/agentTimeline";
import { agentSpring } from "@/lib/motion";
import { AgentContextBar } from "./AgentContextBar";
import { ConclusionCard } from "./ConclusionCard";
import { PlanTracker } from "./PlanTracker";
import { StepBlock } from "./StepBlock";

type Props = {
  timeline: AgentTimeline;
  liveTimeline: AgentTimeline;
  running: boolean;
  hasDatasets: boolean;
  hasSelection: boolean;
  examples: string[];
  onExample: (text: string) => void;
  onAnchor: (anchor: string) => void;
  onArtifact: (artifact: TimelineArtifact) => void;
  workspaceMode?: boolean;
};

function UserQuestion({ text }: { text: string }) {
  return <div className="ml-auto max-w-[82%] rounded-appleLg rounded-br-md bg-ink px-4 py-3 text-sm leading-6 text-white">{text}</div>;
}

export function AgentTimelineView({
  timeline,
  liveTimeline,
  running,
  hasDatasets,
  hasSelection,
  examples,
  onExample,
  onAnchor,
  onArtifact,
  workspaceMode = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  if (!timeline.questions.length && !timeline.steps.length && !timeline.conclusion) {
    return (
      <div className="grid min-h-[52vh] place-items-center text-center">
        <div className="max-w-xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-appleLg bg-brand/10 text-brand">
            {hasDatasets ? <Sparkles size={24} /> : <Database size={24} />}
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">{workspaceMode ? "开始和当前文件夹对话" : hasDatasets ? "从一个科研问题开始" : "先添加一份可分析的数据"}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {workspaceMode
              ? "直接提出问题，不需要选择功能模式。Agent 会按需读取文件、检索内容、检查数据结构、调用分析环境，并保留工具回执。"
              : hasDatasets
              ? hasSelection
                ? "下面的问题根据已选数据字段生成。Agent 会展示真实规划、执行、自检与可信产物。"
                : "先选择数据集，避免生成没有来源的分析。"
              : "上传 CSV 或 XLSX 后，Agent 会按问题动态生成代码并登记完整血缘。"}
          </p>
          {hasDatasets || workspaceMode ? (
            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {examples.map((prompt) => <button key={prompt} disabled={!workspaceMode && !hasSelection} onClick={() => onExample(prompt)} className="rounded-apple border bg-surface p-3 text-left text-sm hover:border-brand/35 disabled:opacity-40">{prompt}</button>)}
            </div>
          ) : <Link href="/knowledge" className="btn-primary mt-6">上传数据</Link>}
        </div>
      </div>
    );
  }

  const conclusions = timeline.conclusions.length ? timeline.conclusions : timeline.conclusion ? [timeline.conclusion] : [];
  const currentQuestion = liveTimeline.questions.at(-1);
  const answeredQuestions = new Set(conclusions.map((item) => item.question).filter(Boolean));
  const unansweredQuestion = timeline.questions.findLast((item) => !answeredQuestions.has(item));
  const processTimeline = running ? liveTimeline : timeline;
  const processFailures = processTimeline.steps.reduce((sum, step) => sum + step.attempts.filter((attempt) => attempt.status === "error").length, 0);
  const processComplete = processTimeline.steps.length > 0 && processTimeline.steps.every((step) => step.status === "success");
  const processStatus = processFailures
    ? processComplete ? `已完成自动修复 · ${processFailures} 次` : `分析未完成 · ${processFailures} 次未通过`
    : "全部运行成功";
  const context = liveTimeline.contexts.at(-1) ?? timeline.contexts.at(-1);
  const process = <section className="space-y-4" aria-label="分析过程">
    <PlanTracker steps={processTimeline.steps} />
    <AnimatePresence initial={false}>
      {processTimeline.steps.map((step, index) => <StepBlock key={step.id} step={step} index={index} running={running} defaultOpen={processTimeline.steps.length === 1 || step.attempts.some((attempt) => attempt.status === "error")} onArtifact={onArtifact} />)}
    </AnimatePresence>
  </section>;

  return (
    <div className="space-y-4">
      <AgentContextBar context={context} />
      {conclusions.map((conclusion, index) => (
        <motion.div key={`${index}-${conclusion.text.slice(0, 24)}`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={agentSpring} className="space-y-3">
          {conclusion.question && <UserQuestion text={conclusion.question} />}
          <ConclusionCard text={conclusion.text} status={conclusion.status} onAnchor={onAnchor} />
        </motion.div>
      ))}
      {running && currentQuestion && !answeredQuestions.has(currentQuestion) && <UserQuestion text={currentQuestion} />}
      {!running && unansweredQuestion && <UserQuestion text={unansweredQuestion} />}
      {running && process}
      {!running && conclusions.length === 0 && process}
      {!running && conclusions.length > 0 && processTimeline.steps.length > 0 && <details className="group rounded-appleLg border bg-surface/70">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-muted">查看分析过程与技术详情 <span className="ml-2 font-normal text-subtle">{processStatus}</span></summary>
        <div className="border-t p-4">{process}</div>
      </details>}
    </div>
  );
}
