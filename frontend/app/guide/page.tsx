import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Code2,
  Database,
  FileCheck2,
  FlaskConical,
  HelpCircle,
  History,
  Layers3,
  Lightbulb,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import Link from "next/link";

const workflow = [
  { number: "01", title: "建立研究范围", text: "为课题创建独立项目，上传数据、论文、笔记、代码或完整文件夹。", href: "/knowledge", icon: Database },
  { number: "02", title: "直接提出问题", text: "像聊天一样描述目标，Agent 会先读取当前项目，再规划检索或分析步骤。", href: "/analysis", icon: FlaskConical },
  { number: "03", title: "检查回答与来源", text: "查看结论、图表和数字；点击蓝色锚点即可追溯数据、代码与环境。", href: "/results", icon: Network },
  { number: "04", title: "选择值得沉淀的内容", text: "只有你主动保存的成果才进入报告；通过校验后再发布可信结论。", href: "/results?tab=writing", icon: FileCheck2 },
];

const ragStages = [
  { label: "范围过滤", text: "先按当前项目、资料夹、年份与类型收窄证据范围" },
  { label: "双路召回", text: "BM25 捕捉关键词，BGE-M3 + pgvector 理解语义" },
  { label: "结果融合", text: "RRF 合并两路排序，兼顾精确匹配与语义相近" },
  { label: "精细重排", text: "bge-reranker-v2-m3 对候选段落再次相关性排序" },
  { label: "带来源回答", text: "回答必须携带 ⟦src_xxxx⟧，可以回到原文位置" },
];

const memories = [
  { title: "情节记忆", label: "Episodic", text: "保留一次研究会话发生了什么，方便回到当时的任务背景。", icon: History },
  { title: "语义记忆", label: "Semantic", text: "沉淀研究偏好、方法选择与领域事实，并按当前问题相关性召回。", icon: Brain },
  { title: "技能记忆", label: "Skill", text: "把验证过的流程固化为可复用技能，但不会限制 Agent 的动态分析范围。", icon: Sparkles },
];

const capabilities = [
  { title: "资料与复杂检索", text: "管理多源文件，进行项目内混合检索与有引用的资料问答。", href: "/knowledge", icon: BookOpen },
  { title: "动态数据分析", text: "根据自然语言问题现场生成 Python，而不是从固定学科菜单中选择。", href: "/analysis", icon: Code2 },
  { title: "长期记忆", text: "查看、编辑和管理项目内沉淀的会话、知识与方法记忆。", href: "/memory", icon: Brain },
  { title: "SkillHub", text: "发现与当前数据结构匹配的技能，查看字段契约后再决定是否应用。", href: "/analysis", icon: Lightbulb },
  { title: "成果与写作", text: "只使用主动保存的高价值产物生成报告，并逐项检查数字与引用。", href: "/results?tab=writing", icon: FileCheck2 },
  { title: "溯源与复现", text: "沿血缘查看输入、运行和产物，固定随机种子一键重跑比对。", href: "/results?tab=lineage", icon: RefreshCw },
];

export default function GuidePage() {
  return (
    <div className="page-shell max-w-6xl space-y-20 pb-20">
      <section className="overflow-hidden rounded-appleXl bg-ink px-7 py-12 text-white sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-white/55">
          <HelpCircle size={15} /> ReproLab · Product guide
        </div>
        <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] sm:text-5xl lg:text-[56px]">
          不只是回答问题，
          <br />而是交付可验证的研究结果。
        </h1>
        <p className="mt-6 max-w-3xl text-[17px] leading-8 text-white/70">
          ReproLab 是面向科研工作的可信 Agent。它把资料检索、数据分析、长期记忆、结果复现与报告写作放进同一个项目空间，让每个关键数字、图表和引用都能回到真实来源。
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/knowledge" className="btn-primary">开始一个研究项目<ArrowRight size={15} /></Link>
          <Link href="/analysis" className="btn border border-white/20 bg-white/10 text-white hover:bg-white/15">进入研究 Agent<ArrowRight size={15} /></Link>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-appleLg bg-white/10 sm:grid-cols-3">
          {[
            ["项目级隔离", "资料、对话、记忆与成果各自归属于当前研究项目"],
            ["动态分析", "按问题和真实字段规划，不把研究限制为固定模板"],
            ["可信结果", "数字、图表和引用都经过锚点、血缘与重跑校验"],
          ].map(([title, text]) => (
            <div key={title} className="bg-white/[.055] p-5">
              <div className="text-sm font-semibold text-white">{title}</div>
              <p className="mt-2 text-sm leading-6 text-white/55">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="eyebrow text-brand">产品核心</div>
        <h2 className="section-title mt-2 max-w-3xl">让 AI 参与研究，同时保留研究者对证据和成果的控制。</h2>
        <p className="mt-4 max-w-3xl text-[17px] leading-7 text-muted">
          普通对话工具通常只留下最终文本。ReproLab 会把文件、检索证据、代码运行、分析产物、结论和报告连接为一个持续工作的研究上下文。
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            { icon: Search, title: "找到真正相关的证据", text: "关键词与语义检索并行工作，重排后只把最相关的原文交给模型，回答可点击回到来源。" },
            { icon: Workflow, title: "把问题变成可执行分析", text: "Agent 先规划，再生成代码并在隔离环境中运行；失败时依据真实报错自检修正。" },
            { icon: ShieldCheck, title: "把结果变成可信结论", text: "每项产物都绑定数据、代码和环境。无来源数字或不被文献支持的论断会被校验拦截。" },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-appleLg border bg-white p-6">
              <span className="grid h-11 w-11 place-items-center rounded-appleSm bg-brand/10 text-brand"><Icon size={20} /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-.02em]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="rag" className="scroll-mt-24 rounded-appleXl bg-[#f5f5f7] p-6 sm:p-10 lg:p-12">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div>
            <div className="eyebrow text-brand">复杂检索 · RAG</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">不是一次搜索，<br />而是一条证据筛选流水线。</h2>
            <p className="mt-5 text-[17px] leading-7 text-muted">
              系统先确定研究范围，再同时进行词法与语义召回。融合、重排后的证据才进入回答，并通过来源锚点保留原文定位。
            </p>
            <div className="mt-7 rounded-appleLg bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><Layers3 size={17} className="text-brand" />适合多源异构科研资料</div>
              <p className="mt-2 text-sm leading-6 text-muted">论文、PDF、表格、代码、Notebook、Markdown 与文件夹可放在同一项目中；文本进入全文索引，表格保留结构化字段用于查询和分析。</p>
              <Link href="/knowledge" className="text-link mt-4">打开资料空间<ArrowRight size={14} /></Link>
            </div>
          </div>
          <div className="space-y-3">
            {ragStages.map((stage, index) => (
              <div key={stage.label} className="flex gap-4 rounded-appleLg bg-white p-4 sm:p-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">{index + 1}</span>
                <div><h3 className="font-semibold">{stage.label}</h3><p className="mt-1 text-sm leading-6 text-muted">{stage.text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="agent" className="scroll-mt-24 grid gap-5 lg:grid-cols-2">
        <article className="rounded-appleXl bg-ink p-7 text-white sm:p-10">
          <div className="eyebrow text-[#2997ff]">Agent 执行引擎</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em]">规划、执行、自检，形成分析闭环。</h2>
          <p className="mt-4 text-[17px] leading-7 text-white/65">Planner 将自然语言问题拆成最小步骤，Executor 动态生成并运行 Python，Critic 依据真实产物组织回答并检查证据。</p>
          <div className="mt-7 space-y-3">
            {[
              ["Planner", "结合数据字段、项目记忆与可选技能制定计划"],
              ["Executor", "在持久 Kernel / Docker 沙箱中执行，固定随机种子"],
              ["Critic", "根据运行结果作答；出错时读取日志并修正重试"],
            ].map(([title, text], index) => (
              <div key={title} className="flex gap-4 border-t border-white/10 pt-4 first:border-0 first:pt-0">
                <span className="text-sm font-semibold text-[#2997ff]">0{index + 1}</span>
                <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-white/55">{text}</p></div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-appleXl border bg-white p-7 sm:p-10">
          <div className="eyebrow text-brand">模型无关</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em]">能力属于工作流，<br />不被单一模型绑定。</h2>
          <p className="mt-4 text-[17px] leading-7 text-muted">业务层统一通过 ModelAdapter 调用模型。规划、执行和质检可以按角色选择不同模型，切换供应商不需要重写研究流程。</p>
          <div className="mt-8 rounded-appleLg bg-[#f5f5f7] p-5 font-mono text-sm leading-7 text-ink">
            <div><span className="text-brand">question</span> → planner</div>
            <div className="pl-6">→ executor + tools</div>
            <div className="pl-12">→ critic + evidence</div>
            <div className="pl-[4.5rem]">→ trusted answer</div>
          </div>
        </article>
      </section>

      <section id="memory" className="scroll-mt-24">
        <div className="eyebrow text-brand">长期记忆</div>
        <h2 className="section-title mt-2">越用越懂你的研究，但不会把旧信息盲目带入新问题。</h2>
        <p className="mt-4 max-w-3xl text-[17px] leading-7 text-muted">
          每个项目拥有独立记忆。系统从对话中提取候选内容，语义记忆写入向量索引；下一次任务只召回与当前问题相关、仍在有效期且重要度合格的内容。
        </p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {memories.map(({ title, label, text, icon: Icon }) => (
            <article key={title} className="rounded-appleLg border bg-white p-6">
              <div className="flex items-center justify-between"><Icon size={20} className="text-brand" /><span className="text-xs font-semibold uppercase tracking-[.12em] text-subtle">{label}</span></div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
            </article>
          ))}
        </div>
        <div className="mt-4 grid gap-4 rounded-appleLg bg-[#f5f5f7] p-5 sm:grid-cols-4 sm:p-6">
          {[
            ["语义优先", "向量相似度召回"],
            ["稳定降级", "Embedding 不可用时转关键词"],
            ["时间衰减", "30 天半衰期参与排序"],
            ["使用前校验", "过期或低重要度记忆不进入上下文"],
          ].map(([title, text]) => <div key={title}><div className="text-sm font-semibold">{title}</div><p className="mt-1 text-xs leading-5 text-muted">{text}</p></div>)}
        </div>
        <Link href="/memory" className="text-link mt-5">管理项目记忆<ArrowRight size={14} /></Link>
      </section>

      <section id="provenance" className="scroll-mt-24 rounded-appleXl border bg-white p-7 sm:p-10 lg:p-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_.9fr] lg:items-center">
          <div>
            <div className="eyebrow text-brand">可信溯源与复现</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">每个结果都有一条可重跑的证据链。</h2>
            <p className="mt-5 text-[17px] leading-7 text-muted">系统不是只保存一张图或一个数字，而是同时登记它读取了什么数据、运行了什么代码、使用了什么环境，以及最终产生了什么。</p>
            <div className="mt-6 rounded-appleLg bg-[#f5f5f7] p-5 font-mono text-xs leading-6 sm:text-sm">
              code_hash = sha256(code + lang + input_hash + env_hash)
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">数据、代码或环境任一变化，信任锚点都会变化；数值按容差比对，图表按结构化数据重放，避免用图片像素哈希制造误报。</p>
          </div>
          <div className="space-y-3">
            {[
              [Database, "Dataset", "内容寻址的原始数据"],
              [Code2, "Run", "代码、随机种子与环境快照"],
              [FlaskConical, "Artifact", "数字、表格或图表产物"],
              [CheckCircle2, "Claim", "带锚点并通过校验的结论"],
            ].map(([Icon, title, text], index) => {
              const NodeIcon = Icon as typeof Database;
              return <div key={String(title)} className="relative flex items-center gap-4 rounded-appleLg border p-4">
                <span className="grid h-10 w-10 place-items-center rounded-appleSm bg-brand/10 text-brand"><NodeIcon size={18} /></span>
                <div><h3 className="text-sm font-semibold">{String(title)}</h3><p className="mt-1 text-xs text-muted">{String(text)}</p></div>
                {index < 3 && <span className="absolute -bottom-3 left-9 z-10 text-xs text-subtle">↓</span>}
              </div>;
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="eyebrow">功能地图</div>
        <h2 className="section-title mt-2">理解核心之后，可以从任何真实任务开始。</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(({ title, text, href, icon: Icon }) => (
            <Link key={title} href={href} className="interactive-card group">
              <span className="grid h-10 w-10 place-items-center rounded-appleSm bg-brand/10 text-brand"><Icon size={18} /></span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">打开功能<ArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="eyebrow text-brand">上手路径</div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="section-title">按四步完成一次研究闭环</h2><p className="mt-2 text-[17px] text-muted">从真实资料开始，最终只沉淀你确认有价值的成果。</p></div>
          <Link href="/knowledge" className="text-link text-[17px]">从资料入库开始<ArrowRight size={14} /></Link>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {workflow.map(({ number, title, text, href, icon: Icon }) => (
            <Link key={number} href={href} className="interactive-card group flex gap-4">
              <span className="text-3xl font-semibold text-subtle group-hover:text-brand">{number}</span>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-appleSm bg-brand/10 text-brand"><Icon size={18} /></span>
              <span><strong className="block font-semibold">{title}</strong><span className="mt-1 block text-sm leading-6 text-muted">{text}</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">前往此步骤<ArrowRight size={13} /></span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-appleLg border bg-[#f5f5f7] p-6">
          <h3 className="font-semibold">运行条件</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted"><li>• 后端与 PostgreSQL / pgvector 正常运行。</li><li>• 分析与问答已配置兼容的模型 API。</li><li>• 最终复现验收使用隔离的 Docker 沙箱。</li></ul>
        </article>
        <article className="rounded-appleLg border bg-brand/[.06] p-6">
          <h3 className="font-semibold text-brand">可信边界</h3>
          <p className="mt-3 text-sm leading-6 text-muted">没有 ⟦art_xxxx⟧ 的关键数字和没有 ⟦src_xxxx⟧ 的文献事实，不应直接进入可信结论。ReproLab 会提示问题，但最后是否保存和发布始终由你决定。</p>
          <Link href="/results?tab=writing" className="text-link mt-4">进入写作面板<ArrowRight size={14} /></Link>
        </article>
      </section>
    </div>
  );
}
