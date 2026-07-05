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
    <section className="overflow-hidden rounded-2xl bg-slate-950 p-7 text-white lg:p-9"><div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300"><Sparkles size={15}/>Reproducible research workspace</div><h1 className="text-3xl font-semibold leading-tight">让每个结论都能沿着证据链回到数据。</h1><p className="mt-3 text-sm leading-6 text-slate-300">知识、分析、溯源、校验与长期记忆在同一个工作台闭环。</p></div><div className="mt-7 flex flex-wrap gap-3"><Link href="/analysis" className="btn-primary">开始分析 <ArrowRight size={15}/></Link><Link href="/knowledge" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-4 text-sm hover:bg-slate-900">打开知识库</Link></div></section>

    <section><div className="mb-4 flex items-end justify-between gap-4"><div><div className="label">Proactive research</div><h2 className="mt-1 text-xl font-semibold">基于当前证据的科研建议</h2><p className="mt-1 text-sm text-slate-500">每条建议必须绑定真实文档或分析产物。</p></div><button onClick={() => void refresh()} disabled={refreshing} className="btn-secondary"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""}/>{refreshing ? "生成中" : "刷新建议"}</button></div>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-xl bg-slate-100"/>)}</div> : items.length ? <div className="grid gap-4 md:grid-cols-3">{items.map((item) => <SuggestionCard key={item.id} item={item}/>)}</div> : <div className="card p-8 text-center"><Sparkles className="mx-auto text-slate-300"/><h3 className="mt-3 font-medium">还没有可展示的建议</h3><p className="mt-1 text-sm text-slate-500">先入库文献并完成一次分析，再配置模型密钥刷新建议。</p></div>}
    </section>

    <section className="grid gap-4 md:grid-cols-3">{[
      { href: "/knowledge", label: "知识库", detail: "入库与混合检索", icon: BookOpen },
      { href: "/analysis", label: "分析对话", detail: "动态代码与可信产物", icon: FlaskConical },
      { href: "/memory", label: "科研记忆", detail: "偏好召回与时效核验", icon: Brain },
    ].map(({ href, label, detail, icon: Icon }) => <Link key={href} href={href} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-blue-200"><span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-brand"><Icon size={18}/></span><span><span className="block font-medium">{label}</span><span className="text-xs text-slate-500">{detail}</span></span><ArrowRight size={15} className="ml-auto text-slate-300"/></Link>)}</section>
  </div>;
}
