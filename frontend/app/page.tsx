"use client";

import { ArrowRight, BookOpen, Brain, FlaskConical, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SuggestionCard } from "@/components/SuggestionCard";
import { api, SuggestionItem } from "@/lib/api";

export default function Home() {
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setError(""); setItems(await api.suggestions()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "建议加载失败"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function refresh() {
    setRefreshing(true); setError("");
    try { const result = await api.refreshSuggestions(); setItems(result.items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "建议生成失败"); }
    finally { setRefreshing(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-7 p-5 lg:p-8">
    <section className="overflow-hidden rounded-2xl bg-slate-950 p-7 text-white lg:p-9"><div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-blue-300"><Sparkles size={15}/>可信、可复现的科研工作台</div><h1 className="text-3xl font-semibold leading-tight">让每个结论都能沿着证据链回到数据。</h1><p className="mt-3 text-sm leading-6 text-slate-300">上传资料，提出分析问题，系统会保留数据、代码和运行环境，方便随时核查与重跑。</p></div><div className="mt-7 flex flex-wrap gap-3"><Link href="/knowledge" className="btn-primary">上传第一份资料 <ArrowRight size={15}/></Link><Link href="/analysis" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-4 text-sm hover:bg-slate-900">进入分析</Link></div></section>

    <section><div className="mb-4 flex items-start justify-between gap-3 sm:items-end"><div><div className="label">下一步建议</div><h2 className="mt-1 text-xl font-semibold">基于现有资料继续推进</h2><p className="mt-1 text-sm text-slate-500">建议只会引用已经入库的资料和分析结果。</p></div><button onClick={() => void refresh()} disabled={refreshing} className="btn-secondary shrink-0 whitespace-nowrap"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""}/><span className="hidden sm:inline">{refreshing ? "生成中" : "刷新建议"}</span><span className="sm:hidden">刷新</span></button></div>
      {error && <div className="mb-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button onClick={() => void load()} className="ml-auto shrink-0 underline">重新连接</button></div>}
      {loading ? <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-xl bg-slate-100"/>)}</div> : items.length ? <div className="grid gap-4 md:grid-cols-3">{items.map((item) => <SuggestionCard key={item.id} item={item}/>)}</div> : <div className="card p-8 text-center"><Sparkles className="mx-auto text-slate-300"/><h3 className="mt-3 font-medium">资料准备好后，这里会给出下一步建议</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">先上传论文或数据，再完成一次分析。建议会说明依据，不会凭空生成。</p><Link href="/knowledge" className="btn-secondary mt-4">去上传资料<ArrowRight size={14}/></Link></div>}
    </section>

    <section className="grid gap-4 md:grid-cols-3">{[
      { href: "/knowledge", label: "知识库", detail: "入库与混合检索", icon: BookOpen },
      { href: "/analysis", label: "分析对话", detail: "动态代码与可信产物", icon: FlaskConical },
      { href: "/memory", label: "科研记忆", detail: "偏好召回与时效核验", icon: Brain },
    ].map(({ href, label, detail, icon: Icon }) => <Link key={href} href={href} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-blue-200"><span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-brand"><Icon size={18}/></span><span><span className="block font-medium">{label}</span><span className="text-xs text-slate-500">{detail}</span></span><ArrowRight size={15} className="ml-auto text-slate-300"/></Link>)}</section>
  </div>;
}
