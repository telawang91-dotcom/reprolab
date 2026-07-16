"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Clipboard,
  Database,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LocateFixed,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";
import { DatasetInspector } from "@/components/workspace/DatasetInspector";
import {
  api,
  beginActivity,
  finishActivity,
  type BatchStatus,
  type Citation,
  type DocumentDetail,
  type DocumentItem,
  type SearchHit,
} from "@/lib/api";
import { displayDocumentTitle } from "@/lib/documentTitle";

const modes = [
  { id: "hybrid", label: "智能混合" },
  { id: "semantic", label: "语义" },
  { id: "keyword", label: "关键词" },
];
const icons = { paper: FileText, note: BookOpen, code: FileCode2, other: Database };
const typeNames = { paper: "论文", note: "笔记", code: "代码", other: "数据/其他" };
const folderPickerAttributes = { webkitdirectory: "", directory: "" };

export default function KnowledgePage() {
  const scope = useWorkspaceScope();
  const collections = scope.collections;
  const collection = scope.activeId;
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
  const [pendingDelete, setPendingDelete] = useState<{ kind: "collection" | "document"; id: string; name: string }>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const uploadCancelled = useRef(false);

  const activeCollection = scope.activeCollection;
  const visible = useMemo(
    () => documents.filter((doc) => !type || doc.type === type),
    [documents, type],
  );
  const unfiled = useMemo(
    () => scope.documents.filter((document) => !document.collection_id),
    [scope.documents],
  );

  const loadDocuments = useCallback(async () => {
    if (!collection) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      setDocuments(await api.documents(undefined, collection));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    uploadCancelled.current = false;
    folderRef.current?.setAttribute("webkitdirectory", "");
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("collection");
    if (requested) scope.selectCollection(requested);
    const documentId = params.get("document");
    if (documentId) void api.document(documentId).then(setPreview).catch((reason) => setError((reason as Error).message));
    return () => { uploadCancelled.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  useEffect(() => {
    setHits([]); setAnswer(""); setCitations([]); setBatch(undefined); setType(""); setYear("");
  }, [collection]);

  async function createCollection() {
    if (!newName.trim()) return;
    setSavingCollection(true);
    setError("");
    try {
      const created = await api.createCollection(newName.trim(), newDescription.trim());
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      await scope.refresh(created.id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSavingCollection(false);
    }
  }

  async function removeCollection() {
    if (!activeCollection || pendingDelete?.kind !== "collection") return;
    setDeleting(true); setDeleteError("");
    try {
      await api.deleteCollection(activeCollection.id);
      scope.selectCollection("");
      await scope.refresh();
      setPendingDelete(undefined);
    } catch (reason) {
      setDeleteError((reason as Error).message);
    } finally { setDeleting(false); }
  }

  async function upload(files: FileList | File[], targetCollection = collection) {
    const selectedFiles = Array.from(files);
    const list = selectedFiles.filter(isSupportedUpload);
    const ignored = selectedFiles.filter((file) => !isSupportedUpload(file));
    if (!targetCollection) return;
    if (!list.length) { setError("所选内容中没有支持的文件。可上传 PDF、CSV/TSV、XLSX、代码、笔记或 ZIP。"); return; }
    const totalBytes = list.reduce((sum, file) => sum + file.size, 0);
    if (list.length > 100) { setError("一次最多导入 100 个支持的文件，请分批上传。"); return; }
    if (totalBytes > 100 * 1024 * 1024) { setError("单个批次最多 100 MB，请拆分后重试。"); return; }
    uploadCancelled.current = false;
    const activity = beginActivity(`导入 ${list.length} 个文件`, "/knowledge");
    let activityFinished = false;
    const finish = (state: "success" | "error" | "cancelled") => {
      if (!activityFinished) finishActivity(activity, state);
      activityFinished = true;
    };
    setUploading(list.map((file) => file.webkitRelativePath || file.name));
    setBatch(undefined);
    setError(ignored.length ? `已忽略 ${ignored.length} 个不支持的文件：${ignored.slice(0, 3).map((file) => file.name).join("、")}${ignored.length > 3 ? "…" : ""}` : "");
    try {
      let job = await api.batchUpload(list, targetCollection);
      setBatch(job);
      for (let attempt = 0; attempt < 120 && ["queued", "processing"].includes(job.status); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        if (uploadCancelled.current) { finish("cancelled"); return; }
        job = await api.batchStatus(job.batch_id);
        if (uploadCancelled.current) { finish("cancelled"); return; }
        setBatch(job);
      }
      if (uploadCancelled.current) { finish("cancelled"); return; }
      if (["queued", "processing"].includes(job.status)) {
        throw new Error("导入处理超过 60 秒。批次状态已保留，请稍后重新打开知识空间检查结果。");
      }
      if (job.failed) setError(`${job.failed} 个文件入库失败，可展开批次查看原因。`);
      setDocuments(await api.documents(undefined, targetCollection));
      await scope.refresh(targetCollection);
      finish(job.failed ? "error" : "success");
    } catch (reason) {
      finish("error");
      setError((reason as Error).message);
    } finally {
      if (uploadCancelled.current) return;
      setUploading([]);
      setDragging(false);
      if (fileRef.current) fileRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  }

  async function importFolder(files: FileList) {
    const list = Array.from(files);
    if (!list.length) return;
    setError("");
    try {
      const folderName = list[0]?.webkitRelativePath.split("/")[0]?.trim() || "导入的文件夹";
      const existing = collections.find((item) => item.name === folderName);
      let targetId = existing?.id;
      if (!targetId) {
        const created = await api.createCollection(folderName, "从本地文件夹导入");
        targetId = created.id;
        await scope.refresh(targetId);
      }
      scope.selectCollection(targetId);
      await upload(list, targetId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文件夹导入失败");
    }
  }

  async function search() {
    if (!query.trim() || !activeCollection) return;
    setSearching(true);
    setError("");
    setAnswer("");
    const needsWarmup = mode !== "keyword" && !semanticPrepared;
    if (needsWarmup) setWarmingRetrieval(true);
    try {
      const filters: Record<string, unknown> = {};
      if (type) filters.type = type;
      if (year) filters.year_gte = Number(year);
      setHits((await api.search(query, mode, filters, activeCollection.id)).hits);
      if (needsWarmup) setSemanticPrepared(true);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSearching(false);
      setWarmingRetrieval(false);
    }
  }

  async function ask() {
    if (!query.trim() || !activeCollection) return;
    setSearching(true);
    setError("");
    setHits([]);
    const needsWarmup = !semanticPrepared;
    if (needsWarmup) setWarmingRetrieval(true);
    try {
      const response = await api.qa(query, activeCollection.id);
      setAnswer(response.answer);
      setCitations(response.citations);
      if (needsWarmup) setSemanticPrepared(true);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSearching(false);
      setWarmingRetrieval(false);
    }
  }

  async function openDocument(id: string, hit: SearchHit | null = null) {
    try {
      setFocusedHit(hit);
      setPreview(await api.document(id));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function removeDocument(id: string) {
    setDeleting(true); setDeleteError("");
    try {
      await api.deleteDocument(id);
      setPreview(null);
      await Promise.all([loadDocuments(), scope.refresh(collection)]);
      setPendingDelete(undefined);
    } catch (reason) {
      setDeleteError((reason as Error).message);
    } finally { setDeleting(false); }
  }

  async function copyHash() {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.storage_hash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function anchorClick(anchor: string) {
    const citation = citations.find((item) => item.anchor.toLowerCase() === anchor.toLowerCase());
    if (citation) void openDocument(citation.document_id);
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="eyebrow text-brand">文件夹问答</div>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-.04em]">针对一个文件夹，持续问答。</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">每个文件夹都是独立的研究范围。回答只使用当前文件夹内的资料，并保留可点击出处。</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-secondary shrink-0"><FolderPlus size={15} />新建文件夹</button>
      </header>

      {error && <div role="alert" className="mb-5 flex items-start rounded-apple border border-status-err/20 bg-status-err/[.07] px-4 py-3 text-sm text-status-err"><span className="flex-1">{error}</span><button onClick={() => setError("")} className="grid h-8 w-8 place-items-center" aria-label="关闭错误"><X size={14} /></button></div>}

      <section className="mx-auto min-w-0 max-w-5xl">

          <input ref={fileRef} className="hidden" type="file" multiple accept=".pdf,.csv,.tsv,.xlsx,.py,.ipynb,.md,.txt,.zip" onChange={(event) => event.target.files && void upload(event.target.files)} />
          <input ref={folderRef} className="hidden" type="file" multiple {...folderPickerAttributes} onChange={(event) => event.target.files && void importFolder(event.target.files)} />

          {!activeCollection ? (
            <section className="grid min-h-[580px] place-items-center rounded-appleXl border bg-surface px-6 py-14 text-center">
              <div className="max-w-lg">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-brand/10 text-brand"><FolderOpen size={24} /></span>
                <h2 className="mt-6 text-2xl font-semibold">导入一个文件夹，建立问答范围。</h2>
                <p className="mt-3 text-sm leading-7 text-muted">每个导入的文件夹都是独立研究范围。之后的检索、问答和引用都只针对其中资料。</p>
                <div className="mt-7 flex flex-wrap justify-center gap-3"><button onClick={() => folderRef.current?.click()} className="btn-primary"><FolderOpen size={15} />导入文件夹</button><button onClick={() => setCreateOpen(true)} className="btn-secondary">新建空白文件夹</button></div>
                {unfiled.length > 0 && <button onClick={() => scope.openManager({ selectUnfiled: true })} className="btn-secondary mt-4">整理现有 {unfiled.length} 份资料</button>}
              </div>
            </section>
          ) : (
            <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files); }} className="relative min-h-[620px]">
              {dragging && <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-appleXl border-2 border-dashed border-brand bg-surface/95 text-sm font-semibold text-brand">松手添加到“{activeCollection.name}”</div>}

              <div className="flex flex-wrap items-start gap-3 border-b pb-5">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-2xl font-semibold">{activeCollection.name}</h2><span className="inline-flex items-center gap-1 rounded-full bg-status-ok/10 px-2.5 py-1 text-[11px] font-semibold text-status-ok"><ShieldCheck size={12} />当前问答范围</span></div><p className="mt-1 text-sm text-muted">{activeCollection.description || `${documents.length} 份资料，只在此空间内检索`}</p></div>
                <button onClick={() => fileRef.current?.click()} className="btn-secondary h-10 px-4"><UploadCloud size={14} />添加文件</button>
                <button onClick={() => folderRef.current?.click()} className="btn-secondary h-10 px-4"><FolderOpen size={14} />导入文件夹</button>
                <button onClick={() => { setDeleteError(""); setPendingDelete({ kind: "collection", id: activeCollection.id, name: activeCollection.name }); }} className="grid h-10 w-10 place-items-center rounded-full text-subtle hover:bg-status-err/10 hover:text-status-err" aria-label={`删除空间${activeCollection.name}`} title="删除空间"><Trash2 size={15} /></button>
              </div>

              <p className="mt-3 text-xs leading-5 text-subtle">支持 PDF、CSV/TSV、Excel、Notebook、Python、Markdown、文本与 ZIP；单批最多 100 个文件 / 100 MB。扫描版 PDF 会明确提示先做 OCR，不会伪装成解析成功。</p>

              {batch && <BatchProgress batch={batch} />}

              {loading ? <div className="mt-8 h-48 animate-pulse rounded-appleLg bg-ink/[.05]" /> : documents.length === 0 ? (
                <div className="mt-8 rounded-appleLg border border-dashed py-14"><EmptyState title="这个空间还没有资料" description="添加文件或导入文件夹后，才会开启当前空间的可信问答。" action={<div className="flex flex-wrap justify-center gap-2"><button onClick={() => fileRef.current?.click()} className="btn-primary"><UploadCloud size={14} />添加文件</button><button onClick={() => folderRef.current?.click()} className="btn-secondary"><FolderOpen size={14} />导入文件夹</button></div>} /></div>
              ) : (
                <>
                  <section className="mt-8 rounded-appleLg border bg-surface p-4 sm:p-5">
                    <div className="flex items-center gap-3"><Search size={18} className="shrink-0 text-subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void ask()} className="min-h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-subtle" placeholder={`向“${activeCollection.name}”提问…`} />{searching && <span className="h-2 w-2 animate-pulse rounded-full bg-status-warn" />}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted"><ShieldCheck size={13} className="text-status-ok" /><span className="mr-auto">{warmingRetrieval ? "正在准备语义检索，完成后会自动继续" : `仅使用当前空间的 ${documents.length} 份资料`}</span><select value={mode} onChange={(event) => setMode(event.target.value)} className="input h-9 py-0 text-xs">{modes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button onClick={() => void search()} disabled={searching || !query.trim()} className="btn-secondary h-9 px-4">检索</button><button onClick={() => void ask()} disabled={searching || !query.trim()} className="btn-primary h-9 px-4"><Sparkles size={14} />提问</button></div>
                  </section>

                  {answer && <section className="mt-6 rounded-appleLg border bg-surface p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><Sparkles size={16} className="text-brand" /><h3 className="font-semibold">回答</h3><span className="ml-auto text-xs text-status-ok">基于 {activeCollection.name}</span></div><div className="max-w-3xl"><AnchoredMarkdown text={answer} onAnchor={anchorClick} /></div><div className="mt-5 flex flex-wrap gap-2">{citations.map((item) => <button onClick={() => void openDocument(item.document_id)} key={item.chunk_id} className="rounded-appleSm bg-ink/[.05] px-2.5 py-1.5 font-mono text-xs text-muted hover:text-brand">{item.anchor} 查看原文</button>)}</div></section>}

                  {hits.length > 0 && <SearchResults hits={hits} onOpen={openDocument} />}

                  <details className="mt-6 overflow-hidden rounded-appleLg border bg-surface">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-5"><Folder size={17} className="text-brand" /><span><strong className="block text-sm">资料来源</strong><span className="mt-0.5 block text-xs text-muted">{documents.length} 份文件，默认收起</span></span><ChevronDown size={16} className="ml-auto text-subtle" /></summary>
                    <div className="border-t">
                      <div className="flex flex-wrap items-center gap-2 px-5 py-3"><select value={type} onChange={(event) => setType(event.target.value)} className="input h-9 py-0 text-xs"><option value="">所有类型</option><option value="paper">论文</option><option value="note">笔记</option><option value="code">代码</option><option value="other">数据/其他</option></select><input value={year} onChange={(event) => setYear(event.target.value)} className="input h-9 w-24 py-0 text-xs" inputMode="numeric" placeholder="年份 ≥" /><span className="ml-auto text-xs text-muted">{visible.length} 项</span></div>
                      <DocumentList documents={visible} onOpen={openDocument} />
                    </div>
                  </details>
                </>
              )}
            </div>
          )}
      </section>

      <Sheet open={createOpen} onOpenChange={setCreateOpen} title="新建研究文件夹" side="bottom">
        <div className="mx-auto max-w-xl"><p className="text-sm leading-6 text-muted">同一主题或文件夹的资料共享一个独立问答范围。</p><label className="mt-5 block text-xs font-semibold text-muted">名称</label><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} className="input mt-2 w-full" placeholder="例如：XPS 表征资料" maxLength={200} /><label className="mt-4 block text-xs font-semibold text-muted">描述（可选）</label><textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="input mt-2 min-h-24 w-full resize-none py-3" placeholder="这个空间用于研究什么？" maxLength={1000} /><div className="mt-6 flex justify-end gap-2"><button onClick={() => setCreateOpen(false)} className="btn-secondary">取消</button><button disabled={!newName.trim() || savingCollection} onClick={() => void createCollection()} className="btn-primary">{savingCollection ? "创建中…" : "创建空间"}</button></div></div>
      </Sheet>

      <Sheet open={Boolean(preview)} onOpenChange={(open) => { if (!open) { setPreview(null); setFocusedHit(null); } }} title={preview ? displayDocumentTitle(preview) : "资料详情"}>
        {preview && <DocumentPreview preview={preview} focusedHit={focusedHit} copied={copied} onCopy={copyHash} onDelete={(id) => { setDeleteError(""); setPendingDelete({ kind: "document", id, name: displayDocumentTitle(preview) }); }} />}
      </Sheet>
      <ConfirmDialog open={!!pendingDelete} title={pendingDelete?.kind === "collection" ? "删除研究文件夹" : "永久删除资料"} description={pendingDelete?.kind === "collection" ? `“${pendingDelete.name}”中的资料会保留并移到未归档，不会删除原文件。` : `将删除“${pendingDelete?.name || ""}”、文本切块和关联数据记录。此操作无法撤销；既有运行与产物账本仍保留审计信息。`} confirmLabel={pendingDelete?.kind === "collection" ? "删除文件夹" : "删除资料"} busy={deleting} error={deleteError} onCancel={() => setPendingDelete(undefined)} onConfirm={() => pendingDelete?.kind === "collection" ? removeCollection() : pendingDelete ? removeDocument(pendingDelete.id) : undefined}/>
    </main>
  );
}

function BatchProgress({ batch }: { batch: BatchStatus }) {
  const running = ["queued", "processing"].includes(batch.status);
  const duplicates = batch.items.filter((item) => item.duplicate).length;
  return <section className="mt-5 rounded-apple border bg-surface p-4"><div className="flex items-center gap-3 text-sm"><UploadCloud size={15} className={running ? "animate-pulse text-brand" : batch.failed ? "text-status-err" : "text-status-ok"} /><span className="font-semibold">{running ? "正在解析并建立索引" : batch.status === "success" ? `已处理 ${batch.completed} 个文件` : `已处理 ${batch.completed} 个，${batch.failed} 个需修正`}</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[.07]"><div className={`h-full ${batch.failed ? "bg-status-err" : "bg-brand"}`} style={{ width: `${batch.total ? ((batch.completed + batch.failed) / batch.total) * 100 : 0}%` }} /></div><span className="text-xs text-muted">{batch.completed + batch.failed}/{batch.total}</span></div>{!running && <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-status-ok/10 px-2 py-1 text-status-ok">{batch.completed - duplicates} 个新文件</span>{duplicates > 0 && <span className="rounded-full bg-brand/10 px-2 py-1 text-brand">{duplicates} 个重复文件已复用</span>}{batch.failed > 0 && <span className="rounded-full bg-status-err/10 px-2 py-1 text-status-err">{batch.failed} 个失败</span>}</div>}{!running && <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-muted">查看解析明细</summary><div className="mt-2 divide-y">{batch.items.map((item) => <div key={item.filename} className="flex gap-3 py-2"><span className="min-w-0 flex-1 truncate">{item.filename}</span><span className={item.status === "error" ? "text-status-err" : item.duplicate ? "text-brand" : "text-status-ok"}>{item.status === "error" ? item.error : item.duplicate ? "内容重复 · 已复用" : item.dataset_id ? "数据表已就绪" : "文本索引已就绪"}</span></div>)}</div></details>}</section>;
}

const supportedUploadExtensions = [".pdf", ".csv", ".tsv", ".xlsx", ".py", ".ipynb", ".md", ".txt", ".zip"];
function isSupportedUpload(file: File) {
  const name = (file.webkitRelativePath || file.name).toLowerCase();
  return supportedUploadExtensions.some((extension) => name.endsWith(extension));
}

function DocumentList({ documents, onOpen }: { documents: DocumentItem[]; onOpen: (id: string) => void }) {
  return <div className="max-h-[420px] divide-y overflow-y-auto">{documents.map((document) => { const Icon = icons[document.type]; return <button key={document.id} onClick={() => onOpen(document.id)} className="flex min-h-[68px] w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink/[.035]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-appleSm bg-ink/[.05] text-muted"><Icon size={16} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{displayDocumentTitle(document)}</strong><span className="mt-1 block truncate text-xs text-muted">{document.filename}</span></span><span className="hidden text-xs text-subtle sm:block">{typeNames[document.type]}</span></button>; })}</div>;
}

function SearchResults({ hits, onOpen }: { hits: SearchHit[]; onOpen: (id: string, hit: SearchHit) => void }) {
  return <section className="mt-6 rounded-appleLg border bg-surface p-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">检索结果</h3><span className="text-xs text-muted">按相关度排序</span></div><div className="divide-y">{hits.map((hit, index) => <article key={hit.chunk_id} className="py-4 first:pt-0"><div className="flex gap-3"><span className="text-xs text-subtle">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center gap-2 text-xs text-muted"><span>{hit.section || "未命名章节"}</span><span className="ml-auto font-mono">{hit.score.toFixed(3)}</span></div><p className="line-clamp-3 text-sm leading-6">{hit.content}</p><button onClick={() => onOpen(hit.document_id, hit)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand"><LocateFixed size={12} />定位原文</button></div></div></article>)}</div></section>;
}

function DocumentPreview({ preview, focusedHit, copied, onCopy, onDelete }: { preview: DocumentDetail; focusedHit: SearchHit | null; copied: boolean; onCopy: () => Promise<void>; onDelete: (id: string) => void }) {
  return <div>{focusedHit && <section className="rounded-apple border-l-2 border-brand bg-brand/[.06] px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-brand"><LocateFixed size={13} />检索命中</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{focusedHit.content}</p></section>}<dl className="mt-6 grid grid-cols-2 gap-5 text-sm"><div><dt className="text-xs text-muted">类型</dt><dd className="mt-1">{typeNames[preview.type]}</dd></div><div><dt className="text-xs text-muted">年份</dt><dd className="mt-1">{preview.year ?? "—"}</dd></div><div><dt className="text-xs text-muted">文本切块</dt><dd className="mt-1">{preview.chunks_count}</dd></div><div><dt className="text-xs text-muted">DOI</dt><dd className="mt-1 truncate">{preview.doi ?? "—"}</dd></div><div className="col-span-2"><dt className="text-xs text-muted">SHA-256 内容指纹</dt><dd className="mt-1 break-all font-mono text-[11px] text-muted">{preview.storage_hash}</dd></div></dl>{preview.schema_json && <div className="mt-6"><h3 className="text-sm font-semibold">数据结构 · {preview.schema_json.row_count} 行</h3><div className="mt-2 divide-y border-y">{preview.schema_json.columns?.map((column) => <div key={column.name} className="flex justify-between py-2 text-xs"><span className="font-mono">{column.name}</span><span className="text-muted">{column.dtype}</span></div>)}</div></div>}{preview.dataset_id && preview.schema_json && <DatasetInspector datasetId={preview.dataset_id} schema={preview.schema_json}/>}<div className="mt-8 flex gap-2 border-t pt-4"><button onClick={() => void onDelete(preview.id)} className="btn-secondary text-status-err"><Trash2 size={14} />删除</button><button onClick={() => void onCopy()} className="btn-secondary ml-auto">{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "已复制" : "复制指纹"}</button></div></div>;
}
