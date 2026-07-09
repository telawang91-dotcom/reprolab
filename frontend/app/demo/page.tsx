"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, Database, FlaskConical, Network, PlayCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const steps = [
  {
    eyebrow: "01 · 整理资料",
    title: "把一个研究主题放进独立空间",
    text: "文献、笔记和数据按主题归档。之后的检索与问答，都可以只限定在这个范围内。",
    icon: BookOpen,
    preview: "知识空间",
    rows: ["研究综述.pdf", "实验记录.md", "观测数据.csv"],
  },
  {
    eyebrow: "02 · 提出问题",
    title: "只基于选定资料获得回答",
    text: "答案中的引用可以直接回到原文位置，不会把其他项目的资料混进来。",
    icon: Database,
    preview: "限定范围问答",
    rows: ["提出研究问题", "基于证据生成回答", "定位出处 ⟦src_xxxx⟧"],
  },
  {
    eyebrow: "03 · 运行分析",
    title: "自然语言变成真实执行的分析",
    text: "系统根据数据动态生成代码并运行，图表和数字不是静态示意，而是真实分析产物。",
    icon: FlaskConical,
    preview: "分析运行",
    rows: ["选择数据", "生成并执行代码", "产出图表与统计结果"],
  },
  {
    eyebrow: "04 · 核对来源",
    title: "每个结果都能回到数据、代码和环境",
    text: "可信记录贯穿整个流程。需要复核时，可以查看血缘并重新运行，而不是只相信一段回答。",
    icon: Network,
    preview: "可信记录",
    rows: ["Dataset · 输入数据", "Run · 代码与环境", "Artifact · 图表与数字"],
  },
];

export default function DemoPage() {
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const Icon = step.icon;

  return <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 lg:px-8">
    <header className="flex items-center justify-between">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"><ArrowLeft size={15}/>退出演示</Link>
      <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"><ShieldCheck size={13}/>不会创建或修改任何资料</div>
    </header>

    <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="text-xs font-semibold uppercase tracking-[.16em] text-brand">{step.eyebrow}</div>
        <h1 className="mt-4 max-w-lg text-3xl font-semibold leading-tight tracking-tight md:text-4xl">{step.title}</h1>
        <p className="mt-5 max-w-lg text-sm leading-7 text-slate-500">{step.text}</p>
        <div className="mt-8 flex items-center gap-2">{steps.map((_, index) => <button key={index} onClick={() => setCurrent(index)} aria-label={`查看第 ${index + 1} 步`} className={`h-1.5 rounded-full transition-all ${index === current ? "w-8 bg-brand" : "w-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700"}`}/>)}</div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
        <div className="flex h-12 items-center border-b px-4 dark:border-slate-800"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-brand dark:bg-blue-950"><Icon size={15}/></span><span className="ml-3 text-sm font-medium">{step.preview}</span><span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-600"><Check size={12}/>演示预览</span></div>
        <div className="min-h-[330px] bg-slate-50/70 p-6 dark:bg-slate-900/40 md:p-8">
          <div className="mx-auto max-w-md rounded-xl border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900"><Icon size={18}/></span><div><div className="text-sm font-semibold">{step.preview}</div><div className="mt-0.5 text-xs text-slate-400">ReproLab 工作流</div></div></div>
            <div className="divide-y dark:divide-slate-800">{step.rows.map((row, index) => <div key={row} className="flex items-center gap-3 py-3.5"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${index === step.rows.length - 1 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{index + 1}</span><span className="text-sm">{row}</span>{index < step.rows.length - 1 && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-700"/>}</div>)}</div>
          </div>
        </div>
      </section>
    </main>

    <footer className="flex items-center justify-between border-t pt-5 dark:border-slate-800">
      <button onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0} className="btn-secondary disabled:invisible"><ArrowLeft size={14}/>上一步</button>
      {current < steps.length - 1 ? <button onClick={() => setCurrent((value) => value + 1)} className="btn-primary">下一步<ArrowRight size={14}/></button> : <Link href="/knowledge" className="btn-primary"><PlayCircle size={14}/>开始使用</Link>}
    </footer>
  </div>;
}
