"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, BookmarkPlus, Check, ChevronDown, ChevronRight, Code2, Database, ExternalLink, FileSpreadsheet, PenLine, RotateCcw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { SkillPanel } from "@/components/skills/SkillPanel";
import { API_BASE, api, streamChat, type ChatEvent, type DocumentDetail, type Lineage, type SkillItem } from "@/lib/api";

type EventItem = ChatEvent & { id: string };
type ArtifactData = { artifact_id: string; kind: string; value_json: any; figure_url?: string | null; anchor: string };
const examples = ["比较不同组的均值并绘图", "分析两个变量的相关性", "建立回归模型并解释系数"];

export default function AnalysisPage() {
  const [datasets, setDatasets] = useState<DocumentDetail[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]); const [message, setMessage] = useState(""); const [running, setRunning] = useState(false);
  const [error, setError] = useState(""); const [conversation, setConversation] = useState<string>(); const [activeArtifact, setActiveArtifact] = useState<ArtifactData>();
  const [lineage, setLineage] = useState<Lineage>(); const [lineageLoading, setLineageLoading] = useState(false); const endRef = useRef<HTMLDivElement>(null); const abortRef = useRef<AbortController>();
  const [skill, setSkill] = useState<SkillItem>();
  const [skillRefresh, setSkillRefresh] = useState(0);
  const [skillResult, setSkillResult] = useState<{ saved: number; fallback: boolean; reason: string }>();
  const [mobileDataOpen, setMobileDataOpen] = useState(false);

  useEffect(() => { void (async () => { try { const docs = await api.documents("other"); const details = await Promise.all(docs.map((doc) => api.document(doc.id))); const available = details.filter((doc) => doc.dataset_id); setDatasets(available); if (available.length === 1 && available[0].dataset_id) setSelected([available[0].dataset_id]); } catch (e) { setError((e as Error).message); } })(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [events]);
  const artifacts = useMemo(() => events.filter((item) => item.event === "artifact").map((item) => item.data as ArtifactData), [events]);

  const send = useCallback(async (text = message) => {
    if (!text.trim() || running) return; setMessage(""); setError(""); setRunning(true);
    setEvents((items) => [...items, { id: crypto.randomUUID(), event: "message", data: { text: text.trim(), citations: [], user: true } }]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await streamChat({ conversation_id: conversation, message: text.trim(), dataset_ids: selected, skill_id: skill?.id }, (incoming) => {
        setEvents((items) => [...items, { ...incoming, id: crypto.randomUUID() }]);
        if (incoming.event === "artifact") setActiveArtifact(incoming.data as ArtifactData);
        if (incoming.event === "done") setConversation(incoming.data.conversation_id);
      }, controller.signal);
    } catch (e) { if ((e as Error).name !== "AbortError") setError((e as Error).message); }
    finally { setRunning(false); abortRef.current = undefined; }
  }, [conversation, message, running, selected, skill]);

  async function showLineage(id: string) { setLineageLoading(true); try { setLineage(await api.lineage(id)); } catch (e) { setError((e as Error).message); } finally { setLineageLoading(false); } }
  async function saveAsSkill(artifact: ArtifactData) {
    const name = window.prompt("技能名称", `${artifact.kind} 分析技能`); if (!name?.trim()) return;
    const intent = window.prompt("这个技能解决什么问题？", "分组分布对比+检验"); if (!intent?.trim()) return;
    setError("");
    try { const created = await api.harvestSkill(artifact.artifact_id, name.trim(), intent.trim()); setSkill(created); setSkillRefresh((value) => value + 1); }
    catch (e) { setError((e as Error).message); }
  }
  async function applySelectedSkill(item: SkillItem) {
    if (!selected.length) { setError("请先选择要应用技能的新数据集"); return; }
    setRunning(true); setError(""); setSkillResult(undefined); setSkill(item);
    try {
      const result = await api.applySkill(item.id, selected, conversation);
      if (result.fallback_used) {
        const incoming = result.events.map((event) => ({ ...event, id: crypto.randomUUID() }));
        setEvents((current) => [...current, ...incoming]);
        const artifactEvents = incoming.filter((event) => event.event === "artifact");
        if (artifactEvents.length) setActiveArtifact(artifactEvents[artifactEvents.length - 1].data as ArtifactData);
        if (result.conversation_id) setConversation(result.conversation_id);
      } else {
        const incoming: EventItem[] = [];
        if (result.code) incoming.push({ id: crypto.randomUUID(), event: "code", data: { code: result.code, lang: "python", reused: true } });
        incoming.push({ id: crypto.randomUUID(), event: "run", data: { run_id: result.run_id, status: result.status, stdout: "技能模板已在新数据上重新执行" } });
        for (const artifact of result.artifacts) incoming.push({ id: crypto.randomUUID(), event: "artifact", data: artifact });
        setEvents((current) => [...current, ...incoming]);
        if (result.artifacts.length) setActiveArtifact(result.artifacts[result.artifacts.length - 1] as ArtifactData);
      }
      setSkillResult({ saved: result.token_usage.saved_tokens, fallback: result.fallback_used, reason: result.mapping_reason });
    } catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  }
  function toggleDataset(id: string) { setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }
  function anchorClick(anchor: string) { const artifact = artifacts.find((item) => item.anchor.toLowerCase() === anchor.toLowerCase()); if (artifact) { setActiveArtifact(artifact); void showLineage(artifact.artifact_id); } }

  return <div className="flex h-[calc(100vh-48px)] min-h-[640px] overflow-hidden">
    <aside className="hidden w-[260px] shrink-0 overflow-y-auto border-r bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:block">
      <div className="label">当前分析</div><h1 className="mt-1 text-lg font-semibold">数据与会话</h1>
      <div className="mt-6 flex items-center gap-2 text-sm font-medium"><Database size={15} className="text-brand"/>数据集 <span className="ml-auto text-xs text-slate-400">{selected.length} 已选</span></div>
      <div className="mt-2 space-y-2">{datasets.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-xs leading-5 text-slate-500">还没有可分析的数据。<Link href="/knowledge" className="mt-2 block font-medium text-brand">上传 CSV 或 XLSX →</Link></div> : datasets.map((dataset) => <button key={dataset.id} onClick={() => dataset.dataset_id && toggleDataset(dataset.dataset_id)} className={`w-full rounded-lg border p-3 text-left transition ${dataset.dataset_id && selected.includes(dataset.dataset_id) ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}><div className="flex items-center gap-2"><FileSpreadsheet size={15} className="text-emerald-600"/><span className="min-w-0 flex-1 truncate text-sm font-medium">{dataset.filename}</span>{dataset.dataset_id && selected.includes(dataset.dataset_id) && <Check size={14} className="text-brand"/>}</div><div className="mt-2 text-[11px] text-slate-400">{dataset.schema_json?.row_count ?? 0} 行 · {dataset.schema_json?.column_count ?? 0} 列</div></button>)}</div>
      <div className="mt-7 flex items-center gap-2 text-sm font-medium"><ChevronDown size={14}/>本次分析</div><div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900"><div className="text-slate-400">会话编号</div><div className="mt-1 truncate font-mono">{conversation ? conversation.slice(0, 12) : "尚未开始"}</div><div className="mt-3 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`}/>{running ? "正在分析" : "准备就绪"}</div></div>
      <SkillPanel selected={skill?.id} onSelect={setSkill} onApply={applySelectedSkill} refreshKey={skillRefresh}/>
    </aside>
    <main className="relative flex min-w-0 flex-1 flex-col bg-[#F8FAFC] dark:bg-[#0B0F17]">
      <div className="flex h-14 shrink-0 items-center border-b bg-white px-4 dark:border-slate-800 dark:bg-slate-950 md:px-5"><div><div className="font-semibold">分析对话</div><div className="hidden text-xs text-slate-400 sm:block">描述问题，查看过程，核对结果来源</div></div><button onClick={() => setMobileDataOpen(true)} className="btn-secondary ml-auto h-8 lg:hidden"><Database size={14}/>数据集 {selected.length ? `· ${selected.length}` : ""}</button><div className="ml-auto hidden items-center gap-2 text-xs text-slate-400 lg:flex"><span className="h-2 w-2 rounded-full bg-emerald-500"/>分析环境已就绪</div></div>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-3xl">
        {skillResult && <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${skillResult.fallback ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{skillResult.fallback ? `字段映射不确定，已安全回退动态分析：${skillResult.reason}` : `技能复用完成，估算节省 ${skillResult.saved.toLocaleString()} token。${skillResult.reason}`}</div>}
        {events.length === 0 ? <div className="grid min-h-[55vh] place-items-center text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-brand dark:bg-blue-950">{datasets.length ? <Sparkles size={24}/> : <Database size={24}/>}</span><h2 className="mt-4 text-xl font-semibold">{datasets.length ? "从一个科研问题开始" : "先添加一份可分析的数据"}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{datasets.length ? (selected.length ? "用自己的话说明要比较、检验或解释什么。系统会运行分析，并保存每个数字和图的来源。" : "先在左侧选择一个数据集，再描述你要比较、检验或解释什么。") : "上传 CSV 或 XLSX 后，这里会根据你的问题动态生成代码并记录完整血缘。"}</p>{datasets.length ? <div className="mt-5 flex flex-wrap justify-center gap-2">{examples.map((item) => <button key={item} onClick={() => setMessage(item)} disabled={!selected.length} className="rounded-full border bg-white px-3 py-2 text-xs text-slate-600 hover:border-blue-300 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900">{item}</button>)}</div> : <Link href="/knowledge" className="btn-primary mt-5">上传数据<ChevronRight size={14}/></Link>}</div></div> : <div className="space-y-4">{events.map((item) => <EventCard key={item.id} item={item} onArtifact={(artifact) => setActiveArtifact(artifact)} onAnchor={anchorClick} onLineage={showLineage}/>)}</div>}
        {running && <div className="mt-4 flex items-center gap-2 text-xs text-slate-400"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-.2s]"/><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-.1s]"/><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand"/></span>正在执行下一步</div>}
        {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle className="mr-2 inline" size={15}/>{error}</div>}<div ref={endRef}/>
      </div></div>
      <div className="shrink-0 border-t bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><div className="mx-auto max-w-3xl"><div className="rounded-xl border bg-white p-2 shadow-card focus-within:border-blue-300 dark:border-slate-700 dark:bg-slate-900"><textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && selected.length) void send(); }} rows={2} className="w-full resize-none bg-transparent px-2 py-1 outline-none" placeholder={selected.length ? "描述你想分析的问题…" : "先选择一个数据集…"}/><div className="flex items-center px-1 pt-1"><span className="text-[11px] text-slate-400">{selected.length ? "⌘↵ 发送 · 所有产物自动登记溯源" : "需要先选择数据集，避免生成无来源分析"}</span>{running ? <button onClick={() => abortRef.current?.abort()} className="btn-secondary ml-auto h-8"><X size={14}/>停止</button> : <button onClick={() => void send()} disabled={!message.trim() || !selected.length} className="btn-primary ml-auto h-8"><Send size={14}/>发送</button>}</div></div></div></div>
    </main>
    <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l bg-white p-4 dark:border-slate-800 dark:bg-slate-950 xl:block"><div className="flex items-center justify-between"><div><div className="label">分析结果</div><h2 className="mt-1 font-semibold">图表与数字</h2></div><span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800">{artifacts.length}</span></div>{activeArtifact ? <ArtifactPreview artifact={activeArtifact} onLineage={showLineage} onSave={saveAsSkill}/> : <div className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-slate-400"><BarChart3 className="mx-auto mb-3" size={24}/>执行分析后，图、表和数字会在这里出现。</div>}</aside>
    {(lineage || lineageLoading) && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onMouseDown={() => setLineage(undefined)}><div className="card max-h-[80vh] w-full max-w-2xl overflow-y-auto p-5" onMouseDown={(e) => e.stopPropagation()}><div className="flex items-center"><div><div className="label">Provenance ledger</div><h2 className="mt-1 text-lg font-semibold">完整溯源链</h2></div><button onClick={() => setLineage(undefined)} className="btn-secondary ml-auto h-8 w-8 px-0"><X size={15}/></button></div>{lineageLoading ? <div className="mt-5 h-52 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"/> : lineage && <div className="mt-5"><div className="grid gap-2 sm:grid-cols-3">{lineage.nodes.map((node) => <div key={node.id} className="rounded-lg border p-3"><span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase text-brand">{node.type}</span><div className="mt-2 truncate text-sm font-medium">{node.label}</div><div className="mt-1 truncate font-mono text-[10px] text-slate-400">{node.id}</div></div>)}</div><div className="mt-4 space-y-2">{lineage.edges.map((edge, index) => <div key={index} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs dark:bg-slate-900"><span>{edge.from.slice(0, 8)}</span><ChevronRight size={13}/><span className="rounded bg-white px-2 py-1 text-brand dark:bg-slate-800">{edge.relation}</span><ChevronRight size={13}/><span>{edge.to.slice(0, 8)}</span></div>)}</div></div>}</div></div>}
    {mobileDataOpen && <div className="fixed inset-0 z-50 bg-slate-950/35 lg:hidden" onMouseDown={() => setMobileDataOpen(false)}><aside className="absolute bottom-0 right-0 top-0 w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl dark:bg-slate-950" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center"><div><div className="label">分析准备</div><h2 className="mt-1 font-semibold">选择数据与分析方式</h2></div><button onClick={() => setMobileDataOpen(false)} aria-label="关闭数据集选择" className="btn-secondary ml-auto h-8 w-8 px-0"><X size={15}/></button></div><div className="mt-6 space-y-2">{datasets.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm leading-6 text-slate-500">还没有可用数据集。<Link href="/knowledge" className="mt-2 block font-medium text-brand">去上传 CSV 或 XLSX →</Link></div> : datasets.map((dataset) => <button key={dataset.id} onClick={() => dataset.dataset_id && toggleDataset(dataset.dataset_id)} className={`w-full rounded-lg border p-3 text-left ${dataset.dataset_id && selected.includes(dataset.dataset_id) ? "border-blue-300 bg-blue-50" : ""}`}><div className="flex items-center gap-2"><FileSpreadsheet size={15} className="text-emerald-600"/><span className="min-w-0 flex-1 truncate text-sm font-medium">{dataset.filename}</span>{dataset.dataset_id && selected.includes(dataset.dataset_id) && <Check size={14} className="text-brand"/>}</div><div className="mt-2 text-xs text-slate-400">{dataset.schema_json?.row_count ?? 0} 行 · {dataset.schema_json?.column_count ?? 0} 列</div></button>)}</div><SkillPanel selected={skill?.id} onSelect={setSkill} onApply={applySelectedSkill} refreshKey={skillRefresh}/></aside></div>}
  </div>;
}

function EventCard({ item, onArtifact, onAnchor, onLineage }: { item: EventItem; onArtifact: (artifact: ArtifactData) => void; onAnchor: (anchor: string) => void; onLineage: (id: string) => void }) {
  if (item.data.user) return <div className="ml-auto max-w-[80%] rounded-xl rounded-br-sm bg-slate-900 px-4 py-3 text-sm text-white dark:bg-slate-100 dark:text-slate-900">{item.data.text}</div>;
  if (item.event === "plan") return <div className="card p-4"><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><Sparkles size={14}/>执行计划</div><ol className="space-y-2">{item.data.steps.map((step: any, index: number) => <li key={index} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-semibold text-brand">{index + 1}</span><div><div className="text-sm font-medium">{step.title}</div><div className="mt-0.5 text-xs text-slate-500">{step.rationale}</div></div></li>)}</ol></div>;
  if (item.event === "thinking") return <details className="rounded-lg border bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"><summary className="cursor-pointer text-xs font-medium text-slate-500">思考与判断</summary><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.data.text}</p></details>;
  if (item.event === "code") return <div className="overflow-hidden rounded-xl border bg-[#0F172A] text-slate-100"><div className="flex h-9 items-center border-b border-slate-700 px-3 text-xs text-slate-400"><Code2 className="mr-2" size={14}/>Python <span className="ml-auto rounded bg-slate-800 px-2 py-1 text-[10px]">Agent 动态生成</span></div><pre className="max-h-80 overflow-auto p-4 font-mono text-xs leading-6"><code>{item.data.code}</code></pre></div>;
  if (item.event === "run") return <div className={`flex items-start gap-3 rounded-lg border p-3 ${item.data.status === "success" ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50"}`}><span className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full ${item.data.status === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{item.data.status === "success" ? <Check size={14}/> : <AlertTriangle size={13}/>}</span><div className="min-w-0 flex-1"><div className="text-sm font-medium">运行{item.data.status === "success" ? "完成" : "失败"}</div><pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-600">{item.data.stdout || "无标准输出"}</pre><div className="mt-1 font-mono text-[10px] text-slate-400">run {item.data.run_id}</div></div></div>;
  if (item.event === "artifact") { const artifact = item.data as ArtifactData; return <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onClick={() => onArtifact(artifact)} className="card w-full border-blue-100 p-4 text-left hover:border-blue-300"><div className="flex items-center gap-2"><BarChart3 size={16} className="text-brand"/><span className="font-medium">{artifact.kind} 产物</span><span className="ml-auto font-mono text-xs text-brand">{artifact.anchor}</span></div>{artifact.figure_url ? <img className="mt-3 max-h-64 w-full rounded-lg border object-contain" src={`${API_BASE.replace(/\/api\/v1$/, "")}${artifact.figure_url}`} alt="分析产物"/> : <pre className="mt-3 max-h-36 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-slate-900">{JSON.stringify(artifact.value_json, null, 2)}</pre>}<span onClick={(event) => { event.stopPropagation(); void onLineage(artifact.artifact_id); }} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand"><ExternalLink size={12}/>查看来源</span></motion.button>; }
  if (item.event === "message") return <div className="card p-5"><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600"><Check size={14}/>分析结论</div><AnchoredMarkdown text={item.data.text} onAnchor={onAnchor}/></div>;
  return null;
}

function ArtifactPreview({ artifact, onLineage, onSave }: { artifact: ArtifactData; onLineage: (id: string) => void; onSave: (artifact: ArtifactData) => void }) {
  function prepareWriting() {
    const code = artifact.artifact_id.slice(0, 4).toLowerCase();
    const map = JSON.parse(localStorage.getItem("reprolab-writing-artifacts") || "{}");
    map[code] = artifact.artifact_id;
    localStorage.setItem("reprolab-writing-artifacts", JSON.stringify(map));
    const draft = localStorage.getItem("reprolab-writing-draft") || "# 研究结论\n";
    if (!draft.includes(`⟦art_${code}⟧`)) localStorage.setItem("reprolab-writing-draft", `${draft}\n\n分析结果 ⟦art_${code}⟧`);
  }
  return <motion.div key={artifact.artifact_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5"><div className="overflow-hidden border-y"><div className="flex items-center py-3"><BarChart3 size={16} className="mr-2 text-brand"/><span className="font-medium">{artifact.kind}</span><span className="ml-auto font-mono text-xs text-brand">{artifact.anchor}</span></div>{artifact.figure_url ? <img className="max-h-72 w-full object-contain py-3" src={`${API_BASE.replace(/\/api\/v1$/, "")}${artifact.figure_url}`} alt="当前产物"/> : <pre className="max-h-72 overflow-auto bg-slate-50 p-4 font-mono text-xs dark:bg-slate-900">{JSON.stringify(artifact.value_json, null, 2)}</pre>}</div><div className="mt-4 border-l-2 border-emerald-500 bg-emerald-50 px-3 py-3 dark:bg-emerald-950/30"><div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"><ShieldCheck size={15}/>可信记录完整</div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-emerald-700 dark:text-emerald-400"><span>✓ 输入数据</span><span>✓ 运行代码</span><span>✓ 环境快照</span></div></div><Link href="/writing" onClick={prepareWriting} className="btn-primary mt-4 w-full"><PenLine size={14}/>写入研究结论</Link><div className="mt-2 grid grid-cols-2 gap-2"><Link href={`/lineage/${artifact.artifact_id}`} className="btn-secondary"><ExternalLink size={14}/>查看完整来源</Link><button onClick={() => void onSave(artifact)} className="btn-secondary"><BookmarkPlus size={14}/>存为技能</button></div><button onClick={() => void onLineage(artifact.artifact_id)} className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-brand"><RotateCcw size={12}/>快速检查血缘</button><details className="mt-4 border-t pt-3 text-xs text-slate-400"><summary className="cursor-pointer">技术信息</summary><div className="mt-2 break-all font-mono text-[10px]">artifact {artifact.artifact_id}</div></details></motion.div>;
}
