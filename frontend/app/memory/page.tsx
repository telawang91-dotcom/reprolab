"use client";

import { Brain, Clock3, Plus, Search, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { api, MemoryItem } from "@/lib/api";

const labels = { episodic: "情节", semantic: "语义", skill: "技能候选" } as const;

export default function MemoryPage() {
  const [layer, setLayer] = useState<"" | MemoryItem["layer"]>("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [content, setContent] = useState("");
  const [newLayer, setNewLayer] = useState<MemoryItem["layer"]>("semantic");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await api.memories(layer || undefined, query.trim() || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "记忆加载失败"); }
    finally { setLoading(false); }
  }, [layer, query]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!content.trim()) return;
    try { await api.createMemory(newLayer, content.trim(), ["manual"]); setContent(""); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "记忆写入失败"); }
  }

  return <div className="mx-auto max-w-6xl space-y-5 p-5 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="mb-1 flex items-center gap-2 text-sm font-medium text-brand"><Brain size={16}/>科研记忆</div><h1 className="text-2xl font-semibold">记住你的研究习惯</h1><p className="mt-1 text-sm text-slate-500">记录常用方法、判断标准和项目约定，需要时自动带入分析。</p></div>
      <div className="flex gap-2">{(["", "episodic", "semantic", "skill"] as const).map((value) => <button key={value || "all"} onClick={() => { setLayer(value); if (value !== "semantic") setQuery(""); }} className={layer === value ? "btn-primary" : "btn-secondary"}>{value ? labels[value] : "全部"}</button>)}</div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <div className="card flex items-center gap-2 p-3"><Search size={16} className="text-slate-400"/><input value={query} disabled={layer !== "semantic" && layer !== ""} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed" placeholder="语义检索，例如：差异检验方法"/></div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {loading ? <div className="card p-8 text-center text-sm text-slate-500">正在读取记录…</div> : items.length === 0 ? <div className="card p-8 text-center"><Brain className="mx-auto text-slate-300" size={22}/><h2 className="mt-3 font-medium">还没有研究习惯记录</h2><p className="mt-1 text-sm text-slate-500">可以先记录常用统计方法、图表偏好或项目约定。</p></div> : items.map((item) => <article key={item.id} className="card p-4">
          <div className="flex items-center gap-2 text-xs"><span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-brand">{labels[item.layer]}</span><span className="ml-auto flex items-center gap-1 text-slate-400"><Clock3 size={12}/>{new Date(item.written_at).toLocaleString("zh-CN")}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.content}</p>
          <div className="mt-3 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">#{tag}</span>)}<span className="ml-auto text-[11px] text-slate-400">重要度 {item.importance.toFixed(2)}</span></div>
        </article>)}
      </section>

      <aside className="space-y-4"><form onSubmit={submit} className="card space-y-3 p-4"><div className="flex items-center gap-2 font-medium"><Plus size={16}/>手动记录</div><select value={newLayer} onChange={(event) => setNewLayer(event.target.value as MemoryItem["layer"])} className="w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="episodic">情节记忆</option><option value="semantic">语义记忆</option><option value="skill">技能候选</option></select><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={6} className="w-full resize-none rounded-lg border p-3 text-sm outline-none focus:border-blue-400" placeholder="记录真实的科研偏好、方法或流程…"/><button className="btn-primary w-full" disabled={!content.trim()}>写入记忆</button></form>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><div className="mb-1 flex items-center gap-2 font-medium"><Sparkles size={15}/>系统如何使用</div>这些记录会按与当前问题的相关程度和更新时间筛选。较旧或无关的内容不会影响新的分析。</div>
      </aside>
    </div>
  </div>;
}
