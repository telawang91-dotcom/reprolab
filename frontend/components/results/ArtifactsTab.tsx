"use client";

import {
  AlertTriangle,
  BarChart3,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Download,
  FolderInput,
  Loader2,
  Network,
  PenLine,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ArtifactValue, artifactKindLabel } from "@/components/agent/ArtifactValue";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";
import {
  activeProjectId,
  api,
  type ArtifactListResponse,
  type ArtifactSummary,
  type ReviewSummary,
} from "@/lib/api";
import { unwrapArtifactValue } from "@/lib/artifactValue";
import { addArtifactToWriting } from "@/lib/writingStorage";

const emptyCounts: Pick<ArtifactListResponse, "total_count" | "saved_count" | "candidate_count"> = {
  total_count: 0,
  saved_count: 0,
  candidate_count: 0,
};

export function ArtifactsTab() {
  const scope = useWorkspaceScope();
  const [items, setItems] = useState<ArtifactSummary[]>([]);
  const [counts, setCounts] = useState(emptyCounts);
  const [review, setReview] = useState<ReviewSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [candidates, setCandidates] = useState<ArtifactSummary[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ArtifactSummary>();
  const [removeError, setRemoveError] = useState("");

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [artifacts, summary] = await Promise.all([api.artifacts("saved", 100), api.review()]);
      setItems(artifacts.items);
      setCounts({
        total_count: artifacts.total_count,
        saved_count: artifacts.saved_count,
        candidate_count: artifacts.candidate_count,
      });
      setReview(summary);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "成果加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((item) =>
      [item.title, item.kind, artifactKindLabel(item.kind)].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized),
    );
  }, [candidates, query]);

  async function openOrganizer() {
    setOrganizerOpen(true);
    setCandidateError("");
    setCandidateLoading(true);
    try {
      const response = await api.artifacts("candidates", 100);
      setCandidates(response.items);
      setCounts({ total_count: response.total_count, saved_count: response.saved_count, candidate_count: response.candidate_count });
    } catch (reason) {
      setCandidateError(reason instanceof Error ? reason.message : "候选成果加载失败");
    } finally {
      setCandidateLoading(false);
    }
  }

  async function saveCandidate(item: ArtifactSummary) {
    setBusyId(item.id);
    setCandidateError("");
    try {
      const state = await api.setArtifactLibraryState(item.id, true);
      const saved = { ...item, saved_at: state.saved_at };
      setCandidates((current) => current.filter((candidate) => candidate.id !== item.id));
      setItems((current) => [saved, ...current]);
      setCounts((current) => ({ ...current, saved_count: current.saved_count + 1, candidate_count: Math.max(0, current.candidate_count - 1) }));
    } catch (reason) {
      setCandidateError(reason instanceof Error ? reason.message : "保存成果失败");
    } finally {
      setBusyId("");
    }
  }

  async function removeFromLibrary() {
    if (!removeTarget) return;
    setBusyId(removeTarget.id);
    setRemoveError("");
    try {
      await api.setArtifactLibraryState(removeTarget.id, false);
      setItems((current) => current.filter((item) => item.id !== removeTarget.id));
      setCounts((current) => ({ ...current, saved_count: Math.max(0, current.saved_count - 1), candidate_count: current.candidate_count + 1 }));
      setRemoveTarget(undefined);
    } catch (reason) {
      setRemoveError(reason instanceof Error ? reason.message : "移出成果库失败");
    } finally {
      setBusyId("");
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

  if (loading) return <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-appleLg bg-ink/[.06]" />)}</div>;
  if (error || !review) return <div className="status-error"><AlertTriangle size={16} />{error || "成果加载失败"}</div>;

  return (
    <div className="space-y-7">
      <section className="grid overflow-hidden rounded-appleLg border bg-surface sm:grid-cols-3 sm:divide-x">
        {[
          { label: "成功运行", value: review.counts.successful_runs },
          { label: "已保存成果", value: counts.saved_count },
          { label: "可信结论", value: review.counts.verified_claims },
        ].map((item, index) => <article key={item.label} className={`px-5 py-4 ${index ? "border-t sm:border-t-0" : ""}`}><strong className="text-2xl font-semibold tracking-tight">{item.value}</strong><span className="ml-2 text-sm text-muted">{item.label}</span></article>)}
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-xl font-semibold">成果库</h2><p className="mt-1 text-sm leading-6 text-muted">只保留值得交付、写作或复用的结果；过程产物仍在技术记录中。</p></div>
          <button onClick={() => void openOrganizer()} className="btn-secondary shrink-0"><BookmarkPlus size={14} />整理候选{counts.candidate_count ? ` · ${counts.candidate_count}` : ""}</button>
        </div>

        {items.length === 0 ? (
          <div className="grid min-h-80 place-items-center rounded-appleLg border border-dashed bg-surface/60 p-8 text-center">
            <div className="max-w-lg">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-ink/[.05] text-subtle">{!scope.activeCollection && scope.unfiledCount > 0 ? <FolderInput /> : <BarChart3 />}</span>
              <h3 className="mt-5 text-xl font-semibold">成果库还是空的</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{counts.candidate_count ? `已有 ${counts.candidate_count} 项技术产物等待整理。选择真正需要展示的图、表、数字或结论保存到这里。` : "完成分析后，可以从产物详情中保存真正有价值的结果。"}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">{counts.candidate_count > 0 && <button onClick={() => void openOrganizer()} className="btn-primary"><BookmarkPlus size={14} />整理候选成果</button>}<Link href={scope.activeCollection ? "/analysis" : "/knowledge"} className="btn-secondary">{scope.activeCollection ? "继续分析" : "导入资料"}</Link></div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {items.map((item) => <article key={item.id} className="group rounded-appleLg border bg-surface p-4 transition-colors hover:border-brand/25">
              <div className="flex items-start gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-appleSm ${item.source_complete ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{item.source_complete ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span>
                <div className="min-w-0 flex-1"><span className="text-xs uppercase tracking-wide text-subtle">{artifactKindLabel(item.kind)}</span><h3 className="truncate font-semibold">{item.title || "未命名分析产物"}</h3></div>
                <button onClick={() => { setRemoveError(""); setRemoveTarget(item); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-subtle transition-colors hover:bg-status-err/10 hover:text-status-err" aria-label={`移出成果库：${item.title || artifactKindLabel(item.kind)}`}><Trash2 size={14} /></button>
              </div>
              {item.kind === "figure" && item.content_hash ? <img src={api.artifactContentUrl(item.id)} alt={item.title || "分析图表"} className="mt-4 h-44 w-full rounded-apple object-contain" /> : <div className="mt-4 h-44 overflow-auto rounded-apple bg-ink/[.04]"><ArtifactValue artifact={{ artifact_id: item.id, kind: item.kind, title: item.title, value_json: item.value }} /></div>}
              <div className="mt-4 flex gap-2"><Link href={`/lineage/${item.id}`} className="btn-secondary h-9 flex-1 px-3"><Network size={13} />来源</Link><button onClick={() => exportArtifact(item)} className="btn-secondary h-9 px-3" aria-label={`导出${item.title || "成果"}`}><Download size={13} /></button><Link href="/results?tab=writing" onClick={() => addArtifactToWriting(activeProjectId(), { artifact_id: item.id, title: item.title })} className="btn-primary h-9 px-3"><PenLine size={13} />写作</Link></div>
            </article>)}
          </div>
        )}
      </section>

      <Sheet open={organizerOpen} onOpenChange={setOrganizerOpen} title="整理候选成果" side="bottom">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><p className="text-sm leading-6 text-muted">这里保留 Agent 各步骤登记的技术产物。保存真正需要交付或复用的内容，其余项目无需处理，也不会出现在成果库。</p></div><label className="relative block w-full sm:w-72"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="input h-10 w-full pl-9 pr-3 text-sm" placeholder="搜索名称或类型" aria-label="搜索候选成果" /></label></div>
          {candidateError && <div role="alert" className="status-error mt-4">{candidateError}</div>}
          {candidateLoading ? <div className="grid min-h-56 place-items-center text-sm text-muted"><Loader2 className="animate-spin" /></div> : visibleCandidates.length === 0 ? <div className="mt-6 rounded-appleLg border border-dashed p-10 text-center text-sm text-muted">{candidates.length ? "没有匹配的候选成果" : "所有候选都已整理完成"}</div> : <div className="mt-6 overflow-hidden rounded-appleLg border bg-surface">{visibleCandidates.map((item, index) => <article key={item.id} className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center ${index ? "border-t" : ""}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-appleSm ${item.source_complete ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{item.source_complete ? <Check size={16} /> : <AlertTriangle size={16} />}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{item.title || "未命名分析产物"}</h3><p className="mt-1 text-xs text-muted">{artifactKindLabel(item.kind)} · {new Date(item.created_at).toLocaleString("zh-CN")} · {item.source_complete ? "来源完整" : "来源待检查"}</p></div><div className="flex shrink-0 gap-2"><Link href={`/lineage/${item.id}`} className="btn-secondary h-9 px-3"><Network size={13} />来源</Link><button disabled={busyId === item.id} onClick={() => void saveCandidate(item)} className="btn-primary h-9 px-3" aria-label={`保存到成果库：${item.title || artifactKindLabel(item.kind)}`}>{busyId === item.id ? <Loader2 size={13} className="animate-spin" /> : <BookmarkPlus size={13} />}{busyId === item.id ? "保存中…" : "保存"}</button></div></article>)}</div>}
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!removeTarget}
        title="移出成果库？"
        description={`“${removeTarget?.title || (removeTarget ? artifactKindLabel(removeTarget.kind) : "这项成果")}”将不再显示在成果库。运行记录、可信血缘和已有写作引用都会保留。`}
        confirmLabel="移出成果库"
        busy={!!removeTarget && busyId === removeTarget.id}
        error={removeError}
        onCancel={() => { if (!busyId) setRemoveTarget(undefined); }}
        onConfirm={removeFromLibrary}
      />
    </div>
  );
}
