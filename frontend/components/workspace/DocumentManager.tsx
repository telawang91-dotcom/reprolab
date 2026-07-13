"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare2, Database, FileCode2, FileText, Search, Trash2 } from "lucide-react";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { api, type DocumentItem } from "@/lib/api";
import { useWorkspaceScope } from "./WorkspaceScope";

type View = "all" | "current" | "unfiled";

const icons = { paper: FileText, note: FileText, code: FileCode2, other: Database };

export function DocumentManager() {
  const scope = useWorkspaceScope();
  const [view, setView] = useState<View>("unfiled");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (scope.managerOpen) {
      setView(scope.unfiledCount ? "unfiled" : scope.activeId ? "current" : "all");
      setSelected([]);
      setQuery("");
      setError("");
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
    const label = documents.length === 1 ? `“${documents[0].title || documents[0].filename}”` : `选中的 ${documents.length} 份资料`;
    if (!window.confirm(`删除${label}？相关文本切块也会一并删除，且无法撤销。`)) return;
    setDeleting(true);
    setError("");
    try {
      await Promise.all(documents.map((document) => api.deleteDocument(document.id)));
      setSelected((items) => items.filter((id) => !documents.some((document) => document.id === id)));
      await scope.refresh(scope.activeId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料删除失败");
      await scope.refresh(scope.activeId);
    } finally {
      setDeleting(false);
    }
  };

  return (
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
            return <div key={document.id} className={`group flex min-h-[72px] items-center gap-3 py-3 transition-colors ${checked ? "bg-brand/[.06]" : "hover:bg-ink/[.025]"}`}><input type="checkbox" checked={checked} onChange={() => toggle(document.id)} aria-label={`选择${document.title || document.filename}`} className="h-4 w-4 accent-brand" /><span className="grid h-9 w-9 shrink-0 place-items-center rounded-appleSm bg-ink/[.045] text-muted"><Icon size={16} /></span><button onClick={() => toggle(document.id)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-[14px] font-semibold tracking-[-.01em]">{document.title || document.filename}</strong><span className="mt-1 block truncate text-xs text-subtle">{document.filename}</span></button><button onClick={() => void remove([document])} disabled={deleting} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-subtle transition hover:bg-status-err/10 hover:text-status-err active:scale-95" aria-label={`删除${document.title || document.filename}`}><Trash2 size={15} /></button></div>;
          })}
          {!visible.length && <div className="grid min-h-52 place-items-center text-center"><div><FileText className="mx-auto text-subtle" size={24} /><p className="mt-3 text-sm text-muted">当前范围没有资料</p></div></div>}
        </div>

        <div className="material sticky bottom-0 -mx-5 mt-4 flex min-h-16 items-center border-t px-5"><span className="text-sm text-muted">已选择 {selected.length} 项</span><button onClick={() => void remove(scope.documents.filter((document) => selected.includes(document.id)))} disabled={!selected.length || deleting} className="btn ml-auto bg-status-err text-white hover:bg-status-err/90"><Trash2 size={14} />{deleting ? "删除中…" : "删除所选"}</button></div>
      </div>
    </Sheet>
  );
}
