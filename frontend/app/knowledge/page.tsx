"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, BookOpen, Check, ChevronRight, Clipboard, Database, FileCode2,
  FileText, Folder, FolderOpen, FolderPlus, LocateFixed,
  Plus, Search, ShieldCheck, Sparkles, Trash2, UploadCloud, X,
} from "lucide-react";

import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { EmptyState } from "@/components/common/EmptyState";
import {
  api, type BatchStatus, type Citation, type CollectionItem, type DocumentDetail,
  type DocumentItem, type SearchHit,
} from "@/lib/api";

const modes = [{ id: "hybrid", label: "智能混合" }, { id: "semantic", label: "语义" }, { id: "keyword", label: "关键词" }];
const icons = { paper: FileText, note: BookOpen, code: FileCode2, other: Database };
const typeNames = { paper: "论文", note: "笔记", code: "代码", other: "数据/其他" };

export default function KnowledgePage() {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [collection, setCollection] = useState("");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [type, setType] = useState("");
  const [year, setYear] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [warmingRetrieval, setWarmingRetrieval] = useState(false);
  const [semanticPrepared, setSemanticPrepared] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchStatus>();
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<DocumentDetail | null>(null);
  const [focusedHit, setFocusedHit] = useState<SearchHit | null>(null);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [copied, setCopied] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [savingCollection, setSavingCollection] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const activeCollection = useMemo(
    () => collections.find((item) => item.id === collection),
    [collections, collection],
  );
  const visible = useMemo(
    () => documents.filter((doc) => !type || doc.type === type),
    [documents, type],
  );
  const hasDocuments = documents.length > 0;

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true); setError("");
      setDocuments(await api.documents(undefined, collection || undefined));
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [collection]);

  const loadCollections = useCallback(async () => {
    try { setCollections(await api.collections()); }
    catch (reason) { setError((reason as Error).message); }
    finally { setCollectionsLoaded(true); }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);
  useEffect(() => {
    void loadCollections();
    folderRef.current?.setAttribute("webkitdirectory", "");
    const params = new URLSearchParams(window.location.search);
    const documentId = params.get("document");
    const requestedCollection = params.get("collection");
    if (requestedCollection) setCollection(requestedCollection);
    if (documentId) api.document(documentId).then(setPreview).catch((reason) => setError((reason as Error).message));
  }, [loadCollections]);
  useEffect(() => {
    if (collectionsLoaded && collection && !collections.some((item) => item.id === collection)) chooseCollection("");
  }, [collection, collections, collectionsLoaded]);

  function chooseCollection(id: string) {
    setCollection(id); setHits([]); setAnswer(""); setCitations([]); setBatch(undefined);
  }

  async function createCollection() {
    if (!newName.trim()) return;
    setSavingCollection(true); setError("");
    try {
      const created = await api.createCollection(newName.trim(), newDescription.trim());
      await loadCollections(); chooseCollection(created.id);
      setCreateOpen(false); setNewName(""); setNewDescription("");
    } catch (reason) { setError((reason as Error).message); }
    finally { setSavingCollection(false); }
  }

  async function removeCollection() {
    if (!activeCollection || !confirm(`删除“${activeCollection.name}”？文件会保留到未分组资料中。`)) return;
    try { await api.deleteCollection(activeCollection.id); chooseCollection(""); await loadCollections(); }
    catch (reason) { setError((reason as Error).message); }
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files); if (!list.length) return;
    setUploading(list.map((file) => file.webkitRelativePath || file.name)); setBatch(undefined); setError("");
    try {
      let job = await api.batchUpload(list, collection || undefined); setBatch(job);
      for (let attempt = 0; attempt < 120 && ["queued", "processing"].includes(job.status); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await api.batchStatus(job.batch_id); setBatch(job);
      }
      if (job.failed) setError(`${job.failed} 个文件入库失败，可展开批次查看原因。`);
      await Promise.all([loadDocuments(), loadCollections()]);
    } catch (reason) { setError((reason as Error).message); }
    finally { setUploading([]); setDragging(false); }
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true); setError(""); setAnswer("");
    const needsWarmup = mode !== "keyword" && !semanticPrepared;
    if (needsWarmup) setWarmingRetrieval(true);
    try {
      const filters: Record<string, unknown> = {};
      if (type) filters.type = type;
      if (year) filters.year_gte = Number(year);
      setHits((await api.search(query, mode, filters, collection || undefined)).hits);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSearching(false); setWarmingRetrieval(false); if (needsWarmup) setSemanticPrepared(true); }
  }

  async function ask() {
    if (!query.trim()) return;
    setSearching(true); setError(""); setHits([]);
    const needsWarmup = !semanticPrepared;
    if (needsWarmup) setWarmingRetrieval(true);
    try {
      const response = await api.qa(query, collection || undefined);
      setAnswer(response.answer); setCitations(response.citations);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSearching(false); setWarmingRetrieval(false); if (needsWarmup) setSemanticPrepared(true); }
  }

  async function openDocument(id: string, hit: SearchHit | null = null) {
    try { setFocusedHit(hit); setPreview(await api.document(id)); }
    catch (reason) { setError((reason as Error).message); }
  }

  async function removeDocument(id: string) {
    if (!confirm("删除该文档及全部切块？")) return;
    try { await api.deleteDocument(id); setPreview(null); await Promise.all([loadDocuments(), loadCollections()]); }
    catch (reason) { setError((reason as Error).message); }
  }

  async function copyHash() {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.storage_hash); setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function anchorClick(anchor: string) {
    const citation = citations.find((item) => item.anchor.toLowerCase() === anchor.toLowerCase());
    if (citation) void openDocument(citation.document_id);
  }

  return <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
    <header className="mb-8 flex items-start justify-between gap-5">
      <div><div className="text-xs font-medium text-slate-400">知识库</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">研究资料与可信问答</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">把文献按研究主题分组，只基于选定范围回答，并保留每条结论的原文出处。</p></div>
      <button onClick={() => setCreateOpen(true)} className="btn-secondary shrink-0"><FolderPlus size={15}/>新建空间</button>
    </header>

    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="hidden border-r pr-5 lg:block">
        <div className="mb-3 flex items-center justify-between px-2"><span className="text-xs font-medium text-slate-400">知识空间</span><button onClick={() => setCreateOpen(true)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Plus size={14}/></button></div>
        <nav className="space-y-1">
          <button onClick={() => chooseCollection("")} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${!collection ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"}`}><Archive size={14}/><span className="min-w-0 flex-1 truncate">全部资料</span><span className={`text-[11px] ${!collection ? "text-slate-300 dark:text-slate-500" : "text-slate-400"}`}>{collections.reduce((sum, item) => sum + item.document_count, 0)}</span></button>
          {collections.map((item) => <button key={item.id} onClick={() => chooseCollection(item.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${collection === item.id ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"}`}><Folder size={14}/><span className="min-w-0 flex-1 truncate">{item.name}</span><span className={`text-[11px] ${collection === item.id ? "text-slate-300 dark:text-slate-500" : "text-slate-400"}`}>{item.document_count}</span></button>)}
        </nav>
      </aside>

      <main className="min-w-0">
        <div className="mb-5 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-semibold">{activeCollection?.name || "全部资料"}</h2><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><ShieldCheck size={11}/>{activeCollection ? "回答已限定此空间" : "项目全部资料"}</span></div><p className="mt-1 text-sm text-slate-500">{activeCollection?.description || (activeCollection ? "尚未添加描述" : "查看项目内的全部文献、数据与笔记")}</p></div>
          {activeCollection && <button onClick={() => void removeCollection()} title="删除空间" className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15}/></button>}
          <button onClick={() => fileRef.current?.click()} className="btn-primary h-9"><UploadCloud size={14}/>添加资料</button>
          <button onClick={() => folderRef.current?.click()} className="btn-secondary h-9"><FolderOpen size={14}/>文件夹</button>
        </div>

        <div className="mb-5 lg:hidden"><select value={collection} onChange={(event) => chooseCollection(event.target.value)} className="input h-10 w-full"><option value="">全部资料</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.document_count}）</option>)}</select></div>
        <input ref={fileRef} className="hidden" type="file" multiple accept=".pdf,.csv,.xlsx,.py,.ipynb,.md,.txt,.zip" onChange={(event) => event.target.files && void upload(event.target.files)}/>
        <input ref={folderRef} className="hidden" type="file" multiple onChange={(event) => event.target.files && void upload(event.target.files)}/>

        {hasDocuments && <><section className="overflow-hidden rounded-xl bg-slate-900 text-white shadow-sm dark:bg-slate-800">
          <div className="flex min-h-16 items-center gap-3 px-4 md:px-5"><Search size={18} className="shrink-0 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void ask()} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-500" placeholder={activeCollection ? `向“${activeCollection.name}”提问…` : "向全部资料提问，或输入关键词检索…"}/>{searching && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400"/>}<button onClick={() => void search()} disabled={searching || !query.trim()} className="hidden h-9 rounded-lg px-3 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-40 sm:block">检索</button><button onClick={() => void ask()} disabled={searching || !query.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-40"><Sparkles size={14}/>问知识库</button></div>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-2.5 text-xs text-slate-400 md:px-5"><ShieldCheck size={13} className="text-emerald-400"/><span>{warmingRetrieval ? "首次语义检索正在准备本地科研模型，完成后会自动继续。" : "仅使用当前范围内的证据，答案保留可点击出处"}</span><span className="ml-auto hidden sm:inline">检索方式</span><select value={mode} onChange={(event) => setMode(event.target.value)} className="rounded-md border-0 bg-white/10 px-2 py-1 text-xs text-slate-200 outline-none">{modes.map((item) => <option className="text-slate-900" key={item.id} value={item.id}>{item.label}</option>)}</select></div>
        </section>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><select value={type} onChange={(event) => setType(event.target.value)} className="h-8 rounded-md border bg-white px-2 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"><option value="">所有类型</option><option value="paper">论文</option><option value="note">笔记</option><option value="code">代码</option><option value="other">数据/其他</option></select><input value={year} onChange={(event) => setYear(event.target.value)} className="h-8 w-24 rounded-md border bg-white px-2 text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-950" inputMode="numeric" placeholder="年份 ≥"/><span className="ml-auto text-slate-400">{documents.length} 份资料</span></div>
        </>}

        {error && <div role="alert" className="mt-4 flex items-start border-l-2 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-700"><span className="flex-1">{error}</span><button onClick={() => setError("")}><X size={14}/></button></div>}

        {batch && <section className="mt-4 border-b border-slate-200 pb-4 dark:border-slate-800"><div className="flex items-center gap-3 text-sm"><UploadCloud size={15} className={["queued", "processing"].includes(batch.status) ? "animate-pulse text-brand" : "text-emerald-600"}/><span className="font-medium">{["queued", "processing"].includes(batch.status) ? "正在整理资料" : "资料已入库"}</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-brand transition-all" style={{ width: `${batch.total ? ((batch.completed + batch.failed) / batch.total) * 100 : 0}%` }}/></div><span className="text-xs text-slate-400">{batch.completed + batch.failed}/{batch.total}</span></div>{batch.failed > 0 && <details className="mt-2 text-xs text-red-600"><summary className="cursor-pointer">{batch.failed} 个文件失败</summary><div className="mt-2 space-y-1 pl-5">{batch.items.filter((item) => item.status === "error").map((item) => <div key={item.filename}>{item.filename}：{item.error}</div>)}</div></details>}</section>}

        {answer && <section className="mt-7 border-b border-slate-200 pb-7 dark:border-slate-800"><div className="mb-4 flex items-center gap-2"><Sparkles size={15} className="text-brand"/><h3 className="font-semibold">回答</h3><span className="text-xs text-slate-400">基于 {activeCollection?.name || "全部资料"}</span></div><div className="max-w-3xl"><AnchoredMarkdown text={answer} onAnchor={anchorClick}/></div><div className="mt-4 flex flex-wrap gap-2">{citations.map((item) => <button onClick={() => void openDocument(item.document_id)} key={item.chunk_id} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-500 hover:text-brand dark:bg-slate-800">{item.anchor} 查看原文</button>)}</div></section>}

        {hits.length > 0 && <section className="mt-7 border-b border-slate-200 pb-7 dark:border-slate-800"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">检索结果</h3><span className="text-xs text-slate-400">按相关度排序</span></div><div className="divide-y dark:divide-slate-800">{hits.map((hit, index) => <article key={hit.chunk_id} className="py-4 first:pt-0"><div className="flex gap-3"><span className="mt-0.5 text-xs font-medium text-slate-300">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400"><span>{hit.section || "未命名章节"}</span><span>·</span><span>位置 {hit.position ?? "—"}</span><span className="ml-auto font-mono">{hit.score.toFixed(3)}</span></div><p className="line-clamp-3 text-sm leading-6 text-slate-700 dark:text-slate-200">{hit.content}</p><button onClick={() => void openDocument(hit.document_id, hit)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand"><LocateFixed size={12}/>定位原文</button></div></div></article>)}</div></section>}

        <section className="mt-8"><div className="mb-3 flex items-end justify-between"><div><h3 className="font-semibold">资料</h3><p className="mt-1 text-xs text-slate-400">拖入文件、文件夹或 ZIP 即可批量入库</p></div><span className="text-xs text-slate-400">{visible.length} 项</span></div><div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files); }} className={`relative transition ${dragging ? "rounded-lg bg-blue-50 p-3 ring-2 ring-brand/30 dark:bg-blue-950/20" : ""}`}>
          {dragging && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-blue-50/90 text-sm font-medium text-brand dark:bg-blue-950/90">松手添加到{activeCollection ? `“${activeCollection.name}”` : "全部资料"}</div>}
          {uploading.length > 0 && !batch && <div className="mb-3 flex items-center gap-2 py-2 text-sm text-slate-500"><UploadCloud className="animate-bounce" size={15}/>正在准备 {uploading.length} 个文件…</div>}
          {loading ? <div className="divide-y dark:divide-slate-800">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse bg-slate-50 dark:bg-slate-900"/>)}</div> : visible.length === 0 ? <div className="rounded-lg border border-dashed py-10"><EmptyState title={activeCollection ? "这个空间还没有资料" : "还没有资料"} description="拖入论文、笔记、数据表或 ZIP。系统只会处理你主动添加的内容。" action={<div className="flex flex-wrap justify-center gap-2"><button onClick={() => fileRef.current?.click()} className="btn-primary"><UploadCloud size={14}/>添加资料</button><button onClick={() => folderRef.current?.click()} className="btn-secondary"><FolderOpen size={14}/>选择文件夹</button></div>}/></div> : <div className="divide-y border-y dark:divide-slate-800 dark:border-slate-800">{visible.map((doc) => { const Icon = icons[doc.type]; return <button key={doc.id} onClick={() => void openDocument(doc.id)} className="group flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"><Icon size={16}/></span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{doc.title || doc.filename}</div><div className="mt-0.5 truncate text-xs text-slate-400">{doc.filename}</div></div><span className="hidden text-xs text-slate-400 sm:block">{typeNames[doc.type]}</span><span className="w-12 text-right text-xs text-slate-400">{doc.year || "—"}</span><ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500"/></button>; })}</div>}
        </div></section>
      </main>
    </div>

    {createOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onMouseDown={() => setCreateOpen(false)}><div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start"><div><div className="text-xs font-medium text-slate-400">知识空间</div><h2 className="mt-1 text-lg font-semibold">新建空间</h2><p className="mt-1 text-sm text-slate-500">同一主题的资料共享一个问答范围。</p></div><button onClick={() => setCreateOpen(false)} className="ml-auto grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={15}/></button></div><label className="mt-5 block text-xs font-medium text-slate-600">名称</label><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} className="input mt-2 w-full" placeholder="例如：综述文献" maxLength={200}/><label className="mt-4 block text-xs font-medium text-slate-600">描述（可选）</label><textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="input mt-2 min-h-20 w-full resize-none py-2" placeholder="这个空间收集什么资料？" maxLength={1000}/><div className="mt-5 flex justify-end gap-2"><button onClick={() => setCreateOpen(false)} className="btn-secondary">取消</button><button disabled={!newName.trim() || savingCollection} onClick={() => void createCollection()} className="btn-primary">{savingCollection ? "创建中…" : "创建"}</button></div></div></div>}

    {preview && <div className="fixed inset-0 z-50 bg-slate-950/25" onMouseDown={() => { setPreview(null); setFocusedHit(null); }}><aside className="absolute bottom-0 right-0 top-0 w-full max-w-lg overflow-y-auto border-l bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800"><FileText size={18}/></span><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{preview.title || preview.filename}</h2><p className="mt-1 truncate text-xs text-slate-400">{preview.filename}</p></div><button onClick={() => { setPreview(null); setFocusedHit(null); }} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={15}/></button></div>{focusedHit && <section className="mt-6 border-l-2 border-brand bg-blue-50 px-4 py-3 dark:bg-blue-950/30"><div className="flex items-center gap-2 text-xs font-medium text-brand"><LocateFixed size={13}/>检索命中</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{focusedHit.content}</p><div className="mt-2 text-xs text-slate-400">{focusedHit.section || "未命名章节"} · 位置 {focusedHit.position ?? "—"}</div></section>}<dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 text-sm"><div><dt className="text-xs text-slate-400">类型</dt><dd className="mt-1">{typeNames[preview.type]}</dd></div><div><dt className="text-xs text-slate-400">年份</dt><dd className="mt-1">{preview.year ?? "—"}</dd></div><div><dt className="text-xs text-slate-400">文本切块</dt><dd className="mt-1">{preview.chunks_count}</dd></div><div><dt className="text-xs text-slate-400">DOI</dt><dd className="mt-1 truncate">{preview.doi ?? "—"}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-400">SHA-256 内容指纹</dt><dd className="mt-1 break-all font-mono text-[11px] text-slate-500">{preview.storage_hash}</dd></div></dl>{preview.schema_json && <div className="mt-6"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">数据结构</h3><span className="text-xs text-slate-400">{preview.schema_json.row_count} 行</span></div><div className="mt-2 overflow-hidden border-y"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="py-2">字段</th><th className="py-2">类型</th></tr></thead><tbody>{preview.schema_json.columns?.map((column) => <tr key={column.name} className="border-t"><td className="py-2 font-mono">{column.name}</td><td className="py-2 text-slate-500">{column.dtype}</td></tr>)}</tbody></table></div></div>}<div className="mt-8 flex gap-2 border-t pt-4"><button onClick={() => void removeDocument(preview.id)} className="btn-secondary text-red-600"><Trash2 size={14}/>删除</button><button onClick={() => void copyHash()} className="btn-secondary ml-auto">{copied ? <Check size={14}/> : <Clipboard size={14}/>} {copied ? "已复制" : "复制指纹"}</button></div></aside></div>}
  </div>;
}
