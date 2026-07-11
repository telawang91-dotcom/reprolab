"use client";

import {
  ArrowRight, BookOpen, CheckCircle2, Clock3, Database, FileCheck2, FileText, FlaskConical,
  PenLine, PlayCircle, RefreshCw, ShieldCheck, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SuggestionCard } from "@/components/SuggestionCard";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { api, setActiveProjectId, type CollectionItem, type DocumentItem, type SuggestionItem } from "@/lib/api";

const tasks = [
  { href: "/knowledge", title: "查资料与问文献", detail: "建立知识空间，答案只来自你选定的资料。", action: "进入知识空间", icon: BookOpen },
  { href: "/analysis", title: "分析一份数据", detail: "用自然语言生成代码，运行并保存可信产物。", action: "开始数据分析", icon: FlaskConical },
  { href: "/writing", title: "整理可信结论", detail: "把图表和数字写进报告，自动检查来源。", action: "打开写作面板", icon: PenLine },
];

export default function Home() {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [preparingDemo, setPreparingDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextSuggestions, nextDocuments, nextCollections] = await Promise.allSettled([
        api.suggestions(), api.documents(), api.collections(),
      ] as const);
      if (nextDocuments.status === "fulfilled") setDocuments(nextDocuments.value);
      else setError(nextDocuments.reason instanceof Error ? nextDocuments.reason.message : "资料加载失败");
      if (nextCollections.status === "fulfilled") setCollections(nextCollections.value);
      else setError(nextCollections.reason instanceof Error ? nextCollections.reason.message : "知识空间加载失败");
      setSuggestions(nextSuggestions.status === "fulfilled" ? nextSuggestions.value : []);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true); setError("");
    try { const result = await api.refreshSuggestions(); setSuggestions(result.items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "建议生成失败"); }
    finally { setRefreshing(false); }
  }

  async function prepareDemo() {
    setPreparingDemo(true); setError("");
    try { const project = await api.prepareDemo(); setActiveProjectId(project.id); window.location.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "演示项目准备失败"); }
    finally { setPreparingDemo(false); }
  }

  const hasMaterial = documents.length > 0;
  const isEmptyWorkspace = !loading && documents.length === 0 && collections.length === 0;
  const recentDocuments = [...documents].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 4);
  const recentCollections = [...collections].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 3);

  return <div className="mx-auto max-w-6xl px-5 py-7 lg:px-8 lg:py-9">
    <header className="aurora-hero px-6 py-11 text-center sm:px-10 sm:py-16">
      <span className="aurora-orb -left-20 top-8 h-56 w-56 bg-indigo-300/30"/><span className="aurora-orb -right-12 bottom-0 h-64 w-64 bg-blue-200/25"/><span className="aurora-orb left-[45%] top-3 h-32 w-32 bg-white/15"/>
      <div className="relative"><div className="eyebrow text-indigo-100">ReproLab</div><h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-[-.05em] sm:text-6xl">从一个问题开始。</h1><p className="mx-auto mt-5 max-w-2xl text-[17px] leading-7 text-indigo-100">把资料、数据和想法放到同一个工作区，然后继续推进你的研究。</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/knowledge" className="btn-primary">添加资料<ArrowRight size={15}/></Link><Link href="/analysis" className="btn-secondary border-white/25 bg-white/10 text-white hover:bg-white/20">开始分析</Link></div></div>
    </header>

    {error && <div className="mt-5 flex items-center gap-3 border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => void load()} className="ml-auto underline">重新连接</button></div>}

    <GettingStarted documentCount={documents.length} collectionCount={collections.length}/>

    {isEmptyWorkspace ? <section className="glass-card my-7 grid gap-8 p-7 dark:bg-slate-900/80 lg:grid-cols-[1fr_360px] lg:p-10">
      <div><div className="text-xs font-medium text-slate-400">从这里开始</div><h2 className="mt-2 text-2xl font-semibold tracking-tight">先添加一份资料。</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">上传论文、笔记或数据，之后就可以检索、分析和写作。也可以先用示例项目熟悉界面。</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/knowledge" className="btn-primary">添加资料<ArrowRight size={14}/></Link><button onClick={() => void prepareDemo()} disabled={preparingDemo} className="btn-secondary"><PlayCircle size={14}/>{preparingDemo ? "准备示例中…" : "使用示例体验"}</button></div><p className="mt-3 text-xs text-slate-400">示例会在独立项目中打开，不会影响当前资料。</p></div>
      <div className="rounded-[18px] bg-gradient-to-br from-[#eef0ff] via-white to-[#edf4ff] p-5 dark:from-indigo-950/50 dark:via-slate-900 dark:to-slate-900"><div className="text-sm font-semibold">你可以做什么</div><div className="mt-4 space-y-3">{[["上传资料", "/knowledge"], ["分析数据", "/analysis"], ["整理写作", "/writing"]].map(([item, href], index) => <Link key={item} href={href} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/75 dark:hover:bg-white/[.06]"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-medium text-white ${index === 0 ? "bg-indigo-500" : index === 1 ? "bg-blue-500" : "bg-slate-700"}`}>{index + 1}</span><span className="text-sm">{item}</span><ArrowRight size={14} className="ml-auto text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand"/></Link>)}</div></div>
    </section> : <section className="py-8"><div className="mb-5"><div className="eyebrow text-brand">Research launchpad</div><h2 className="section-title mt-1">今天，先推进一件事。</h2><p className="mt-1 text-sm text-slate-500">无需理解全部模块，选择最接近你当前目标的一项。</p></div><div className="grid gap-4 md:grid-cols-3">{tasks.map(({ href, title, detail, action, icon: Icon }, index) => <Link key={href} href={href} className="interactive-card group relative flex min-h-52 flex-col overflow-hidden"><span className={`absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${index === 0 ? "bg-sky-200/80" : index === 1 ? "bg-violet-200/80" : "bg-fuchsia-200/80"}`}/><div className="relative flex items-start justify-between"><span className={`grid h-11 w-11 place-items-center rounded-2xl text-white shadow-lg ${index === 0 ? "bg-gradient-to-br from-sky-400 to-blue-600" : index === 1 ? "bg-gradient-to-br from-violet-400 to-indigo-600" : "bg-gradient-to-br from-fuchsia-400 to-violet-600"}`}><Icon size={19}/></span><span className="text-xs text-slate-300">0{index + 1}</span></div><h3 className="relative mt-6 text-lg font-semibold">{title}</h3><p className="relative mt-2 text-sm leading-6 text-slate-500">{detail}</p><span className="relative mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-brand">{action}<ArrowRight size={14} className="transition group-hover:translate-x-1"/></span></Link>)}</div></section>}

    {!isEmptyWorkspace && <section className="mb-7 grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><div className="mb-4 flex items-center justify-between"><div><div className="flex items-center gap-2 font-semibold"><Clock3 size={16} className="text-brand"/>最近资料</div><p className="mt-1 text-xs text-slate-400">回到刚刚添加或查看的研究材料。</p></div><Link href="/knowledge" className="text-xs font-medium text-brand">查看全部</Link></div>{recentDocuments.length ? <div className="divide-y dark:divide-slate-800">{recentDocuments.map((doc) => <Link key={doc.id} href={`/knowledge?document=${doc.id}`} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"><FileText size={15}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{doc.title || doc.filename}</span><span className="mt-0.5 block truncate text-xs text-slate-400">{doc.filename}</span></span><ArrowRight size={13} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand"/></Link>)}</div> : <div className="border-t pt-4 text-sm text-slate-400">还没有资料。</div>}</div>
      <aside className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><div className="mb-4 flex items-center justify-between"><div className="font-semibold">最近空间</div><Link href="/knowledge" className="text-xs font-medium text-brand">管理</Link></div>{recentCollections.length ? <div className="space-y-2">{recentCollections.map((item) => <Link key={item.id} href={`/knowledge?collection=${item.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><BookOpen size={14} className="text-slate-400"/><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-xs text-slate-400">{item.document_count}</span></Link>)}</div> : <div className="rounded-lg border border-dashed p-4 text-sm leading-6 text-slate-500">还没有知识空间。<Link href="/knowledge" className="mt-1 block font-medium text-brand">新建一个空间 →</Link></div>}</aside>
    </section>}

    {false && !isEmptyWorkspace && <section className="grid gap-8 border-y py-7 lg:grid-cols-[1fr_300px]">
      <div><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">当前研究进度</h2><p className="mt-1 text-sm text-slate-500">沿着可信闭环继续，而不是在页面之间猜下一步。</p></div></div><div className="grid gap-0 sm:grid-cols-4">{[
        { label: "资料入库", detail: `${documents.length} 份资料`, complete: hasMaterial, icon: Database },
        { label: "限定范围", detail: `${collections.length} 个空间`, complete: collections.length > 0, icon: BookOpen },
        { label: "运行分析", detail: "生成可信产物", complete: false, icon: FlaskConical },
        { label: "写入结论", detail: "校验后保存", complete: false, icon: FileCheck2 },
      ].map(({ label, detail, complete, icon: Icon }, index) => <div key={label} className="relative flex gap-3 py-3 sm:block sm:pr-4"><div className="flex items-center"><span className={`grid h-8 w-8 place-items-center rounded-full ${complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>{complete ? <CheckCircle2 size={15}/> : <Icon size={14}/>}</span>{index < 3 && <span className="mx-2 hidden h-px flex-1 bg-slate-200 dark:bg-slate-800 sm:block"/>}</div><div className="sm:mt-3"><div className="text-sm font-medium">{label}</div><div className="mt-0.5 text-xs text-slate-400">{detail}</div></div></div>)}</div></div>
      <aside className="border-l-0 lg:border-l lg:pl-7"><div className="text-xs font-medium text-slate-400">建议下一步</div>{hasMaterial ? <><h3 className="mt-2 font-semibold">用现有资料开始一次分析</h3><p className="mt-2 text-sm leading-6 text-slate-500">资料已经准备好。选择数据提出问题，系统会记录完整运行过程。</p><Link href="/analysis" className="btn-primary mt-4">开始分析<ArrowRight size={14}/></Link></> : <><h3 className="mt-2 font-semibold">还没有研究资料</h3><p className="mt-2 text-sm leading-6 text-slate-500">添加自己的文献或数据后，研究进度会从这里开始记录。</p><Link href="/knowledge" className="btn-primary mt-4">添加资料<ArrowRight size={14}/></Link><Link href="/demo" className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand"><PlayCircle size={13}/>先观看产品演示</Link></>}</aside>
    </section>}

    {!isEmptyWorkspace && <section className="pt-8"><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="font-semibold">下一步</h2><p className="mt-1 text-sm text-slate-500">根据你当前项目里的内容继续。</p></div><button onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"><RefreshCw size={13} className={refreshing ? "animate-spin" : ""}/>{refreshing ? "生成中" : "刷新"}</button></div>
      {loading ? <div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse bg-slate-100 dark:bg-slate-800"/>)}</div> : suggestions.length ? <div className="grid gap-3 md:grid-cols-3">{suggestions.slice(0, 3).map((item) => <SuggestionCard key={item.id} item={item}/>)}</div> : <div className="flex items-center gap-4 border-y py-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-400"><Sparkles size={16}/></span><div><div className="text-sm font-medium">完成一次分析后，这里会出现有依据的研究建议</div><div className="mt-1 text-xs text-slate-400">不会凭空生成下一步。</div></div></div>}
    </section>}
  </div>;
}
