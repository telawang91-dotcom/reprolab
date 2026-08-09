"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileCheck2,
  Maximize2,
  Network,
  PenLine,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ArtifactValue, artifactKindLabel } from "@/components/agent/ArtifactValue";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";
import { unwrapArtifactValue } from "@/lib/artifactValue";
import { activeProjectId, api, type ArtifactSummary } from "@/lib/api";
import { addArtifactsToWriting, addArtifactToWriting } from "@/lib/writingStorage";
import { notifyFeedback } from "@/lib/feedback";

export function ArtifactsTab() {
  const scope = useWorkspaceScope();
  const router = useRouter();
  const [items, setItems] = useState<ArtifactSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ArtifactSummary>();
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [preview, setPreview] = useState<ArtifactSummary>();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const completeCount = items.filter((item) => item.source_complete).length;
  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesQuery = !query.trim() || (item.title || artifactKindLabel(item.kind)).toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (kind === "all" || item.kind === kind);
  }), [items, kind, query]);
  const selectedItems = items.filter((item) => item.source_complete && selected.has(item.id));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await api.artifacts("saved", 100)).items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "成果加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function removeFromLibrary() {
    if (!removeTarget) return;
    const removed = removeTarget;
    setBusy(true);
    setRemoveError("");
    try {
      await api.setArtifactLibraryState(removeTarget.id, false);
      setItems((current) => current.filter((item) => item.id !== removeTarget.id));
      setSelected((current) => { const next = new Set(current); next.delete(removeTarget.id); return next; });
      setRemoveTarget(undefined);
      notifyFeedback(`已将“${removed.title || artifactKindLabel(removed.kind)}”移出成果库`, "success", { label: "撤销", run: async () => {
        await api.setArtifactLibraryState(removed.id, true);
        setItems((current) => current.some((item) => item.id === removed.id) ? current : [removed, ...current]);
        notifyFeedback("成果已恢复到成果库");
      } });
    } catch (reason) {
      setRemoveError(reason instanceof Error ? reason.message : "移出成果库失败");
    } finally {
      setBusy(false);
    }
  }

  function exportArtifact(item: ArtifactSummary) {
    if (item.content_hash) {
      window.open(api.artifactContentUrl(item.id), "_blank", "noopener,noreferrer");
      notifyFeedback("已开始导出成果文件", "info");
      return;
    }
    const value = unwrapArtifactValue(item.value);
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.title || item.kind}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notifyFeedback("成果已导出为 JSON", "info");
  }

  function toggleSelected(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function addSelectedToWriting() {
    addArtifactsToWriting(activeProjectId(), selectedItems.map((item) => ({ artifact_id: item.id, title: item.title })));
    notifyFeedback(`已将 ${selectedItems.length} 项可信成果加入报告`);
    router.push("/results?tab=writing");
  }

  if (loading) return <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-appleLg bg-ink/[.06]" />)}</div>;
  if (error) return <div className="status-error"><AlertTriangle size={16} />{error}</div>;

  return <>
    <section>
      <div className="mb-4"><h2 className="text-xl font-semibold">已保存成果{items.length ? ` · ${items.length}` : ""}</h2><p className="mt-1 text-sm leading-6 text-muted">{items.length ? `只有你主动保存的内容会出现在这里；来源完整 ${completeCount}/${items.length}，未通过的成果不会进入报告。` : "这里只收纳你主动保存的高价值成果，不会自动堆积分析过程和临时指标。"}</p></div>
      {items.length === 0 ? (
        <div className="grid min-h-80 place-items-center rounded-appleLg border border-dashed bg-surface/60 p-8 text-center">
          <div className="max-w-lg">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-ink/[.05] text-subtle"><BarChart3 /></span>
            <h3 className="mt-5 text-xl font-semibold">还没有保存成果</h3>
            <p className="mt-2 text-sm leading-6 text-muted">分析过程中产生的代码、日志和中间指标不会自动堆到这里。打开有价值的图、表或数字，再决定是否保存。</p>
            <Link href={scope.activeCollection ? `/analysis?collection=${scope.activeCollection.id}` : "/knowledge"} className="btn-primary mt-6">{scope.activeCollection ? "继续对话" : "添加研究文件夹"}</Link>
          </div>
        </div>
      ) : (
        <>
          <div className={`mb-5 flex flex-wrap items-center gap-4 rounded-appleLg border p-4 ${completeCount ? "border-status-ok/20 bg-status-ok/[.05]" : "border-status-warn/20 bg-status-warn/[.05]"}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${completeCount ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{completeCount ? <FileCheck2 size={18}/> : <AlertTriangle size={18}/>}</span>
            <div className="min-w-0 flex-1"><strong className="block text-sm">{completeCount ? `${completeCount} 项成果可以进入报告` : "成果来源仍需补全"}</strong><p className="mt-1 text-xs leading-5 text-muted">{completeCount ? "下一步把可信成果组织成报告，并运行来源校验。" : "先打开来源，补全数据、代码与运行环境记录。"}</p></div>
            {completeCount ? <Link href="/results?tab=writing" className="btn-primary h-9 px-4">编辑报告</Link> : <Link href={`/lineage/${items[0].id}`} className="btn-secondary h-9 px-4">检查来源</Link>}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-apple border bg-surface p-2">
            <label className="relative min-w-[220px] flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="input h-10 w-full pl-9 text-sm" placeholder="搜索成果名称" aria-label="搜索已保存成果"/></label>
            <select value={kind} onChange={(event) => setKind(event.target.value)} className="input h-10 min-w-36 text-sm" aria-label="筛选成果类型"><option value="all">全部类型</option><option value="number">数字</option><option value="coefficient">系数</option><option value="table">表格</option><option value="figure">图表</option><option value="conclusion">结论</option><option value="text">文本</option></select>
            <span className="px-2 text-xs text-muted">显示 {filteredItems.length}/{items.length}</span>
          </div>
          {selectedItems.length > 0 && <div className="sticky top-16 z-20 mb-4 flex items-center gap-3 rounded-apple border border-brand/20 bg-surface/95 px-4 py-3 shadow-soft backdrop-blur-xl"><strong className="min-w-0 flex-1 text-sm">已选择 {selectedItems.length} 项可信成果</strong><button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-ink">取消选择</button><button onClick={addSelectedToWriting} className="btn-primary h-9 px-4">批量加入报告</button></div>}
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredItems.map((item) => <article key={item.id} className={`group rounded-appleLg border bg-surface p-4 transition-colors hover:border-brand/25 ${selected.has(item.id) ? "border-brand/30 ring-2 ring-brand/10" : ""}`}>
            <div className="flex items-start gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-appleSm ${item.source_complete ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{item.source_complete ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-xs uppercase tracking-wide text-subtle">{artifactKindLabel(item.kind)}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.source_complete ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{item.source_complete ? "来源完整" : "待检查来源"}</span></div><h3 className="truncate font-semibold">{item.title || "未命名成果"}</h3></div>
              <input type="checkbox" checked={selected.has(item.id)} disabled={!item.source_complete} onChange={() => toggleSelected(item.id)} className="mt-1 h-4 w-4 accent-brand" aria-label={`选择成果：${item.title || artifactKindLabel(item.kind)}`} title={item.source_complete ? "选择后可批量加入报告" : "来源完整后才能选择"}/><button onClick={() => { setRemoveError(""); setRemoveTarget(item); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-subtle hover:bg-status-err/10 hover:text-status-err" aria-label={`移出成果库：${item.title || artifactKindLabel(item.kind)}`}><Trash2 size={14} /></button>
            </div>
            {item.kind === "figure" && item.content_hash ? <img src={api.artifactContentUrl(item.id)} alt={item.title || "分析图表"} className="mt-4 h-44 w-full rounded-apple object-contain" /> : <div className="mt-4 h-44 overflow-auto rounded-apple bg-ink/[.04]"><ArtifactValue artifact={{ artifact_id: item.id, kind: item.kind, title: item.title, value_json: item.value }} /></div>}
            <button onClick={() => setPreview(item)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-brand" aria-label={`查看完整内容：${item.title || artifactKindLabel(item.kind)}`}><Maximize2 size={12}/>查看完整内容</button>
            {!item.source_complete && <p className="mt-3 text-xs leading-5 text-status-warn">先检查并补全来源，再写入报告。</p>}
            <div className="mt-4 grid grid-cols-3 gap-2"><Link href={`/lineage/${item.id}`} className="btn-secondary h-9 px-2"><Network size={13} />来源</Link><button onClick={() => exportArtifact(item)} className="btn-secondary h-9 px-2" aria-label={`导出${item.title || "成果"}`}><Download size={13} />导出</button>{item.source_complete ? <Link href={`/results?tab=writing&artifact=${item.id}`} onClick={() => { addArtifactToWriting(activeProjectId(), { artifact_id: item.id, title: item.title }); notifyFeedback("成果已加入报告"); }} className="btn-primary h-9 px-2"><PenLine size={13} />加入报告</Link> : <span role="link" aria-disabled="true" className="btn-secondary h-9 cursor-not-allowed px-2 opacity-50"><PenLine size={13} />加入报告</span>}</div>
          </article>)}
          </div>
          {filteredItems.length === 0 && <div className="rounded-apple border border-dashed p-8 text-center text-sm text-muted">没有符合当前搜索和类型筛选的成果。<button onClick={() => { setQuery(""); setKind("all"); }} className="ml-1 font-semibold text-brand">清除筛选</button></div>}
        </>
      )}
    </section>
    <ConfirmDialog open={!!removeTarget} title="移出成果库？" description={`“${removeTarget?.title || (removeTarget ? artifactKindLabel(removeTarget.kind) : "这项成果")}”不再显示在成果库，但原对话、运行与来源信息仍会保留。`} confirmLabel="移出成果库" busy={busy} error={removeError} onCancel={() => { if (!busy) setRemoveTarget(undefined); }} onConfirm={removeFromLibrary} />
    <Sheet open={!!preview} onOpenChange={(open) => { if (!open) setPreview(undefined); }} title={preview?.title || "成果详情"}>
      {preview && <div className="space-y-5">
        <div className={`flex items-start gap-3 rounded-apple p-4 ${preview.source_complete ? "bg-status-ok/[.07]" : "bg-status-warn/[.08]"}`}>
          {preview.source_complete ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-status-ok"/> : <AlertTriangle size={17} className="mt-0.5 shrink-0 text-status-warn"/>}
          <div><strong className="text-sm">{preview.source_complete ? "来源完整，可以用于报告" : "来源仍待检查"}</strong><p className="mt-1 text-xs leading-5 text-muted">{preview.source_complete ? "数据、分析运行和当前成果已形成完整记录。" : "请先补全来源，再将这项成果写入结论。"}</p></div>
        </div>
        <div className="overflow-auto rounded-apple border bg-canvas p-3">{preview.kind === "figure" && preview.content_hash ? <img src={api.artifactContentUrl(preview.id)} alt={preview.title || "分析图表"} className="max-h-[56vh] w-full object-contain"/> : <ArtifactValue artifact={{ artifact_id: preview.id, kind: preview.kind, title: preview.title, value_json: preview.value }}/>}</div>
        <dl className="grid grid-cols-2 gap-3 rounded-apple border p-4 text-xs"><div><dt className="text-muted">成果类型</dt><dd className="mt-1 font-semibold">{artifactKindLabel(preview.kind)}</dd></div><div><dt className="text-muted">生成时间</dt><dd className="mt-1 font-semibold">{new Date(preview.created_at).toLocaleString("zh-CN")}</dd></div></dl>
        <div className="grid grid-cols-3 gap-2"><Link href={`/lineage/${preview.id}`} onClick={() => setPreview(undefined)} className="btn-secondary h-10 px-2"><Network size={13}/>查看来源</Link><button onClick={() => exportArtifact(preview)} className="btn-secondary h-10 px-2"><Download size={13}/>导出</button>{preview.source_complete ? <Link href={`/results?tab=writing&artifact=${preview.id}`} onClick={() => { addArtifactToWriting(activeProjectId(), { artifact_id: preview.id, title: preview.title }); notifyFeedback("成果已加入报告"); }} className="btn-primary h-10 px-2"><PenLine size={13}/>加入报告</Link> : <span role="link" aria-disabled="true" className="btn-secondary h-10 cursor-not-allowed px-2 opacity-50"><PenLine size={13}/>加入报告</span>}</div>
      </div>}
    </Sheet>
  </>;
}
