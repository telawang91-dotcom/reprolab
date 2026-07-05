"use client";

import { ArrowRight, BookOpen, CheckCircle2, Database, FlaskConical, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const storageKey = "reprolab-onboarding-seen-v1";
const steps = [
  {
    eyebrow: "欢迎使用 ReproLab",
    title: "让每个科研结论都有来路",
    description: "ReproLab 把数据、运行代码、环境和最终数字连成可信链。数据或环境变化时，系统会重跑、比对并标出漂移。",
    icon: FlaskConical,
    points: ["数字绑定数据 → Run → Artifact", "内容按 SHA-256 存储", "结论与引用使用可解析锚点"],
  },
  {
    eyebrow: "第 1 步 · 建立证据库",
    title: "先上传数据和参考资料",
    description: "进入知识库上传 CSV、XLSX、PDF、Notebook 或 Markdown。系统会解析内容、建立指纹，并提供关键词与语义检索。",
    icon: Database,
    points: ["数据集用于后续真实计算", "论文和笔记用于检索与引用", "重复文件共用同一内容指纹"],
  },
  {
    eyebrow: "第 2 步 · 提出科研问题",
    title: "用自然语言驱动分析",
    description: "在分析对话中选择数据集并描述任务。Agent 会规划步骤、动态生成 Python、执行代码，并登记每个图表和数字。",
    icon: BookOpen,
    points: ["技能包只是可选加速模板", "分析代码不会使用固定学科菜单", "点击产物锚点可查看完整血缘"],
  },
  {
    eyebrow: "第 3 步 · 校验与回写",
    title: "通过三查后再形成结论",
    description: "写作面板会检查引用、数字和图表。发现问题时可执行可信自修复；全部通过后，结论才能回写知识库。",
    icon: ShieldCheck,
    points: ["裸数字会被标记为来路不明", "NLI 检测引用是否真的支持论断", "一键复现会用容差判断一致或漂移"],
  },
];

export function FirstRunGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const router = useRouter();
  useEffect(() => { if (!localStorage.getItem(storageKey)) setOpen(true); }, []);
  if (!open) return null;
  const item = steps[step]; const Icon = item.icon; const last = step === steps.length - 1;
  function close() { localStorage.setItem(storageKey, "1"); setOpen(false); }
  function start() { close(); router.push("/knowledge"); }
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="ReproLab 新手引导">
    <section className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
      <button onClick={close} aria-label="暂时关闭新手引导" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border bg-white/90 text-slate-500 hover:text-slate-900 dark:bg-slate-900"><X size={15}/></button>
      <div className="grid md:grid-cols-[220px_1fr]">
        <div className="flex min-h-44 flex-col bg-slate-950 p-6 text-white md:min-h-[440px]"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500"><FlaskConical size={21}/></span><div className="mt-6 text-xs font-semibold uppercase tracking-[.2em] text-blue-300">ReproLab Guide</div><p className="mt-2 text-lg font-semibold">可信、可复现的科研工作台</p><p className="mt-3 text-xs leading-5 text-slate-400">新手按“入库 → 分析 → 溯源 → 校验 → 回写”完成第一个闭环。</p><div className="mt-auto hidden space-y-3 pt-8 md:block">{steps.map((entry, index) => <button key={entry.title} onClick={() => setStep(index)} className={`flex w-full items-center gap-3 text-left text-xs ${index === step ? "text-white" : "text-slate-500"}`}><span className={`grid h-6 w-6 place-items-center rounded-full border ${index === step ? "border-blue-400 bg-blue-500" : "border-slate-700"}`}>{index + 1}</span><span className="line-clamp-1">{entry.title}</span></button>)}</div></div>
        <div className="flex min-h-[440px] flex-col p-7 md:p-9"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-brand dark:bg-blue-950"><Icon size={20}/></span><span className="text-xs font-semibold uppercase tracking-wide text-brand">{item.eyebrow}</span></div><h2 className="mt-6 text-2xl font-semibold tracking-tight">{item.title}</h2><p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.description}</p><ul className="mt-6 space-y-3">{item.points.map((point) => <li key={point} className="flex items-start gap-3 text-sm"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600"/><span>{point}</span></li>)}</ul><div className="mt-auto flex items-center gap-3 pt-8"><div className="flex gap-1.5">{steps.map((_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === step ? "w-6 bg-brand" : "w-1.5 bg-slate-200 dark:bg-slate-700"}`}/>)}</div>{step > 0 && <button onClick={() => setStep((value) => value - 1)} className="btn-secondary ml-auto">上一步</button>}<button onClick={last ? start : () => setStep((value) => value + 1)} className={`${step === 0 ? "ml-auto" : ""} btn-primary`}>{last ? "进入知识库" : "下一步"}<ArrowRight size={15}/></button></div></div>
      </div>
    </section>
  </div>;
}
