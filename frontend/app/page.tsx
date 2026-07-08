"use client";

import {
  ArrowRight, BookOpen, CheckCircle2, Database, FileCheck2, FlaskConical,
  PenLine, PlayCircle, RefreshCw, ShieldCheck, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SuggestionCard } from "@/components/SuggestionCard";
import { api, type CollectionItem, type DocumentItem, type SuggestionItem } from "@/lib/api";

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

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextSuggestions, nextDocuments, nextCollections] = await Promise.all([
        api.suggestions(), api.documents(), api.collections(),
      ]);
      setSuggestions(nextSuggestions); setDocuments(nextDocuments); setCollections(nextCollections);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "工作台加载失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true); setError("");
    try { const result = await api.refreshSuggestions(); setSuggestions(result.items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "建议生成失败"); }
    finally { setRefreshing(false); }
  }

  const hasMaterial = documents.length > 0;

  return <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10">
    <header className="flex flex-col gap-5 border-b pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="text-xs font-medium text-slate-400">ReproLab 工作台</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">今天想推进哪一步？</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">从资料、数据或结论开始。每个最终结果都会保留数据、代码、环境和出处。</p></div>
      <div className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><ShieldCheck size={13}/>可信记录已启用</div>
    </header>

    {error && <div className="mt-5 flex items-center gap-3 border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => void load()} className="ml-auto underline">重新连接</button></div>}

    <section className="py-8"><div className="mb-4"><h2 className="font-semibold">开始一项任务</h2><p className="mt-1 text-sm text-slate-500">无需理解全部模块，选择最接近你当前目标的一项。</p></div><div className="grid gap-3 md:grid-cols-3">{tasks.map(({ href, title, detail, action, icon: Icon }, index) => <Link key={href} href={href} className="group flex min-h-48 flex-col border p-5 transition hover:border-slate-400 hover:bg-white dark:border-slate-800 dark:hover:bg-slate-900"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Icon size={18}/></span><span className="text-xs text-slate-300">0{index + 1}</span></div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p><span className="mt-auto inline-flex items-center gap-1 pt-5 text-xs font-medium text-brand">{action}<ArrowRight size={12} className="transition group-hover:translate-x-0.5"/></span></Link>)}</div></section>

    <section className="grid gap-8 border-y py-7 lg:grid-cols-[1fr_300px]">
      <div><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">当前研究进度</h2><p className="mt-1 text-sm text-slate-500">沿着可信闭环继续，而不是在页面之间猜下一步。</p></div></div><div className="grid gap-0 sm:grid-cols-4">{[
        { label: "资料入库", detail: `${documents.length} 份资料`, complete: hasMaterial, icon: Database },
        { label: "限定范围", detail: `${collections.length} 个空间`, complete: collections.length > 0, icon: BookOpen },
        { label: "运行分析", detail: "生成可信产物", complete: false, icon: FlaskConical },
        { label: "写入结论", detail: "校验后保存", complete: false, icon: FileCheck2 },
      ].map(({ label, detail, complete, icon: Icon }, index) => <div key={label} className="relative flex gap-3 py-3 sm:block sm:pr-4"><div className="flex items-center"><span className={`grid h-8 w-8 place-items-center rounded-full ${complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>{complete ? <CheckCircle2 size={15}/> : <Icon size={14}/>}</span>{index < 3 && <span className="mx-2 hidden h-px flex-1 bg-slate-200 dark:bg-slate-800 sm:block"/>}</div><div className="sm:mt-3"><div className="text-sm font-medium">{label}</div><div className="mt-0.5 text-xs text-slate-400">{detail}</div></div></div>)}</div></div>
      <aside className="border-l-0 lg:border-l lg:pl-7"><div className="text-xs font-medium text-slate-400">建议下一步</div>{hasMaterial ? <><h3 className="mt-2 font-semibold">用现有资料开始一次分析</h3><p className="mt-2 text-sm leading-6 text-slate-500">资料已经准备好。选择数据提出问题，系统会记录完整运行过程。</p><Link href="/analysis" className="btn-primary mt-4">开始分析<ArrowRight size={14}/></Link></> : <><h3 className="mt-2 font-semibold">还没有研究资料</h3><p className="mt-2 text-sm leading-6 text-slate-500">添加自己的文献或数据后，研究进度会从这里开始记录。</p><Link href="/knowledge" className="btn-primary mt-4">添加资料<ArrowRight size={14}/></Link><Link href="/demo" className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand"><PlayCircle size={13}/>先观看产品演示</Link></>}</aside>
    </section>

    <section className="pt-8"><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="font-semibold">基于证据的下一步</h2><p className="mt-1 text-sm text-slate-500">建议只引用已入库资料和真实分析结果。</p></div><button onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"><RefreshCw size={13} className={refreshing ? "animate-spin" : ""}/>{refreshing ? "生成中" : "刷新"}</button></div>
      {loading ? <div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse bg-slate-100 dark:bg-slate-800"/>)}</div> : suggestions.length ? <div className="grid gap-3 md:grid-cols-3">{suggestions.slice(0, 3).map((item) => <SuggestionCard key={item.id} item={item}/>)}</div> : <div className="flex items-center gap-4 border-y py-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-400"><Sparkles size={16}/></span><div><div className="text-sm font-medium">完成一次分析后，这里会出现有依据的研究建议</div><div className="mt-1 text-xs text-slate-400">不会凭空生成下一步。</div></div></div>}
    </section>
  </div>;
}
