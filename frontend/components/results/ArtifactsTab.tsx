"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Network,
  PenLine,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ArtifactValue, artifactKindLabel } from "@/components/agent/ArtifactValue";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";
import { unwrapArtifactValue } from "@/lib/artifactValue";
import { activeProjectId, api, type ArtifactSummary } from "@/lib/api";
import { addArtifactToWriting } from "@/lib/writingStorage";

export function ArtifactsTab() {
  const scope = useWorkspaceScope();
  const [items, setItems] = useState<ArtifactSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ArtifactSummary>();
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");

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
    setBusy(true);
    setRemoveError("");
    try {
      await api.setArtifactLibraryState(removeTarget.id, false);
      setItems((current) => current.filter((item) => item.id !== removeTarget.id));
      setRemoveTarget(undefined);
    } catch (reason) {
      setRemoveError(reason instanceof Error ? reason.message : "移出成果库失败");
    } finally {
      setBusy(false);
    }
  }

  function exportArtifact(item: ArtifactSummary) {
    if (item.content_hash) {
      window.open(api.artifactContentUrl(item.id), "_blank", "noopener,noreferrer");
      return;
    }
    const value = unwrapArtifactValue(item.value);
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.title || item.kind}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-appleLg bg-ink/[.06]" />)}</div>;
  if (error) return <div className="status-error"><AlertTriangle size={16} />{error}</div>;

  return <>
    <section>
      <div className="mb-4"><h2 className="text-xl font-semibold">已保存成果{items.length ? ` · ${items.length}` : ""}</h2><p className="mt-1 text-sm leading-6 text-muted">只有你在对话产物详情中点击“保存成果”的内容会出现在这里。</p></div>
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
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((item) => <article key={item.id} className="group rounded-appleLg border bg-surface p-4 transition-colors hover:border-brand/25">
            <div className="flex items-start gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-appleSm ${item.source_complete ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{item.source_complete ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span>
              <div className="min-w-0 flex-1"><span className="text-xs uppercase tracking-wide text-subtle">{artifactKindLabel(item.kind)}</span><h3 className="truncate font-semibold">{item.title || "未命名成果"}</h3></div>
              <button onClick={() => { setRemoveError(""); setRemoveTarget(item); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-subtle hover:bg-status-err/10 hover:text-status-err" aria-label={`移出成果库：${item.title || artifactKindLabel(item.kind)}`}><Trash2 size={14} /></button>
            </div>
            {item.kind === "figure" && item.content_hash ? <img src={api.artifactContentUrl(item.id)} alt={item.title || "分析图表"} className="mt-4 h-44 w-full rounded-apple object-contain" /> : <div className="mt-4 h-44 overflow-auto rounded-apple bg-ink/[.04]"><ArtifactValue artifact={{ artifact_id: item.id, kind: item.kind, title: item.title, value_json: item.value }} /></div>}
            <div className="mt-4 flex gap-2"><Link href={`/lineage/${item.id}`} className="btn-secondary h-9 flex-1 px-3"><Network size={13} />来源</Link><button onClick={() => exportArtifact(item)} className="btn-secondary h-9 px-3" aria-label={`导出${item.title || "成果"}`}><Download size={13} /></button><Link href="/results?tab=writing" onClick={() => addArtifactToWriting(activeProjectId(), { artifact_id: item.id, title: item.title })} className="btn-primary h-9 px-3"><PenLine size={13} />写报告</Link></div>
          </article>)}
        </div>
      )}
    </section>
    <ConfirmDialog open={!!removeTarget} title="移出成果库？" description={`“${removeTarget?.title || (removeTarget ? artifactKindLabel(removeTarget.kind) : "这项成果")}”不再显示在成果库，但原对话、运行与来源信息仍会保留。`} confirmLabel="移出成果库" busy={busy} error={removeError} onCancel={() => { if (!busy) setRemoveTarget(undefined); }} onConfirm={removeFromLibrary} />
  </>;
}
