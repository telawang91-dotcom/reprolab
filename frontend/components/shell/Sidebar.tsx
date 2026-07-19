"use client";

import { Folder, FolderOpen, MessageSquarePlus, Plus, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ConversationList } from "@/components/agent/ConversationList";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";
import { api } from "@/lib/api";
import { primaryNavigation } from "./navigation";

export function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = useWorkspaceScope();
  const activeConversation = searchParams.get("conversation") || undefined;
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string }>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const activeHref = pathname.startsWith("/results") || pathname.startsWith("/lineage") || pathname.startsWith("/report") || ["/writing", "/timeline", "/review"].some((path) => pathname === path)
    ? "/results"
    : primaryNavigation.find((item) => item.href !== "/" && pathname.startsWith(item.href))?.href ?? "/";
  const removeCollection = async () => {
    if (!pendingDelete) return;
    setDeleting(true); setDeleteError("");
    try {
      await api.deleteCollection(pendingDelete.id);
      if (scope.activeId === pendingDelete.id) scope.selectCollection("");
      await scope.refresh();
      setPendingDelete(undefined);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "删除文件夹失败");
    } finally { setDeleting(false); }
  };
  const openFolder = (id: string) => {
    scope.selectCollection(id);
    router.push(`/analysis?collection=${id}`);
    onNavigate?.();
  };
  const newConversation = (id = scope.activeId) => {
    if (!id) {
      router.push("/knowledge");
    } else {
      scope.selectCollection(id);
      router.push(`/analysis?collection=${id}`);
    }
    onNavigate?.();
  };

  return <>
    <div className="flex h-full min-h-0 flex-col">
      <button type="button" onClick={() => newConversation()} className="btn-primary mb-3 h-11 w-full justify-start px-3"><MessageSquarePlus size={16} />新建对话</button>
      <nav aria-label="主导航" className="space-y-1">
        {primaryNavigation.map(({ href, label, icon: Icon }) => {
          const active = href === activeHref;
          return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-appleSm px-3 text-sm transition ${active ? "bg-ink/[.07] font-semibold text-ink" : "text-muted hover:bg-ink/[.04] hover:text-ink"}`}><Icon size={17} /><span>{label}</span></Link>;
        })}
      </nav>

      <div className="my-4 border-t" />

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-10 items-center gap-2 px-3"><FolderOpen size={15} className="text-brand" /><strong className="text-xs">研究文件夹</strong><Link href="/knowledge" onClick={onNavigate} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-subtle hover:bg-ink/[.05]" aria-label="新建或导入文件夹"><Plus size={14} /></Link></div>
        <nav aria-label="研究文件夹" className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {scope.collections.map((item) => <div key={item.id} className="rounded-appleSm">
            <div className={`group flex min-h-11 items-center rounded-appleSm transition ${scope.activeId === item.id ? "bg-brand/10 font-semibold text-brand" : "text-muted hover:bg-ink/[.04] hover:text-ink"}`}>
              <button onClick={() => openFolder(item.id)} aria-current={scope.activeId === item.id ? "true" : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3 text-left text-sm"><Folder size={15} /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-[11px] opacity-70">{item.document_count}</span></button>
              {scope.activeId === item.id && <button onClick={() => newConversation(item.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-brand/10" aria-label={`在${item.name}中新建对话`} title="新建对话"><Plus size={13} /></button>}
              <button onClick={() => { setDeleteError(""); setPendingDelete({ id: item.id, name: item.name }); }} className={`mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-status-err/10 hover:text-status-err focus:opacity-100 md:opacity-0 md:group-hover:opacity-100 ${scope.activeId === item.id ? "md:opacity-100" : ""}`} aria-label={`删除文件夹${item.name}`} title="删除文件夹"><Trash2 size={13} /></button>
            </div>
            {scope.activeId === item.id && <div className="ml-4 mt-1 border-l pl-2"><ConversationList compact activeId={activeConversation} collectionId={item.id} refreshKey={activeConversation} onNew={() => newConversation(item.id)} onDeleted={(id) => { if (id === activeConversation) newConversation(item.id); }} /></div>}
          </div>)}
          {!scope.loading && !scope.collections.length && <div className="px-3 py-4 text-xs leading-5 text-muted">还没有研究文件夹。<Link href="/knowledge" onClick={onNavigate} className="mt-2 block font-semibold text-brand">导入文件夹 →</Link></div>}
        </nav>

        <div className="mt-3 border-t pt-3">
          <button onClick={() => { scope.openManager(); onNavigate?.(); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-appleSm px-3 text-sm text-muted transition hover:bg-ink/[.04] hover:text-ink"><Settings2 size={15} /><span className="flex-1 text-left">资料管理</span>{scope.unfiledCount > 0 && <span className="rounded-full bg-status-warn/10 px-2 py-0.5 text-[11px] text-status-warn">{scope.unfiledCount}</span>}</button>
        </div>
      </section>
    </div>
    <ConfirmDialog open={!!pendingDelete} title="删除研究文件夹" description={`“${pendingDelete?.name || ""}”中的资料不会被删除，会移到未归档资料中。`} confirmLabel="删除文件夹" busy={deleting} error={deleteError} onCancel={() => setPendingDelete(undefined)} onConfirm={removeCollection}/>
  </>;
}
