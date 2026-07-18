"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  FlaskConical,
  Layers3,
  LoaderCircle,
  Network,
  PlayCircle,
  SearchCheck,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api, setActiveProjectId, type QualityReport, type RuntimeStatus } from "@/lib/api";

const steps = [
  {
    eyebrow: "01 · 多源科研资料",
    title: "先把论文、笔记、代码和数据放进同一研究范围",
    text: "项目与研究文件夹构成两级隔离边界。CSV、XLSX、PDF、Markdown 和代码统一入库，元数据、全文片段与数据表结构可以一起查询。",
    icon: Layers3,
    preview: "结构化科研空间",
    rows: ["多格式解析与内容寻址", "项目 / 文件夹范围隔离", "元数据、全文与表结构统一管理"],
    proof: "用户价值：多源异构科研数据可以统一管理、检索与追溯",
    href: "/knowledge",
    action: "进入资料空间验证",
  },
  {
    eyebrow: "02 · 复杂检索 RAG",
    title: "不是只做向量搜索，而是让多路召回共同给出证据",
    text: "系统组合元数据预过滤、BM25 关键词召回、pgvector 语义召回、RRF 融合与 reranker，并把答案锚定到原文片段。",
    icon: SearchCheck,
    preview: "混合检索与证据问答",
    rows: ["关键词 + 语义双路召回", "RRF 融合 + 交叉编码重排", "答案引用可回到原文 ⟦src_xxxx⟧"],
    proof: "用户价值：复杂问题可以通过多路检索获得可回溯证据",
    href: "/knowledge",
    action: "进入证据检索验证",
  },
  {
    eyebrow: "03 · Agent 动态分析",
    title: "自然语言问题变成真实执行、可检查的 Python 分析",
    text: "规划、执行与质检角色协作，按当前数据动态生成代码；运行前确认输入，运行后保留代码、随机种子、环境快照与产物。",
    icon: FlaskConical,
    preview: "可复现分析运行",
    rows: ["Planner 拆解研究问题", "Executor 在沙箱执行动态代码", "Critic 检查产物与来源"],
    proof: "用户价值：自然语言研究问题可以转化为真实、可检查的分析运行",
    href: "/analysis",
    action: "运行一个真实分析",
  },
  {
    eyebrow: "04 · 漂移归因",
    title: "改了数据，不只告诉你结果变了，还定位为什么变",
    text: "每个数字和图表都绑定 Dataset → Run → Artifact。重跑使用固定随机种子与数值容差，检测漂移后可继续计算变量贡献度。",
    icon: Network,
    preview: "溯源、复现与根因定位",
    rows: ["数据 + 代码 + 环境完整血缘", "一键重跑与容差比对", "受控消融定位漂移来源"],
    proof: "对应技术深度：自研漂移归因与可信计算闭环",
    href: "/results?tab=lineage",
    action: "检查溯源与漂移",
  },
  {
    eyebrow: "05 · 对抗校验与自修复",
    title: "假数字、弱引用和矛盾证据会被拦在结论之外",
    text: "系统逐一核对数字、图表与引用锚点，用 NLI 判断文献是否真正支撑论断；发现问题后进入反思式修复循环，而不是直接回写。",
    icon: ShieldCheck,
    preview: "三查校验",
    rows: ["数字 / 图表来源检查", "引用 NLI：蕴含、中立、矛盾", "Reflexion 多轮修正后再校验"],
    proof: "对应技术深度：语义校验与多智能体自修复",
    href: "/results?tab=writing",
    action: "进入三查与修复",
  },
  {
    eyebrow: "06 · 长期科研记忆",
    title: "记住经过核验的方法与偏好，下一次研究继续复用",
    text: "记忆按项目隔离为情节、语义与技能三层。召回前会检查适用范围与来源，避免把旧结论或其他项目的上下文直接当成事实。",
    icon: Brain,
    preview: "可核验长期记忆",
    rows: ["情节记忆：做过什么", "语义记忆：确认过的偏好与事实", "技能记忆：可复用分析方法"],
    proof: "用户价值：经过核验的方法与偏好可以跨会话复用，也可以明确遗忘",
    href: "/memory",
    action: "检查记忆来源与遗忘",
  },
];

const scoreEvidence = [
  { value: "30%", title: "科学与应用价值", text: "直面科研可复现性与 AI 结论可信问题，把科研诚信要求变成系统必经流程。", icon: BookOpen },
  { value: "30%", title: "技术深度", text: "混合 RAG、多角色 Agent、漂移归因、引用 NLI、Reflexion 与模型无关层形成算法闭环。", icon: Sparkles },
  { value: "20%", title: "技术落地性", text: "真实 REST API、PostgreSQL/pgvector、执行沙箱、内容寻址存储与自动化测试均可独立验证。", icon: Server },
  { value: "20%", title: "演示效果", text: "评委可亲手运行分析、追溯来源、修改输入重跑，并用错误数字现场触发校验。", icon: PlayCircle },
];

const qualityActions: Record<string, { href: string; label: string }> = {
  datasets: { href: "/knowledge", label: "导入可分析数据" },
  searchable_documents: { href: "/knowledge", label: "补充可检索资料" },
  run_success: { href: "/analysis", label: "运行一个真实分析" },
  provenance: { href: "/results?tab=lineage", label: "检查产物血缘" },
  verification: { href: "/results?tab=writing", label: "完成三查校验" },
};

export default function DemoPage() {
  const [current, setCurrent] = useState(0);
  const [runtime, setRuntime] = useState<RuntimeStatus>();
  const [runtimeError, setRuntimeError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<QualityReport>();
  const step = steps[current];
  const Icon = step.icon;

  useEffect(() => {
    api.runtimeStatus()
      .then(setRuntime)
      .catch((reason) => setRuntimeError(reason instanceof Error ? reason.message : "无法读取运行状态"));
  }, []);

  async function enterDemo() {
    if (quality) {
      window.location.assign("/analysis");
      return;
    }
    setPreparing(true);
    setError("");
    try {
      const project = await api.prepareDemo();
      setActiveProjectId(project.id);
      setQuality(await api.qualityReport());
      setPreparing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "隔离演示准备失败");
      setPreparing(false);
    }
  }

  return <div className="mx-auto min-h-screen max-w-7xl px-5 py-7 lg:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
      <Link href="/" className="interactive inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft size={15}/>返回工作台</Link>
      <div className="inline-flex min-h-9 items-center gap-2 rounded-full bg-status-ok/10 px-3 text-xs font-medium text-status-ok"><ShieldCheck size={13}/>演示项目与真实研究空间隔离</div>
    </header>

    <main>
      <section className="grid gap-8 py-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-14">
        <div>
          <div className="eyebrow text-brand">可信科研智能体工作台</div>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] sm:text-5xl">让科研 Agent 的每个结论，<br className="hidden sm:block"/>都经得起追问与重跑。</h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-8 text-muted">ReproLab 把多源资料管理、复杂 RAG、动态数据分析、长期记忆和可信复现连成一条研究工作流。下面既说明机制，也能进入隔离项目真实操作。</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button onClick={() => void enterDemo()} disabled={preparing} className="btn-primary min-h-11 px-5">
              {preparing ? <LoaderCircle size={15} className="animate-spin"/> : <PlayCircle size={15}/>}
              {preparing ? "正在准备隔离项目…" : quality ? "开始真实演示" : "准备并检查演示项目"}
            </button>
            <a href="#capabilities" className="btn-secondary min-h-11 px-5">先看能力证据<ArrowRight size={14}/></a>
          </div>
          <p className="mt-3 text-xs leading-5 text-subtle">进入后会创建或复用明确标识的 Palmer Penguins 演示项目与研究文件夹，不会写入你的真实项目。</p>
          {error && <div role="alert" className="mt-4 flex max-w-2xl items-start gap-2 rounded-apple border border-status-err/20 bg-status-err/[.07] px-4 py-3 text-sm text-status-err"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>{error}</div>}
        </div>

        <RuntimePanel runtime={runtime} error={runtimeError}/>
      </section>

      {quality && <DemoReadiness quality={quality} />}

      <section id="capabilities" className="scroll-mt-8 border-t py-10 lg:py-14">
        <div className="mb-7 max-w-2xl"><div className="eyebrow text-brand">核心能力验证</div><h2 className="mt-2 text-3xl font-semibold tracking-[-.035em]">六步看懂完整技术闭环</h2><p className="mt-3 text-sm leading-7 text-muted">每一步都能进入真实功能验证，让技术机制、用户价值和运行证据保持一致。</p></div>
        <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
          <nav aria-label="演示能力步骤" className="space-y-2">
            {steps.map((item, index) => {
              const StepIcon = item.icon;
              return <button key={item.eyebrow} onClick={() => setCurrent(index)} aria-current={index === current ? "step" : undefined} className={`interactive flex w-full items-center gap-3 rounded-apple border px-4 py-3 text-left ${index === current ? "border-brand/25 bg-brand/[.07] text-ink" : "border-transparent text-muted hover:bg-ink/[.035]"}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-appleSm ${index === current ? "bg-brand text-white" : "bg-ink/[.06]"}`}><StepIcon size={16}/></span>
                <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[.1em] text-brand">{item.eyebrow}</span><span className="mt-0.5 block truncate text-sm font-medium">{item.preview}</span></span>
                <ArrowRight size={14} className="ml-auto shrink-0"/>
              </button>;
            })}
          </nav>

          <article className="interactive-card overflow-hidden rounded-appleXl border bg-surface">
            <div className="flex min-h-14 items-center border-b px-5"><span className="grid h-8 w-8 place-items-center rounded-appleSm bg-brand/10 text-brand"><Icon size={16}/></span><span className="ml-3 text-sm font-medium">{step.preview}</span><span className="ml-auto hidden items-center gap-1 text-[11px] text-status-ok sm:flex"><Check size={12}/>实现可验证</span></div>
            <div className="p-6 sm:p-8">
              <div className="text-xs font-semibold uppercase tracking-[.14em] text-brand">{step.eyebrow}</div>
              <h3 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight tracking-[-.025em]">{step.title}</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">{step.text}</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-3">{step.rows.map((row, index) => <div key={row} className="rounded-apple bg-ink/[.035] p-4"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{index + 1}</span><p className="mt-3 text-sm leading-6">{row}</p></div>)}</div>
              <div className="mt-5 flex items-start gap-2 rounded-apple bg-status-ok/[.07] px-4 py-3 text-xs leading-5 text-status-ok"><ShieldCheck size={14} className="mt-0.5 shrink-0"/><strong>{step.proof}</strong></div>
              <Link href={step.href} className="btn-primary mt-5 min-h-11 w-full sm:w-auto">{step.action}<ArrowRight size={14}/></Link>
            </div>
          </article>
        </div>
      </section>

      <section className="border-t py-10 lg:py-14">
        <div className="mb-7 max-w-2xl"><div className="eyebrow text-brand">评分证据</div><h2 className="mt-2 text-3xl font-semibold tracking-[-.035em]">四个维度，一条故事线</h2></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{scoreEvidence.map(({ value, title, text, icon: EvidenceIcon }) => <article key={title} className="rounded-appleLg border bg-surface p-5"><div className="flex items-center"><span className="grid h-9 w-9 place-items-center rounded-appleSm bg-ink text-canvas"><EvidenceIcon size={16}/></span><span className="ml-auto text-2xl font-semibold tracking-tight text-brand">{value}</span></div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{text}</p></article>)}</div>
      </section>

      <section className="mb-8 rounded-appleXl bg-ink px-6 py-8 text-canvas sm:flex sm:items-center sm:px-8">
        <div><div className="text-xs font-semibold uppercase tracking-[.14em] text-canvas/55">现场建议</div><h2 className="mt-2 text-2xl font-semibold tracking-tight">现在进入隔离项目，亲手跑一遍可信分析。</h2><p className="mt-2 text-sm leading-6 text-canvas/65">系统会选中演示研究文件夹；运行后可继续查看产物血缘、复现记录与长期记忆。</p></div>
        <button onClick={() => void enterDemo()} disabled={preparing} className="btn mt-5 min-h-11 shrink-0 bg-canvas px-5 text-ink hover:bg-white sm:ml-auto sm:mt-0"><PlayCircle size={15}/>{preparing ? "准备中…" : quality ? "开始真实演示" : "准备并检查"}</button>
      </section>
    </main>
  </div>;
}

function DemoReadiness({ quality }: { quality: QualityReport }) {
  const routes = [
    { href: "/knowledge", label: "1. 检索证据" },
    { href: "/analysis", label: "2. 动态分析" },
    { href: "/results", label: "3. 产物与血缘" },
    { href: "/results?tab=writing", label: "4. 三查与修复" },
    { href: "/memory", label: "5. 长期记忆" },
  ];
  const nextMetric = quality.metrics.find((item) => item.state === "block") ?? quality.metrics.find((item) => item.state === "warn");
  const nextAction = nextMetric ? qualityActions[nextMetric.key] : { href: "/analysis", label: "继续真实演示" };
  return <section aria-label="演示就绪检查" className="mb-10 rounded-appleXl border bg-surface p-6 lg:p-8">
    <div className="flex flex-wrap items-start gap-4"><div><div className="eyebrow text-brand">真实项目预检</div><h2 className="mt-2 text-2xl font-semibold">{quality.ready_for_demo ? "可信闭环已就绪" : "演示项目已隔离，按主线补齐证据"}</h2><p className="mt-2 text-sm text-muted">以下数字直接读取项目账本，不是静态演示文案。</p></div><span className={`ml-auto rounded-full px-3 py-2 text-xs font-semibold ${quality.ready_for_demo ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{quality.ready_for_demo ? "READY" : `${quality.blockers.length} 项待完成`}</span></div>
    <div className="mt-6 grid gap-3 md:grid-cols-5">{quality.metrics.map((item) => {
      const action = qualityActions[item.key] ?? { href: "/results", label: "查看证据" };
      return <Link key={item.key} href={action.href} aria-label={`${item.title}：${action.label}`} className="interactive-card rounded-apple border bg-ink/[.025] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"><div className={`text-2xl font-semibold ${item.state === "ready" ? "text-status-ok" : item.state === "block" ? "text-status-err" : "text-status-warn"}`}>{item.ratio == null ? item.value : `${Math.round(item.ratio * 100)}%`}</div><h3 className="mt-2 text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-muted">{item.evidence}</p><span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand">{action.label}<ArrowRight size={11}/></span></Link>;
    })}</div>
    {quality.blockers.length > 0 && <div className="mt-5 rounded-apple bg-status-warn/[.07] p-4 text-sm text-muted"><strong className="text-status-warn">当前待完成</strong><ul className="mt-2 space-y-1">{quality.blockers.map((item) => <li key={item}>• {item}</li>)}</ul></div>}
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-apple border border-brand/15 bg-brand/[.045] p-4"><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-brand">推荐下一步</div><p className="mt-1 text-sm leading-6 text-muted">{quality.next_actions[0] ?? (quality.ready_for_demo ? "所有关键证据已经齐备，可以进入真实分析继续演示。" : `先完成“${nextMetric?.title ?? "当前检查"}”，系统会自动刷新后续建议。`)}</p></div><Link href={nextAction.href} className="btn-primary min-h-10 shrink-0 px-4">{nextAction.label}<ArrowRight size={13}/></Link></div>
    <nav aria-label="三分钟演示主线" className="mt-5 flex flex-wrap gap-2">{routes.map((item) => <Link key={item.href} href={item.href} className="btn-secondary min-h-10 px-3">{item.label}<ArrowRight size={13}/></Link>)}</nav>
  </section>;
}

function RuntimePanel({ runtime, error }: { runtime?: RuntimeStatus; error: string }) {
  if (error) return <div className="rounded-appleXl border border-status-err/20 bg-status-err/[.05] p-6"><div className="flex items-center gap-2 text-sm font-semibold text-status-err"><AlertTriangle size={16}/>演示环境暂不可达</div><p className="mt-3 text-sm leading-6 text-muted">{error}</p><Link href="/settings#system-status" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand">查看恢复方式<ArrowRight size={14}/></Link></div>;
  if (!runtime) return <div className="rounded-appleXl border bg-surface p-6"><div className="flex items-center gap-2 text-sm font-semibold"><LoaderCircle size={16} className="animate-spin text-brand"/>正在检查真实运行环境</div><div className="mt-5 space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-apple bg-ink/[.05]"/>)}</div></div>;
  return <div className="rounded-appleXl border bg-surface p-6">
    <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-apple ${runtime.state === "ready" ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}><Server size={18}/></span><div><div className="text-sm font-semibold">真实运行环境</div><p className="mt-0.5 text-xs text-muted">{runtime.summary}</p></div></div>
    <div className="mt-5 space-y-2">{runtime.components.map((item) => <div key={item.key} className="flex min-h-12 items-center rounded-apple bg-ink/[.035] px-3"><span className={`h-2 w-2 rounded-full ${item.state === "ready" ? "bg-status-ok" : item.state === "offline" ? "bg-status-err" : "bg-status-warn"}`}/><span className="ml-3 text-sm font-medium">{item.title}</span><span className="ml-auto max-w-[55%] truncate text-xs text-muted">{item.message}</span></div>)}</div>
    {runtime.state !== "ready" && <Link href="/settings#system-status" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">查看受影响能力与恢复方式<ArrowRight size={14}/></Link>}
  </div>;
}
