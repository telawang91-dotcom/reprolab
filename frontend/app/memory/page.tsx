"use client";

import { Brain, Check, Clock3, Plus, Search, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { api, MemoryItem } from "@/lib/api";

const labels = { episodic: "情节", semantic: "语义", skill: "技能候选" } as const;
const sourceLabels = { manual: "手动记录", conversation: "会话摘要", reflection: "Agent 沉淀", agent: "系统记录" } as const;

export default function MemoryPage() {
  const [layer, setLayer] = useState<"" | MemoryItem["layer"]>("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [content, setContent] = useState("");
  const [newLayer, setNewLayer] = useState<MemoryItem["layer"]>("semantic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [deleting, setDeleting] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await api.memories(layer || undefined, query.trim() || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "记忆加载失败"); }
    finally { setLoading(false); }
  }, [layer, query]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => items.filter((item) => item.recallable).length, [items]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!content.trim() || saving) return;
    setSaving(true); setError("");
    try { await api.createMemory(newLayer, content.trim(), ["manual"]); setContent(""); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "记忆写入失败"); }
    finally { setSaving(false); }
  }

  async function forget(memoryId: string) {
    setDeleting(memoryId); setError("");
    try { await api.deleteMemory(memoryId); setConfirmDelete(undefined); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "记忆删除失败"); }
    finally { setDeleting(undefined); }
  }

  return <main className="page-shell space-y-7">
    <header className="page-header">
      <div><div className="eyebrow flex items-center gap-2 text-brand"><Brain size={15}/>项目记忆</div><h1>让 Agent 记得有依据。</h1><p>偏好、方法与已验证流程都留在当前项目。每次分析前重新检索，只使用相关且仍有效的记录。</p></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="记忆类型">{(["", "episodic", "semantic", "skill"] as const).map((value) => <button key={value || "all"} onClick={() => { setLayer(value); if (value !== "semantic" && value !== "") setQuery(""); }} className={layer === value ? "btn-primary" : "btn-secondary"}>{value ? labels[value] : "全部"}</button>)}</div>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="metric-card"><span className="metric-icon bg-brand/10 text-brand"><Brain size={19}/></span><div><strong>{items.length}</strong><span>当前结果</span></div></div>
      <div className="metric-card"><span className="metric-icon bg-status-ok/10 text-status-ok"><ShieldCheck size={19}/></span><div><strong>{activeCount}</strong><span>可被 Agent 召回</span></div></div>
      <div className="metric-card"><span className="metric-icon bg-ink/[.05] text-muted"><Search size={19}/></span><div><strong>{query.trim() ? "相关" : "最新"}</strong><span>当前排序方式</span></div></div>
    </section>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-3">
        <label className="card flex min-h-12 items-center gap-3 px-4"><Search size={16} className="text-subtle"/><input value={query} disabled={layer !== "semantic" && layer !== ""} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed" placeholder="按含义检索，例如：差异检验方法"/>{query && <button onClick={() => setQuery("")} className="grid h-8 w-8 place-items-center rounded-full text-subtle hover:bg-ink/[.05]" aria-label="清空检索"><X size={14}/></button>}</label>
        {error && <div role="alert" className="status-error">{error}</div>}
        {loading ? <div className="card p-12 text-center text-sm text-muted">正在核对项目记忆…</div> : items.length === 0 ? <div className="card p-12 text-center"><Brain className="mx-auto text-subtle" size={24}/><h2 className="mt-4 text-lg font-semibold">{query ? "没有匹配的有效记忆" : "还没有项目记忆"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">记录真实的分析偏好或项目约定；完成会话后，Agent 也会自动沉淀有依据的候选。</p></div> : items.map((item) => <article key={item.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-brand/10 px-2.5 py-1 font-medium text-brand">{labels[item.layer]}</span><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${item.recallable ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{item.recallable ? <Check size={11}/> : <Clock3 size={11}/>} {item.recallable ? "可召回" : "已暂停使用"}</span><span className="ml-auto flex items-center gap-1 text-subtle"><Clock3 size={12}/>{new Date(item.written_at).toLocaleString("zh-CN")}</span></div>
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7">{item.content}</p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-3">{item.tags.filter((tag) => !["manual", "reflection", "conversation"].includes(tag)).map((tag) => <span key={tag} className="rounded-full bg-ink/[.05] px-2 py-1 text-[11px] text-muted">#{tag}</span>)}<span className="text-[11px] text-subtle">来源：{sourceLabels[item.source]} · 重要度 {item.importance.toFixed(2)}</span><button onClick={() => setConfirmDelete(item.id)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-subtle hover:bg-status-err/10 hover:text-status-err"><Trash2 size={12}/>忘记</button></div>
          {confirmDelete === item.id && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-apple bg-status-err/[.07] p-3 text-sm text-status-err"><span className="mr-auto">删除后，Agent 不会再召回这条记录。</span><button onClick={() => setConfirmDelete(undefined)} className="btn-secondary h-8 px-3">保留</button><button disabled={deleting === item.id} onClick={() => void forget(item.id)} className="btn h-8 bg-status-err px-3 text-white">{deleting === item.id ? "删除中…" : "确认删除"}</button></div>}
        </article>)}
      </section>

      <aside className="space-y-4"><form onSubmit={submit} className="card space-y-4 p-5"><div><div className="flex items-center gap-2 font-semibold"><Plus size={16}/>写入真实记忆</div><p className="mt-1 text-xs leading-5 text-muted">仅记录可验证的偏好、方法或流程，不要粘贴密钥。</p></div><label className="block"><span className="label">记忆类型</span><select value={newLayer} onChange={(event) => setNewLayer(event.target.value as MemoryItem["layer"])} className="input mt-2 w-full"><option value="episodic">情节记忆</option><option value="semantic">语义记忆</option><option value="skill">技能候选</option></select></label><label className="block"><span className="label">内容</span><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={6} maxLength={10000} className="input mt-2 h-auto min-h-36 w-full resize-y rounded-apple py-3" placeholder="例如：组间差异优先报告效应量和置信区间。"/></label><button className="btn-primary w-full" disabled={!content.trim() || saving}>{saving ? "写入中…" : "写入项目记忆"}</button></form>
        <div className="card overflow-hidden"><div className="section-heading"><div><h2 className="flex items-center gap-2"><Sparkles size={15} className="text-brand"/>Agent 如何调用</h2><p>显示动作摘要，不展示隐藏推理。</p></div></div><ol className="divide-y text-sm">{["按当前问题检索项目记忆", "过滤过期或低重要度记录", "把命中项写入运行上下文", "在分析时间线显示调用回执"].map((step, index) => <li key={step} className="flex gap-3 px-5 py-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{index + 1}</span><span className="leading-6 text-muted">{step}</span></li>)}</ol></div>
      </aside>
    </div>
  </main>;
}
