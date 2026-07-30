"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  MessageSquarePlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

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
  type DocumentDetail,
  type DocumentItem,
  type SearchHit,
} from "@/lib/api";
import { displayDocumentTitle } from "@/lib/documentTitle";

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
  const [type, setType] = useState("");
  const [year, setYear] = useState("");
  const [uploading, setUploading] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchStatus>();
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<DocumentDetail | null>(null);
  const [focusedHit, setFocusedHit] = useState<SearchHit | null>(null);
  const [copied, setCopied] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexError, setReindexError] = useState("");
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
    setBatch(undefined); setType(""); setYear("");
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
    const list = selectedFiles;
    if (!targetCollection) return;
    if (!list.length) { setError("没有选择任何文件。"); return; }
    const totalBytes = list.reduce((sum, file) => sum + file.size, 0);
    if (list.length > 100) { setError("一次最多导入 100 个文件，请分批上传。"); return; }
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
    setError("");
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

  async function openDocument(id: string, hit: SearchHit | null = null) {
    try {
      setReindexError("");
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

  async function reindexDocument() {
    if (!preview || reindexing) return;
    setReindexing(true);
    setReindexError("");
    try {
      await api.reindexDocument(preview.id);
      setPreview(await api.document(preview.id));
      await Promise.all([loadDocuments(), scope.refresh(collection)]);
    } catch (reason) {
      setReindexError(reason instanceof Error ? reason.message : "语义索引重建失败");
    } finally {
      setReindexing(false);
    }
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

          <input ref={fileRef} className="hidden" type="file" multiple onChange={(event) => event.target.files && void upload(event.target.files)} />
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
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-2xl font-semibold">{activeCollection.name}</h2><span className="inline-flex items-center gap-1 rounded-full bg-status-ok/10 px-2.5 py-1 text-[11px] font-semibold text-status-ok"><ShieldCheck size={12} />独立研究范围</span></div><p className="mt-1 text-sm text-muted">{activeCollection.description || `${documents.length} 份资料，仅供该文件夹下的对话使用`}</p></div>
                <Link href={`/analysis?collection=${activeCollection.id}`} className="btn-primary h-10 px-4"><MessageSquarePlus size={14} />进入对话</Link>
                <button onClick={() => fileRef.current?.click()} className="btn-secondary h-10 px-4"><UploadCloud size={14} />添加文件</button>
                <button onClick={() => folderRef.current?.click()} className="btn-secondary h-10 px-4"><FolderOpen size={14} />导入文件夹</button>
                <button onClick={() => { setDeleteError(""); setPendingDelete({ kind: "collection", id: activeCollection.id, name: activeCollection.name }); }} className="grid h-10 w-10 place-items-center rounded-full text-subtle hover:bg-status-err/10 hover:text-status-err" aria-label={`删除空间${activeCollection.name}`} title="删除空间"><Trash2 size={15} /></button>
              </div>

              <p className="mt-3 text-xs leading-5 text-subtle">可直接导入任意文件、完整文件夹或 ZIP，系统会按内容自动识别。可解析内容会建立全文索引或数据表；暂不能提取的二进制文件仍会安全入库并标明状态。单批最多 100 个文件 / 100 MB。</p>

              {batch && <BatchProgress batch={batch} />}

              {loading ? <div className="mt-8 h-48 animate-pulse rounded-appleLg bg-ink/[.05]" /> : documents.length === 0 ? (
                <div className="mt-8 rounded-appleLg border border-dashed py-14"><EmptyState title="这个空间还没有资料" description="添加文件或导入文件夹后，才会开启当前空间的可信问答。" action={<div className="flex flex-wrap justify-center gap-2"><button onClick={() => fileRef.current?.click()} className="btn-primary"><UploadCloud size={14} />添加文件</button><button onClick={() => folderRef.current?.click()} className="btn-secondary"><FolderOpen size={14} />导入文件夹</button></div>} /></div>
              ) : (
                <>
                  <details className="mt-8 overflow-hidden rounded-appleLg border bg-surface" open>
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

      <Sheet open={Boolean(preview)} onOpenChange={(open) => { if (!open) { setPreview(null); setFocusedHit(null); setReindexError(""); } }} title={preview ? displayDocumentTitle(preview) : "资料详情"}>
        {preview && <DocumentPreview preview={preview} focusedHit={focusedHit} copied={copied} reindexing={reindexing} reindexError={reindexError} onCopy={copyHash} onReindex={reindexDocument} onDelete={(id) => { setDeleteError(""); setPendingDelete({ kind: "document", id, name: displayDocumentTitle(preview) }); }} />}
      </Sheet>
      <ConfirmDialog open={!!pendingDelete} title={pendingDelete?.kind === "collection" ? "删除研究文件夹" : "永久删除资料"} description={pendingDelete?.kind === "collection" ? `“${pendingDelete.name}”中的资料会保留并移到未归档，不会删除原文件。` : `将删除“${pendingDelete?.name || ""}”、文本切块和关联数据记录。此操作无法撤销；既有运行与产物账本仍保留审计信息。`} confirmLabel={pendingDelete?.kind === "collection" ? "删除文件夹" : "删除资料"} busy={deleting} error={deleteError} onCancel={() => setPendingDelete(undefined)} onConfirm={() => pendingDelete?.kind === "collection" ? removeCollection() : pendingDelete ? removeDocument(pendingDelete.id) : undefined}/>
    </main>
  );
}

function BatchProgress({ batch }: { batch: BatchStatus }) {
  const running = ["queued", "processing"].includes(batch.status);
  const duplicates = batch.items.filter((item) => item.duplicate).length;
  const attention = batch.items.filter((item) => item.parse_status === "needs_attention").length;
  const stored = batch.items.filter((item) => item.parse_status === "stored").length;
  const repaired = batch.items.filter((item) => item.parser?.startsWith("ragged_")).length;
  return <section className="mt-5 rounded-apple border bg-surface p-4"><div className="flex items-center gap-3 text-sm"><UploadCloud size={15} className={running ? "animate-pulse text-brand" : batch.failed ? "text-status-err" : attention || repaired ? "text-status-warn" : "text-status-ok"} /><span className="font-semibold">{running ? "正在识别内容并建立索引" : batch.status === "success" ? `已接收 ${batch.completed} 个文件` : `已接收 ${batch.completed} 个，${batch.failed} 个入库失败`}</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[.07]"><div className={`h-full ${batch.failed ? "bg-status-err" : attention || repaired ? "bg-status-warn" : "bg-brand"}`} style={{ width: `${batch.total ? ((batch.completed + batch.failed) / batch.total) * 100 : 0}%` }} /></div><span className="text-xs text-muted">{batch.completed + batch.failed}/{batch.total}</span></div>{!running && <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-status-ok/10 px-2 py-1 text-status-ok">{batch.completed - duplicates} 个新文件</span>{repaired > 0 && <span className="rounded-full bg-status-warn/10 px-2 py-1 text-status-warn">{repaired} 个数据表已无损规整</span>}{stored > 0 && <span className="rounded-full bg-ink/[.05] px-2 py-1 text-muted">{stored} 个原样保存</span>}{attention > 0 && <span className="rounded-full bg-status-warn/10 px-2 py-1 text-status-warn">{attention} 个待增强解析</span>}{duplicates > 0 && <span className="rounded-full bg-brand/10 px-2 py-1 text-brand">{duplicates} 个重复文件已复用</span>}{batch.failed > 0 && <span className="rounded-full bg-status-err/10 px-2 py-1 text-status-err">{batch.failed} 个入库失败</span>}</div>}{!running && <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-muted">查看解析明细</summary><div className="mt-2 divide-y">{batch.items.map((item) => <div key={item.filename} className="flex gap-3 py-2"><span className="min-w-0 flex-1 truncate">{item.filename}</span><span className={item.status === "error" ? "text-status-err" : item.duplicate ? "text-brand" : item.parse_status === "needs_attention" || item.parser?.startsWith("ragged_") ? "text-status-warn" : item.parse_status === "stored" ? "text-muted" : "text-status-ok"}>{item.status === "error" ? item.error : item.duplicate ? "内容重复 · 已复用" : item.message || parseStatusLabel(item.parse_status)}</span></div>)}</div></details>}</section>;
}

type ParseStatus = "indexed" | "structured" | "stored" | "needs_attention";

function documentParseStatus(document: DocumentItem): ParseStatus | undefined {
  const status = document.metadata?.parse_status;
  return status === "indexed" || status === "structured" || status === "stored" || status === "needs_attention" ? status : undefined;
}

function documentWasRepaired(document: DocumentItem) {
  return typeof document.metadata?.parser === "string" && document.metadata.parser.startsWith("ragged_");
}

function parseStatusLabel(status: ParseStatus | null | undefined) {
  if (status === "structured") return "数据表已就绪";
  if (status === "indexed") return "全文索引已就绪";
  if (status === "stored") return "原始文件已保存";
  if (status === "needs_attention") return "已保存 · 待增强解析";
  return "已接收";
}

function DocumentList({ documents, onOpen }: { documents: DocumentItem[]; onOpen: (id: string) => void }) {
  return <div className="max-h-[420px] divide-y overflow-y-auto">{documents.map((document) => { const Icon = icons[document.type]; const status = documentParseStatus(document); const repaired = documentWasRepaired(document); return <button key={document.id} onClick={() => onOpen(document.id)} className="flex min-h-[68px] w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink/[.035]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-appleSm bg-ink/[.05] text-muted"><Icon size={16} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{displayDocumentTitle(document)}</strong><span className="mt-1 block truncate text-xs text-muted">{document.filename}</span></span>{status && <span className={`hidden rounded-full px-2 py-1 text-[11px] sm:block ${status === "needs_attention" || repaired ? "bg-status-warn/10 text-status-warn" : status === "stored" ? "bg-ink/[.05] text-muted" : "bg-status-ok/10 text-status-ok"}`}>{repaired ? "数据表已无损规整" : parseStatusLabel(status)}</span>}<span className="hidden text-xs text-subtle md:block">{typeNames[document.type]}</span></button>; })}</div>;
}

function DocumentPreview({ preview, focusedHit, copied, reindexing, reindexError, onCopy, onReindex, onDelete }: { preview: DocumentDetail; focusedHit: SearchHit | null; copied: boolean; reindexing: boolean; reindexError: string; onCopy: () => Promise<void>; onReindex: () => Promise<void>; onDelete: (id: string) => void }) {
  const status = documentParseStatus(preview);
  const repaired = documentWasRepaired(preview);
  const message = typeof preview.metadata?.message === "string" ? preview.metadata.message : undefined;
  return <div>{focusedHit && <section className="rounded-apple border-l-2 border-brand bg-brand/[.06] px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-brand"><LocateFixed size={13} />检索命中</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{focusedHit.content}</p></section>}{status && <section className={`rounded-apple px-4 py-3 text-sm ${focusedHit ? "mt-4" : ""} ${status === "needs_attention" || repaired ? "bg-status-warn/[.08] text-status-warn" : status === "stored" ? "bg-ink/[.04] text-muted" : "bg-status-ok/[.08] text-status-ok"}`}><strong>{repaired ? "数据表已无损规整" : parseStatusLabel(status)}</strong>{message && <p className="mt-1 text-xs leading-5 opacity-90">{message}</p>}</section>}{reindexError && <div role="alert" className="status-error mt-4">{reindexError}</div>}<dl className="mt-6 grid grid-cols-2 gap-5 text-sm"><div><dt className="text-xs text-muted">类型</dt><dd className="mt-1">{typeNames[preview.type]}</dd></div><div><dt className="text-xs text-muted">年份</dt><dd className="mt-1">{preview.year ?? "—"}</dd></div><div><dt className="text-xs text-muted">文本切块</dt><dd className="mt-1">{preview.chunks_count}</dd></div><div><dt className="text-xs text-muted">DOI</dt><dd className="mt-1 truncate">{preview.doi ?? "—"}</dd></div><div className="col-span-2"><dt className="text-xs text-muted">SHA-256 内容指纹</dt><dd className="mt-1 break-all font-mono text-[11px] text-muted">{preview.storage_hash}</dd></div></dl>{preview.schema_json && <div className="mt-6"><h3 className="text-sm font-semibold">数据结构 · {preview.schema_json.row_count} 行</h3><div className="mt-2 divide-y border-y">{preview.schema_json.columns?.map((column) => <div key={column.name} className="flex justify-between py-2 text-xs"><span className="font-mono">{column.name}</span><span className="text-muted">{column.dtype}</span></div>)}</div></div>}{preview.dataset_id && preview.schema_json && <DatasetInspector datasetId={preview.dataset_id} schema={preview.schema_json}/>}<div className="mt-8 flex flex-wrap gap-2 border-t pt-4"><button onClick={() => void onDelete(preview.id)} className="btn-secondary text-status-err"><Trash2 size={14} />删除</button>{preview.chunks_count > 0 && <button onClick={() => void onReindex()} disabled={reindexing} className="btn-secondary ml-auto"><RefreshCw size={14} className={reindexing ? "animate-spin" : ""} />{reindexing ? "正在重建…" : "重建语义索引"}</button>}<button onClick={() => void onCopy()} className={`btn-secondary ${preview.chunks_count > 0 ? "" : "ml-auto"}`}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "已复制" : "复制指纹"}</button></div></div>;
}
