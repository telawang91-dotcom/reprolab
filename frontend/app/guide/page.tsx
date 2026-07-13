import { ArrowRight, BookOpen, Brain, Database, FileCheck2, FlaskConical, HelpCircle, Lightbulb, Network, PlayCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

const workflow = [
  { number: "01", title: "资料入库", text: "上传数据、论文、笔记或代码，建立内容指纹和检索切块。", href: "/knowledge", icon: Database },
  { number: "02", title: "提出分析问题", text: "选择数据，用自己的话描述要比较、检验或解释什么。", href: "/analysis", icon: FlaskConical },
  { number: "03", title: "查看溯源", text: "从产物锚点进入血缘图，查看原始数据、代码、环境和输出。", href: "/results?tab=lineage", icon: Network },
  { number: "04", title: "校验写作", text: "检查数字、引用与图表，通过后回写可信结论。", href: "/results?tab=writing", icon: FileCheck2 },
];
const capabilities = [
  { title: "知识库", text: "文件入库、混合检索、文献问答与原文定位。", href: "/knowledge", icon: BookOpen },
  { title: "数据分析", text: "根据问题生成并运行代码，失败时修正，并登记每项结果。", href: "/analysis", icon: FlaskConical },
  { title: "复现与漂移", text: "固定随机种子重跑，检查数据、代码和环境变化。", href: "/results?tab=lineage", icon: Network },
  { title: "结论检查", text: "检查无来源数字、错误引用和无法复现的图表。", href: "/results?tab=writing", icon: ShieldCheck },
  { title: "科研记忆", text: "记住研究偏好与方法，并在后续任务中按需召回。", href: "/memory", icon: Brain },
  { title: "主动建议与技能", text: "建议绑定真实证据，技能只作为可选加速模板。", href: "/analysis", icon: Lightbulb },
];

export default function GuidePage() {
  return <div className="page-shell max-w-6xl space-y-12">
    <section className="rounded-appleXl bg-ink px-7 py-12 text-white sm:px-12 sm:py-16"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-white/60"><HelpCircle size={15}/>First research journey</div><h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-.045em] sm:text-5xl">第一次使用，<br/>从一条可信研究链开始。</h1><p className="mt-5 max-w-2xl text-[17px] leading-7 text-white/70">上传资料、提出问题、整理结果。复杂机制会在需要时自动参与，不需要先理解全部功能。</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/knowledge" className="btn-primary">上传第一份资料<ArrowRight size={15}/></Link><Link href="/demo" className="btn border border-white/20 bg-white/10 text-white hover:bg-white/15"><PlayCircle size={15}/>体验隔离演示</Link></div></section>

    <section><div className="eyebrow text-brand">3 分钟上手</div><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="section-title">按四步完成第一次研究闭环</h2><p className="mt-2 text-[17px] text-muted">每张卡片都能直接带你完成对应操作。</p></div><Link href="/knowledge" className="text-link text-[17px]">从第 1 步开始<ArrowRight size={14}/></Link></div><div className="mt-6 grid gap-4 md:grid-cols-2">{workflow.map(({ number, title, text, href, icon: Icon }) => <Link key={number} href={href} className="interactive-card group flex gap-4"><span className="text-3xl font-semibold text-subtle group-hover:text-brand">{number}</span><span className="grid h-10 w-10 shrink-0 place-items-center rounded-appleSm bg-brand/10 text-brand"><Icon size={18}/></span><span><strong className="block font-semibold">{title}</strong><span className="mt-1 block text-sm leading-6 text-muted">{text}</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">前往此步骤<ArrowRight size={13}/></span></span></Link>)}</div></section>

    <section><div className="eyebrow">功能地图</div><h2 className="section-title mt-2">每个能力，都能直接开始。</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{capabilities.map(({ title, text, href, icon: Icon }) => <Link key={title} href={href} className="interactive-card group"><span className="grid h-10 w-10 place-items-center rounded-appleSm bg-brand/10 text-brand"><Icon size={18}/></span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{text}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">打开功能<ArrowRight size={14}/></span></Link>)}</div></section>

    <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-appleLg border bg-status-warn/[.08] p-5"><h3 className="font-semibold text-status-warn">使用前请确认</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-muted"><li>• 后端与 PostgreSQL 正常运行。</li><li>• 分析与问答已配置模型 API Key。</li><li>• 最终复现验收使用 Docker 沙箱。</li></ul></article><article className="rounded-appleLg border bg-brand/[.06] p-5"><h3 className="font-semibold text-brand">记住这条原则</h3><p className="mt-3 text-sm leading-6 text-muted">没有 ⟦art_xxxx⟧ 的数字和没有 ⟦src_xxxx⟧ 的引用，不应直接进入可信结论。先校验，再回写。</p><Link href="/results?tab=writing" className="text-link mt-4">进入写作面板<ArrowRight size={14}/></Link></article></section>
  </div>;
}
