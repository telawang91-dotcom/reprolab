"use client";

import { AlertTriangle, ArrowDown, BarChart3, Clock3, FolderInput, FolderOpen, MessageSquarePlus, RotateCcw, Send, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentTimelineView } from "@/components/agent/AgentTimelineView";
import { ArtifactPanel } from "@/components/agent/ArtifactPanel";
import { DataPanel } from "@/components/agent/DataPanel";
import { LiveStatus } from "@/components/agent/LiveStatus";
import { QuickLineage } from "@/components/agent/QuickLineage";
import { useAnalysisSession } from "@/components/agent/useAnalysisSession";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";
import type { DocumentDetail } from "@/lib/api";

export default function AnalysisPage() {
  return <AnalysisWorkspace />;
}

function AnalysisWorkspace() {
  const scope = useWorkspaceScope();
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionId = scope.activeId || undefined;
  const requestedConversation = searchParams.get("conversation") || undefined;
  const session = useAnalysisSession(collectionId, requestedConversation, { mode: "workspace", autoSelectAll: true });
  const [dataOpen, setDataOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [following, setFollowing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
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
  const activeStep = session.liveTimeline.steps.find((step) => step.status === "working" || step.status === "repairing");
  const completedSteps = session.liveTimeline.steps.filter((step) => step.status === "success").length;
  const totalSteps = session.liveTimeline.steps.length;
  const examples = useMemo(() => datasetAwareExamples(session.selectedDatasets), [session.selectedDatasets]);
  const beginNewConversation = () => {
    session.newConversation();
    router.replace(collectionId ? `/analysis?collection=${collectionId}` : "/analysis", { scroll: false });
  };
  const requestAnalysis = () => {
    if (session.message.trim() && !session.running) void session.send();
  };
  return (
    <div className="h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden bg-canvas">
      <main className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="material flex min-h-16 shrink-0 items-center border-b px-4 md:px-6">
          <div className="min-w-0"><h1 className="truncate font-semibold tracking-tight">{session.activeCollection?.name || "选择研究文件夹"}</h1><p className="mt-0.5 hidden text-xs text-muted sm:block">{session.activeCollection ? "持续对话；Agent 按需读取该文件夹、检索资料并运行分析" : "每个文件夹都有独立资料范围和多个对话"}</p></div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:block"><LiveStatus running={session.running} step={activeStep?.title} /></div>
            {session.activeCollection && <button onClick={() => setDataOpen(true)} className="btn-secondary h-9 px-3" aria-label="文件与能力"><SlidersHorizontal size={14} /><span className="hidden sm:inline">文件与能力</span></button>}
            {session.activeCollection && session.artifacts.length > 0 && <button onClick={() => setArtifactOpen(true)} className="btn-secondary h-9 px-3"><BarChart3 size={14} /><span className="hidden sm:inline">本轮产物</span> {session.artifacts.length}</button>}
            {session.activeCollection && <button onClick={beginNewConversation} disabled={session.running} className="btn-secondary h-9 px-3"><MessageSquarePlus size={14} /><span className="hidden sm:inline">新对话</span></button>}
          </div>
        </header>
        {session.running && <section role="status" aria-live="polite" className="shrink-0 border-b border-brand/10 bg-brand/[.045] px-4 py-3 md:px-6"><div className="mx-auto max-w-4xl"><div className="flex items-center gap-3 text-xs"><Clock3 size={14} className="shrink-0 animate-pulse text-brand"/><strong className="min-w-0 flex-1 truncate">{activeStep?.title ? `正在处理：${activeStep.title}` : "正在准备下一步分析"}</strong><span className="text-muted">{totalSteps ? `${completedSteps}/${totalSteps} 步` : "正在规划"}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/[.07]"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${totalSteps ? Math.max(8, (completedSteps / totalSteps) * 100) : 12}%` }}/></div><p className="mt-2 text-[11px] text-muted">当前文件夹：{session.activeCollection?.name}。请保持此页面打开；任务中心会持续显示已运行时间。</p></div></section>}
        {session.skillResult && <div className={`mx-4 mt-4 rounded-apple border px-4 py-3 text-sm md:mx-6 ${session.skillResult.fallback ? "bg-status-warn/[.08] text-status-warn" : "bg-status-ok/[.08] text-status-ok"}`}>{session.skillResult.fallback ? `字段映射不确定，已安全回退动态分析：${session.skillResult.reason}` : `技能复用完成，估算节省 ${session.skillResult.saved.toLocaleString()} token。${session.skillResult.reason}`}</div>}
        <div ref={scrollRef} onScroll={updateFollowState} data-analysis-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-gutter:stable] md:px-6">
          <div className="mx-auto max-w-4xl">
            {session.activeCollection ? <AgentTimelineView timeline={session.timeline} liveTimeline={session.liveTimeline} running={session.running} hasDatasets={session.datasets.length > 0} hasSelection examples={examples} onExample={session.setMessage} onAnchor={(anchor) => { if (session.anchorClick(anchor)) setArtifactOpen(true); }} onArtifact={(artifact) => { session.setActiveArtifact(artifact); setArtifactOpen(true); }} onContinue={() => composerRef.current?.focus()} workspaceMode /> : <NoScope hasCollections={scope.collections.length > 0} unfiledCount={scope.unfiledCount} onOrganize={() => scope.openManager({ selectUnfiled: true })} />}
            {session.running && <div className="mt-4"><LiveStatus running step={activeStep?.title} /></div>}
            {session.error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-apple border border-status-err/25 bg-status-err/[.08] p-3 text-sm text-status-err"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1">{session.error}</span>{session.message.trim() && !session.running && <button onClick={requestAnalysis} className="inline-flex shrink-0 items-center gap-1 font-semibold"><RotateCcw size={13} />重新发送</button>}<button onClick={() => session.setError("")} className="shrink-0" aria-label="关闭错误"><X size={14} /></button></div>}
          </div>
        </div>
        {!following && session.events.length > 0 && <button onClick={scrollToLatest} className="btn-secondary absolute bottom-32 right-6 z-10 h-9 bg-surface/90 px-4 backdrop-blur-xl"><ArrowDown size={14} />回到最新</button>}
        <div className="material shrink-0 border-t p-4">
          <div className={`mx-auto max-w-4xl rounded-appleLg border bg-surface p-2 shadow-soft focus-within:border-brand/40 ${!session.activeCollection ? "opacity-60" : ""}`}>
            <textarea ref={composerRef} value={session.message} onChange={(event) => session.setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); requestAnalysis(); } }} disabled={!session.activeCollection} rows={2} className="w-full resize-none bg-transparent px-2 py-1 outline-none" placeholder={!session.activeCollection ? "先选择一个研究文件夹…" : "直接提出问题，Agent 会自行选择需要的文件和工具…"} />
            <div className="flex items-center px-1 pt-1"><span className="text-[11px] text-muted">{!session.activeCollection ? "尚未选择文件夹" : `${session.activeCollection.name} · ${scope.documents.filter((item) => item.collection_id === collectionId).length} 个文件 · 支持连续追问`}</span>{session.running ? <button onClick={session.stop} className="btn-secondary ml-auto h-8"><X size={14} />停止</button> : <button onClick={requestAnalysis} disabled={!session.activeCollection || !session.message.trim()} className="btn-primary ml-auto h-8"><Send size={14} />发送</button>}</div>
          </div>
        </div>
      </main>

      <Sheet open={dataOpen} onOpenChange={setDataOpen} title={`当前文件夹 · ${session.activeCollection?.name || ""}`} side="right"><div className="mx-auto max-w-xl"><p className="mb-5 text-sm leading-6 text-muted">默认使用文件夹内全部资料。只有需要缩小数据范围或指定复用能力时才需要在这里调整。</p>{session.activeCollection && <DataPanel datasets={session.datasets} selected={session.selected} onToggle={session.toggleDataset} skill={session.skill} onSelectSkill={session.setSkill} onApplySkill={session.applySkill} refreshKey={session.skillRefresh} />}</div></Sheet>
      <Sheet open={artifactOpen} onOpenChange={setArtifactOpen} title="产物详情" side="right"><ArtifactPanel artifact={session.activeArtifact || session.artifacts.at(-1)} total={session.artifacts.length} onLineage={session.showLineage} onSave={session.saveAsSkill} /></Sheet>
      <Sheet open={!!session.lineage} onOpenChange={(open) => { if (!open) session.setLineage(undefined); }} title="可信来源" side="right"><QuickLineage lineage={session.lineage}/></Sheet>
    </div>
  );
}

function NoScope({ hasCollections, unfiledCount, onOrganize }: { hasCollections: boolean; unfiledCount: number; onOrganize: () => void }) {
  if (!hasCollections && unfiledCount > 0) return <section className="grid min-h-[420px] place-items-center text-center"><div className="max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-status-warn/10 text-status-warn"><FolderInput size={23} /></span><h2 className="mt-5 text-2xl font-semibold">先整理现有 {unfiledCount} 份资料。</h2><p className="mt-3 text-sm leading-7 text-muted">创建研究文件夹后，Agent 才能明确数据范围并为每个结果登记可靠来源。</p><button onClick={onOrganize} className="btn-primary mt-6"><FolderInput size={15} />整理并创建文件夹</button></div></section>;
  return <section className="grid min-h-[420px] place-items-center text-center"><div className="max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-brand/10 text-brand"><FolderOpen size={23} /></span><h2 className="mt-5 text-2xl font-semibold">先选择一个研究文件夹。</h2><p className="mt-3 text-sm leading-7 text-muted">{hasCollections ? "从左侧文件夹列表选择研究范围。这里会原地载入数据，不会跳转页面。" : "导入文件夹后，分析只会使用该文件夹内的数据，不会混入项目中的其他资料。"}</p>{!hasCollections && <Link href="/knowledge" className="btn-primary mt-6"><FolderOpen size={15} />导入文件夹</Link>}</div></section>;
}

function datasetAwareExamples(datasets: DocumentDetail[]): string[] {
  if (!datasets.length) return [
    "这个文件夹里有哪些资料和可分析的数据？",
    "根据当前资料梳理研究主题，并建议下一步需要补充什么",
    "说明目前能够回答哪些问题，以及证据边界在哪里",
  ];
  const columns = datasets.flatMap((dataset) => dataset.schema_json?.columns ?? []);
  const unique = columns.filter((item, index) => columns.findIndex((candidate) => candidate.name === item.name) === index);
  const numeric = unique.filter((item) => /int|float|double|decimal|number/i.test(item.dtype));
  const categorical = unique.find((item) => !numeric.some((candidate) => candidate.name === item.name));
  const prompts: string[] = [];
  const names = new Set(unique.map((item) => item.name.toLowerCase()));
  if (["station", "pm2.5", "year", "month"].every((name) => names.has(name))) {
    return [
      "比较三个站点的 PM2.5 数据完整性、均值与中位数，并绘制季度变化趋势",
      "分析 PM2.5 与风速 WSPM 的关系，报告稳健相关结果并说明非因果边界",
      "检查各站点污染物的缺失值、重复记录和异常值，生成数据质量报告",
    ];
  }
  if (categorical && numeric[0]) prompts.push(`比较“${categorical.name}”各组的“${numeric[0].name}”差异，报告效应量并绘图`);
  if (numeric.length >= 2) prompts.push(`分析“${numeric[0].name}”与“${numeric[1].name}”的关系，检查异常值并报告置信区间`);
  prompts.push("检查所选数据的缺失值、重复记录和异常值，生成数据质量报告");
  return prompts.slice(0, 3);
}
