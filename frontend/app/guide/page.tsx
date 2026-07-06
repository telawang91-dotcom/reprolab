"use client";

import { ArrowRight, BookOpen, Brain, Database, FileCheck2, FlaskConical, HelpCircle, Lightbulb, Network, PlayCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

const workflow = [
  { number: "01", title: "资料入库", text: "上传数据、论文、笔记或代码，建立内容指纹和检索切块。", href: "/knowledge", icon: Database },
  { number: "02", title: "提出分析问题", text: "选择数据，用自己的话描述要比较、检验或解释什么。", href: "/analysis", icon: FlaskConical },
  { number: "03", title: "查看溯源", text: "从产物锚点进入血缘图，查看原始数据、代码、环境和输出。", href: "/analysis", icon: Network },
  { number: "04", title: "校验写作", text: "检查数字、引用与图表，修复问题，通过后回写可信结论。", href: "/writing", icon: FileCheck2 },
];

const capabilities = [
  { title: "知识库", text: "文件入库、混合检索、文献问答与原文定位。", icon: BookOpen },
  { title: "数据分析", text: "根据问题生成并运行代码，失败时尝试修正，并登记每项结果。", icon: FlaskConical },
  { title: "复现与漂移", text: "固定随机种子重跑；数值按容差、文件按内容哈希比较。", icon: Network },
  { title: "结论检查", text: "检查无来源数字、错误引用和无法复现的图表。", icon: ShieldCheck },
  { title: "科研记忆", text: "记住研究偏好与方法，并按语义相关性和时效召回。", icon: Brain },
  { title: "主动建议与技能", text: "建议必须绑定真实证据；技能包只作为可选加速模板。", icon: Lightbulb },
];

export default function GuidePage() {
  function replayGuide() { localStorage.removeItem("reprolab-onboarding-seen-v1"); window.location.href = "/"; }
  return <div className="mx-auto max-w-6xl space-y-10 p-5 lg:p-8">
    <section className="overflow-hidden rounded-2xl border bg-white p-7 shadow-card dark:border-slate-800 dark:bg-slate-950 lg:p-10"><div className="grid gap-8 lg:grid-cols-[1fr_320px]"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-brand"><HelpCircle size={15}/>Product guide</div><h1 className="mt-4 text-3xl font-semibold tracking-tight">第一次使用 ReproLab</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">ReproLab 不是只会聊天的科研助手。它的核心是：正文里的每个数字都能回到生成它的数据、代码和环境，并且可以重新执行验证。</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/knowledge" className="btn-primary">开始第一个项目<ArrowRight size={15}/></Link><button onClick={replayGuide} className="btn-secondary"><PlayCircle size={15}/>重播新手引导</button></div></div><div className="rounded-xl bg-slate-950 p-5 text-white"><div className="text-xs font-semibold uppercase tracking-wider text-blue-300">可信链</div><div className="mt-5 space-y-3 font-mono text-sm"><div className="rounded-lg border border-slate-700 p-3">Dataset · 原始数据</div><div className="text-center text-slate-500">↓ reads</div><div className="rounded-lg border border-slate-700 p-3">Run · 代码 + 环境</div><div className="text-center text-slate-500">↓ produces</div><div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-emerald-300">Artifact · 数字 / 图表</div></div></div></div></section>

    <section><div className="label">3 分钟上手</div><h2 className="mt-1 text-2xl font-semibold">推荐操作顺序</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{workflow.map(({ number, title, text, href, icon: Icon }) => <Link key={number} href={href} className="card group flex gap-4 p-5 transition hover:-translate-y-0.5 hover:border-blue-200"><span className="text-3xl font-semibold text-slate-200 group-hover:text-blue-200">{number}</span><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><Icon size={18}/></span><span><strong className="block">{title}</strong><span className="mt-1 block text-sm leading-6 text-slate-500">{text}</span></span></Link>)}</div></section>

    <section><div className="label">功能地图</div><h2 className="mt-1 text-2xl font-semibold">系统能做什么</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{capabilities.map(({ title, text, icon: Icon }) => <article key={title} className="card p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800"><Icon size={18}/></span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>)}</div></section>

    <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><h3 className="font-semibold">使用前请确认</h3><ul className="mt-3 space-y-2 text-sm leading-6"><li>• 后端与 PostgreSQL 需要正常运行，动态数据才会显示。</li><li>• 分析、问答与 NLI 需要可用的模型 API Key。</li><li>• Docker 沙箱未启动时，可使用 host 模式开发，但最终复现验收应使用 Docker。</li></ul></article><article className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950"><h3 className="font-semibold">记住这条原则</h3><p className="mt-3 text-sm leading-6">没有 ⟦art_xxxx⟧ 的数字和没有 ⟦src_xxxx⟧ 的引用，不应直接进入可信结论。先校验，再回写。</p><Link href="/writing" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">进入写作面板<ArrowRight size={14}/></Link></article></section>
  </div>;
}
