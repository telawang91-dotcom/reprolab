"use client";

import { AlertTriangle, ArrowDown, BarChart3, FolderOpen, Send, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AgentTimelineView } from "@/components/agent/AgentTimelineView";
import { ArtifactPanel } from "@/components/agent/ArtifactPanel";
import { DataPanel } from "@/components/agent/DataPanel";
import { LiveStatus } from "@/components/agent/LiveStatus";
import { useAnalysisSession } from "@/components/agent/useAnalysisSession";
import { ConversationList } from "@/components/agent/ConversationList";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";

export default function AnalysisPage() {
  return <AnalysisWorkspace />;
}

function AnalysisWorkspace() {
  const scope = useWorkspaceScope();
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionId = scope.activeId || undefined;
  const requestedConversation = searchParams.get("conversation") || undefined;
  const session = useAnalysisSession(collectionId, requestedConversation);
  const [dataOpen, setDataOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [following, setFollowing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("collection");
    if (requested && requested !== scope.activeId) scope.selectCollection(requested);
  }, []); // 兼容旧的 /analysis?collection= 链接，后续范围由全局左栏维护。
  useEffect(() => {
    if (!session.conversation || session.conversation === requestedConversation) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversation", session.conversation);
    if (collectionId) params.set("collection", collectionId);
    router.replace(`/analysis?${params.toString()}`, { scroll: false });
  }, [collectionId, requestedConversation, router, searchParams, session.conversation]);
  useEffect(() => {
    if (!session.events.length || !following) return;
    const frame = window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    return () => window.cancelAnimationFrame(frame);
  }, [following, session.events]);
  const updateFollowState = () => {
    const element = scrollRef.current;
    if (!element) return;
    setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
  };
  const scrollToLatest = () => {
    setFollowing(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };
  const activeStep = session.timeline.steps.find((step) => step.status === "working" || step.status === "repairing");
  const requestAnalysis = () => { if (session.message.trim() && session.selected.length && !session.running) setConfirmOpen(true); };
  return (
    <div className={`grid h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden bg-canvas ${session.activeCollection ? "xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_300px]" : "2xl:grid-cols-[minmax(0,1fr)_300px]"}`}>
      {session.activeCollection && <aside className="material hidden min-h-0 overflow-y-auto overscroll-contain border-r p-4 xl:block">
        <ConversationList activeId={session.conversation} collectionId={collectionId} refreshKey={session.conversation} />
        <div className="my-4 border-t" />
        <DataPanel datasets={session.datasets} selected={session.selected} onToggle={session.toggleDataset} skill={session.skill} onSelectSkill={session.setSkill} onApplySkill={session.applySkill} refreshKey={session.skillRefresh} />
      </aside>}
      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="material flex min-h-16 shrink-0 items-center border-b px-4 md:px-6">
          <div><h1 className="font-semibold tracking-tight">{session.activeCollection ? `分析 · ${session.activeCollection.name}` : "Agent 分析"}</h1><p className="mt-0.5 hidden text-xs text-muted sm:block">{session.activeCollection ? "只加载当前文件夹内的数据" : "先选择一个研究文件夹"}</p></div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:block"><LiveStatus running={session.running} step={activeStep?.title} /></div>
            {session.activeCollection && <button onClick={() => setDataOpen(true)} className="btn-secondary h-9 px-3 xl:hidden">数据与技能</button>}
            {session.activeCollection && <button onClick={() => setArtifactOpen(true)} className="btn-secondary h-9 px-3 2xl:hidden"><BarChart3 size={14} />产物 {session.artifacts.length ? `· ${session.artifacts.length}` : ""}</button>}
          </div>
        </header>
        {session.skillResult && <div className={`mx-4 mt-4 rounded-apple border px-4 py-3 text-sm md:mx-6 ${session.skillResult.fallback ? "bg-status-warn/[.08] text-status-warn" : "bg-status-ok/[.08] text-status-ok"}`}>{session.skillResult.fallback ? `字段映射不确定，已安全回退动态分析：${session.skillResult.reason}` : `技能复用完成，估算节省 ${session.skillResult.saved.toLocaleString()} token。${session.skillResult.reason}`}</div>}
        <div ref={scrollRef} onScroll={updateFollowState} data-analysis-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-gutter:stable] md:px-6">
          <div className="mx-auto max-w-3xl">
            {session.activeCollection ? <AgentTimelineView timeline={session.timeline} hasDatasets={session.datasets.length > 0} hasSelection={session.selected.length > 0} onExample={session.setMessage} onAnchor={session.anchorClick} onArtifact={session.setActiveArtifact} /> : <NoScope hasCollections={scope.collections.length > 0} />}
            {session.running && <div className="mt-4"><LiveStatus running step={activeStep?.title} /></div>}
            {session.error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-apple border border-status-err/25 bg-status-err/[.08] p-3 text-sm text-status-err"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{session.error}<button onClick={() => session.setError("")} className="ml-auto" aria-label="关闭错误"><X size={14} /></button></div>}
          </div>
        </div>
        {!following && session.events.length > 0 && <button onClick={scrollToLatest} className="btn-secondary absolute bottom-32 right-6 z-10 h-9 bg-surface/90 px-4 backdrop-blur-xl"><ArrowDown size={14} />回到最新</button>}
        <div className="material shrink-0 border-t p-4">
          <div className={`mx-auto max-w-3xl rounded-appleLg border bg-surface p-2 shadow-soft focus-within:border-brand/40 ${!session.activeCollection ? "opacity-60" : ""}`}>
            <textarea value={session.message} onChange={(event) => session.setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") requestAnalysis(); }} disabled={!session.activeCollection} rows={2} className="w-full resize-none bg-transparent px-2 py-1 outline-none" placeholder={!session.activeCollection ? "先选择一个研究文件夹…" : session.selected.length ? "描述你想分析的问题…" : "当前文件夹中没有已选择的数据…"} />
            <div className="flex items-center px-1 pt-1"><span className="text-[11px] text-muted">{!session.activeCollection ? "分析范围尚未选择" : session.selected.length ? "⌘↵ 确认数据范围后运行" : "需要先选择当前文件夹中的数据"}</span>{session.running ? <button onClick={session.stop} className="btn-secondary ml-auto h-8"><X size={14} />停止</button> : <button onClick={requestAnalysis} disabled={!session.activeCollection || !session.message.trim() || !session.selected.length} className="btn-primary ml-auto h-8"><Send size={14} />运行</button>}</div>
          </div>
        </div>
      </main>
      <aside className="material hidden min-h-0 overflow-y-auto overscroll-contain border-l p-4 2xl:block"><ArtifactPanel artifact={session.activeArtifact} total={session.artifacts.length} onLineage={session.showLineage} onSave={session.saveAsSkill} /></aside>

      <Sheet open={dataOpen} onOpenChange={setDataOpen} title="数据、会话与技能" side="bottom"><div className="mx-auto max-w-xl">{session.activeCollection && <><ConversationList activeId={session.conversation} collectionId={collectionId} refreshKey={session.conversation} /><div className="my-5 border-t" /><DataPanel datasets={session.datasets} selected={session.selected} onToggle={session.toggleDataset} skill={session.skill} onSelectSkill={session.setSkill} onApplySkill={session.applySkill} refreshKey={session.skillRefresh} /></>}</div></Sheet>
      <Sheet open={artifactOpen} onOpenChange={setArtifactOpen} title="可信产物" side="right"><ArtifactPanel artifact={session.activeArtifact} total={session.artifacts.length} onLineage={session.showLineage} onSave={session.saveAsSkill} /></Sheet>
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen} title="确认分析范围" side="bottom">
        <div className="mx-auto max-w-2xl space-y-3"><div className="rounded-apple bg-ink/[.04] p-4"><div className="text-xs font-semibold text-muted">研究问题</div><p className="mt-2 text-sm leading-6">{session.message}</p></div><div className="rounded-apple bg-ink/[.04] p-4"><div className="text-xs font-semibold text-muted">输入数据</div><div className="mt-2 space-y-1 text-sm">{session.selectedDatasets.map((item) => <div key={item.id}>{item.filename} <span className="text-xs text-muted">· {item.schema_json?.row_count ?? 0} 行 / {item.schema_json?.column_count ?? 0} 列</span></div>)}</div></div><div className="flex items-start gap-2 rounded-apple bg-status-ok/[.08] p-4 text-sm text-status-ok"><ShieldCheck size={16} className="mt-0.5" /><span><strong>将被记录：</strong>输入数据版本、生成代码、固定随机种子和环境快照。</span></div><div className="flex justify-end gap-2"><button onClick={() => setConfirmOpen(false)} className="btn-secondary">返回修改</button><button onClick={() => { setConfirmOpen(false); void session.send(); }} className="btn-primary"><Send size={14} />确认并运行</button></div></div>
      </Sheet>
      <Sheet open={!!session.lineage} onOpenChange={(open) => { if (!open) session.setLineage(undefined); }} title="完整可信链" side="right"><div className="space-y-2">{session.lineage?.nodes.map((node) => <div key={node.id} className="rounded-apple border p-3"><span className="text-[10px] uppercase text-brand">{node.type}</span><div className="mt-1 truncate text-sm font-semibold">{node.label}</div></div>)}</div></Sheet>
    </div>
  );
}

function NoScope({ hasCollections }: { hasCollections: boolean }) {
  return <section className="grid min-h-[420px] place-items-center text-center"><div className="max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-brand/10 text-brand"><FolderOpen size={23} /></span><h2 className="mt-5 text-2xl font-semibold">先选择一个研究文件夹。</h2><p className="mt-3 text-sm leading-7 text-muted">{hasCollections ? "从左侧文件夹列表选择研究范围。这里会原地载入数据，不会跳转页面。" : "导入文件夹后，分析只会使用该文件夹内的数据，不会混入项目中的其他资料。"}</p>{!hasCollections && <Link href="/knowledge" className="btn-primary mt-6"><FolderOpen size={15} />导入文件夹</Link>}</div></section>;
}
