"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckSquare2, Database, FileCode2, FileText, FolderInput, FolderPlus, Pencil, Search, Trash2, X } from "lucide-react";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { api, type DocumentItem } from "@/lib/api";
import { displayDocumentTitle } from "@/lib/documentTitle";
import { useWorkspaceScope } from "./WorkspaceScope";

type View = "all" | "current" | "unfiled";

const icons = { paper: FileText, note: FileText, code: FileCode2, other: Database };

export function DocumentManager() {
  const scope = useWorkspaceScope();
  const [view, setView] = useState<View>("unfiled");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [targetCollection, setTargetCollection] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DocumentItem[]>([]);

  useEffect(() => {
    if (scope.managerOpen) {
      setView(scope.unfiledCount ? "unfiled" : scope.activeId ? "current" : "all");
      setSelected(scope.managerSelectUnfiled ? scope.documents.filter((item) => !item.collection_id).map((item) => item.id) : []);
      setQuery("");
      setError("");
      setTargetCollection(scope.activeId || "");
      setCreatingFolder(false);
      setEditingId("");
      setPendingDelete([]);
    }
  }, [scope.managerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return scope.documents.filter((document) => {
      if (view === "current" && document.collection_id !== scope.activeId) return false;
      if (view === "unfiled" && document.collection_id) return false;
      return !keyword || `${document.title || ""} ${document.filename}`.toLowerCase().includes(keyword);
    });
  }, [query, scope.activeId, scope.documents, view]);

  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const toggleAll = () => setSelected((items) => visible.every((item) => items.includes(item.id)) ? items.filter((id) => !visible.some((item) => item.id === id)) : Array.from(new Set([...items, ...visible.map((item) => item.id)])));

  const remove = async (documents: DocumentItem[]) => {
    if (!documents.length) return;
    setDeleting(true);
    setError("");
    try {
      await Promise.all(documents.map((document) => api.deleteDocument(document.id)));
      setSelected((items) => items.filter((id) => !documents.some((document) => document.id === id)));
      await scope.refresh(scope.activeId);
      setPendingDelete([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料删除失败");
      await scope.refresh(scope.activeId);
    } finally {
      setDeleting(false);
    }
  };

  const moveSelected = async (collectionId: string | null) => {
    if (!selected.length) return;
    setMoving(true); setError("");
    try {
      await api.organizeDocuments(selected, collectionId);
      setSelected([]);
      await scope.refresh(collectionId || scope.activeId);
      if (collectionId) scope.selectCollection(collectionId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料移动失败");
    } finally { setMoving(false); }
  };
  const createAndMove = async () => {
    if (!newFolderName.trim() || !selected.length) return;
    setMoving(true); setError("");
    try {
      const created = await api.createCollection(newFolderName.trim());
      await api.organizeDocuments(selected, created.id);
      setSelected([]); setNewFolderName(""); setCreatingFolder(false);
      await scope.refresh(created.id); scope.selectCollection(created.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法创建文件夹并移动资料"); }
    finally { setMoving(false); }
  };
  const saveTitle = async (document: DocumentItem) => {
    const title = editingTitle.trim();
    if (!title) return;
    setMoving(true); setError("");
    try { await api.updateDocument(document.id, { title }); setEditingId(""); await scope.refresh(scope.activeId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "重命名失败"); }
    finally { setMoving(false); }
  };

  const deleteLabel = pendingDelete.length === 1 ? `“${displayDocumentTitle(pendingDelete[0])}”` : `选中的 ${pendingDelete.length} 份资料`;
  return <>
    <Sheet open={scope.managerOpen} onOpenChange={(open) => open ? scope.openManager() : scope.closeManager()} title="资料管理" side="right">
      <div className="flex min-h-[calc(100vh-92px)] flex-col">
        <div>
          <p className="text-[14px] leading-6 text-muted">直接选择并删除资料，不需要先打开详情。删除文件夹不会删除资料，只会把它们移到未归档。</p>
          <div className="mt-5 w-full overflow-x-auto"><SegmentedControl value={view} onChange={(value) => { setView(value); setSelected([]); }} label="资料范围" segments={[{ value: "all", label: `全部 ${scope.documents.length}` }, { value: "current", label: `当前 ${scope.activeCollection?.document_count ?? 0}` }, { value: "unfiled", label: `未归档 ${scope.unfiledCount}` }]} /></div>
          <div className="mt-4 flex h-11 items-center gap-2 rounded-full border bg-surface px-4 focus-within:border-brand"><Search size={15} className="text-subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" placeholder="搜索文件名" /></div>
        </div>

        {error && <div className="mt-4 rounded-appleSm bg-status-err/10 px-3 py-2 text-sm text-status-err">{error}</div>}

        <div className="mt-5 flex items-center border-b pb-3 text-xs text-muted"><button onClick={toggleAll} disabled={!visible.length} className="inline-flex min-h-9 items-center gap-2 rounded-full px-2 hover:bg-ink/[.05] disabled:opacity-40"><CheckSquare2 size={14} />{visible.length && visible.every((item) => selected.includes(item.id)) ? "取消全选" : "全选当前列表"}</button><span className="ml-auto">{visible.length} 项</span></div>

        <div className="min-h-0 flex-1 divide-y overflow-y-auto">
          {visible.map((document) => {
            const Icon = icons[document.type];
            const checked = selected.includes(document.id);
            const displayTitle = displayDocumentTitle(document);
            return <div key={document.id} className={`group flex min-h-[72px] items-center gap-3 py-3 transition-colors ${checked ? "bg-brand/[.06]" : "hover:bg-ink/[.025]"}`}><input type="checkbox" checked={checked} onChange={() => toggle(document.id)} aria-label={`选择${displayTitle}`} className="h-4 w-4 accent-brand" /><span className="grid h-9 w-9 shrink-0 place-items-center rounded-appleSm bg-ink/[.045] text-muted"><Icon size={16} /></span>{editingId === document.id ? <div className="flex min-w-0 flex-1 items-center gap-1"><input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(document); if (event.key === "Escape") setEditingId(""); }} className="h-9 min-w-0 flex-1 rounded-full border bg-surface px-3 text-sm outline-none focus:border-brand" aria-label="资料标题" /><button onClick={() => void saveTitle(document)} className="grid h-9 w-9 place-items-center rounded-full text-status-ok hover:bg-status-ok/10" aria-label="保存标题"><Check size={14} /></button><button onClick={() => setEditingId("")} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-ink/[.05]" aria-label="取消重命名"><X size={14} /></button></div> : <button onClick={() => toggle(document.id)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-[14px] font-semibold tracking-[-.01em]">{displayTitle}</strong><span className="mt-1 block truncate text-xs text-subtle">{document.filename}</span></button>}<button onClick={() => { setEditingId(document.id); setEditingTitle(displayTitle); }} disabled={moving} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-subtle hover:bg-brand/10 hover:text-brand" aria-label={`重命名${displayTitle}`}><Pencil size={14} /></button><button onClick={() => { setError(""); setPendingDelete([document]); }} disabled={deleting} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-subtle transition hover:bg-status-err/10 hover:text-status-err active:scale-95" aria-label={`删除${displayTitle}`}><Trash2 size={15} /></button></div>;
          })}
          {!visible.length && <div className="grid min-h-52 place-items-center text-center"><div><FileText className="mx-auto text-subtle" size={24} /><p className="mt-3 text-sm text-muted">当前范围没有资料</p></div></div>}
        </div>

        <div className="material sticky bottom-0 -mx-5 mt-4 border-t px-5 py-3"><div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm text-muted">已选择 {selected.length} 项</span>{selected.length > 0 && <><select value={targetCollection} onChange={(event) => setTargetCollection(event.target.value)} className="h-9 max-w-48 rounded-full border bg-surface px-3 text-xs"><option value="">移到未归档</option>{scope.collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => void moveSelected(targetCollection || null)} disabled={moving} className="btn-secondary h-9 px-3"><FolderInput size={14} />{moving ? "处理中…" : "移动"}</button><button onClick={() => setCreatingFolder((value) => !value)} className="btn-secondary h-9 px-3"><FolderPlus size={14} />新建并移入</button></>}<button onClick={() => { setError(""); setPendingDelete(scope.documents.filter((document) => selected.includes(document.id))); }} disabled={!selected.length || deleting} className="btn h-9 bg-status-err px-3 text-white hover:bg-status-err/90"><Trash2 size={14} />删除</button></div>{creatingFolder && <div className="mt-3 flex gap-2"><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createAndMove()} className="h-10 min-w-0 flex-1 rounded-full border bg-surface px-4 text-sm outline-none focus:border-brand" placeholder="输入新文件夹名称" /><button onClick={() => void createAndMove()} disabled={!newFolderName.trim() || moving} className="btn-primary h-10">创建并移动</button></div>}</div>
      </div>
    </Sheet>
    <ConfirmDialog open={pendingDelete.length > 0} title="永久删除资料" description={`将删除${deleteLabel}及其文本切块和关联数据记录。此操作无法撤销；已登记运行与产物账本仍保留审计信息。`} busy={deleting} error={error} onCancel={() => setPendingDelete([])} onConfirm={() => remove(pendingDelete)}/>
  </>;
}
