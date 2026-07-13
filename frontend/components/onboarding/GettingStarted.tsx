"use client";

import { Check, ChevronRight, CircleHelp, Database, FlaskConical, PlayCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const storageKey = "reprolab-onboarding-dismissed";

type GettingStartedProps = {
  documentCount: number;
  collectionCount: number;
};

export function GettingStarted({ documentCount, collectionCount }: GettingStartedProps) {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => setDismissed(window.localStorage.getItem(storageKey) === "true"), []);

  const steps = useMemo(() => [
    { title: "添加第一份资料", description: "上传论文、笔记或数据文件", href: "/knowledge", done: documentCount > 0, icon: Database },
    { title: "建立研究范围", description: "用知识空间限定资料与问答", href: "/knowledge", done: collectionCount > 0, icon: CircleHelp },
    { title: "完成一次分析", description: "运行问题并得到可回溯的结果", href: "/analysis", done: false, icon: FlaskConical },
  ], [collectionCount, documentCount]);
  const completed = steps.filter((item) => item.done).length;

  if (dismissed) return null;
  return <section className="surface relative mb-6 overflow-hidden p-5 sm:p-6">
    <button onClick={() => { window.localStorage.setItem(storageKey, "true"); setDismissed(true); }} aria-label="暂时收起新手引导" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-subtle transition hover:bg-ink/[.05] hover:text-ink"><X size={16}/></button>
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="eyebrow text-brand">新手引导 · 第一步最重要</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">用 3 分钟跑通你的第一条可信研究链</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">不用理解所有功能。按下面顺序完成一次资料入库、范围限定和分析，结果会自动保存数据、代码与环境。</p>
      </div>
      <Link href="/guide" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover">查看完整引导<ChevronRight size={15}/></Link>
    </div>
    <div className="relative mt-5 grid gap-3 md:grid-cols-3">
      {steps.map(({ title, description, href, done, icon: Icon }, index) => <Link key={title} href={href} className="interactive-card group flex items-center gap-3 p-3.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${done ? "bg-status-ok/10 text-status-ok" : "bg-brand/10 text-brand"}`}>{done ? <Check size={15}/> : <Icon size={15}/>}</span>
        <span className="min-w-0 flex-1"><span className="block text-xs text-subtle">0{index + 1}</span><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block truncate text-xs text-muted">{description}</span></span>
        <ChevronRight size={15} className="text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand"/>
      </Link>)}
    </div>
    <div className="relative mt-4 flex items-center gap-2 text-xs text-muted"><span className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/[.07]"><span className="block h-full bg-brand transition-all" style={{ width: `${(completed / steps.length) * 100}%` }}/></span>{completed}/{steps.length} 已完成 <Link href="/demo" className="ml-2 inline-flex items-center gap-1 text-brand"><PlayCircle size={13}/>先看示例</Link></div>
  </section>;
}
