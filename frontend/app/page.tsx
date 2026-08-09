"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  FolderInput,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import {
  api,
  type ReviewSummary,
  type TimelineItem,
} from "@/lib/api";

type DashboardData = {
  review: ReviewSummary;
  events: TimelineItem[];
  savedCount: number;
  sourceCompleteCount: number;
};

export default function Home() {
  const scope = useWorkspaceScope();
  const [dashboard, setDashboard] = useState<DashboardData>();
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!scope.activeCollection) return;
    setDashboardLoading(true);
    setDashboardError("");
    setDashboard(undefined);
    try {
      const [review, timeline, artifacts] = await Promise.all([
        api.review(),
        api.timeline(),
        api.artifacts("saved", 100),
      ]);
      setDashboard({
        review,
        events: timeline.events.slice(0, 3),
        savedCount: artifacts.saved_count,
        sourceCompleteCount: artifacts.items.filter((item) => item.source_complete).length,
      });
    } catch (reason) {
      setDashboardError(reason instanceof Error ? reason.message : "无法读取项目进展");
    } finally {
      setDashboardLoading(false);
    }
  }, [scope.activeCollection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scope.activeCollection) void loadDashboard();
    else setDashboard(undefined);
  }, [loadDashboard, scope.activeCollection]);

  if (scope.loading) return <DashboardSkeleton />;

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      {scope.error && <div role="alert" className="mb-6 flex items-center rounded-apple border border-status-err/20 bg-status-err/[.07] px-4 py-3 text-sm text-status-err"><span>{scope.error}</span><button onClick={() => void scope.refresh()} className="ml-auto min-h-11 font-semibold">重试</button></div>}

      {scope.activeCollection ? (
        <div className="mx-auto max-w-4xl">
          <header className="border-b pb-7">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-apple bg-brand/10 text-brand"><FolderOpen size={21} /></span>
              <div className="min-w-0"><div className="eyebrow text-status-ok">当前研究文件夹</div><h1 className="mt-1 truncate text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{scope.activeCollection.name}</h1><p className="mt-2 text-[15px] leading-7 text-muted">{scope.activeCollection.description || `${scope.activeCollection.document_count} 份资料已限定在这个文件夹中。`}</p></div>
            </div>
          </header>

          <ProjectProgress dashboard={dashboard} documentCount={scope.activeCollection.document_count} loading={dashboardLoading} />
          {dashboard && <GettingStarted documentCount={scope.activeCollection.document_count} collectionCount={scope.collections.length} successfulRuns={dashboard.review.counts.successful_runs} activeCollectionName={scope.activeCollection.name} />}

          {dashboardError ? (
            <div role="alert" className="mt-6 flex items-start gap-3 rounded-apple border border-status-warn/20 bg-status-warn/[.06] px-4 py-3 text-sm text-status-warn"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1">项目进展暂未读取成功，不影响继续研究。{dashboardError}</span><button onClick={() => void loadDashboard()} className="inline-flex shrink-0 items-center gap-1 font-semibold"><RefreshCw size={13} />重试</button></div>
          ) : (
            <DashboardContent dashboard={dashboard} documentCount={scope.activeCollection.document_count} loading={dashboardLoading} />
          )}

          <footer className="mt-7 flex flex-wrap items-center gap-3 border-t pt-5 text-sm text-muted"><span>{scope.activeCollection.document_count} 份资料</span><span aria-hidden>·</span><span className="text-status-ok">研究范围已锁定</span><Link href="/knowledge" className="ml-auto text-link">管理当前文件夹<ArrowRight size={13} /></Link></footer>
        </div>
      ) : (
        <section className="grid min-h-[calc(100vh-10rem)] place-items-center text-center">
          {scope.unfiledCount > 0 ? <div className="max-w-lg"><span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-status-warn/10 text-status-warn"><FolderInput size={24} /></span><p className="mt-6 text-xs font-semibold uppercase tracking-[.12em] text-status-warn">还有一步即可开始</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">让现有资料成为可分析的研究范围。</h1><p className="mt-4 text-[15px] leading-7 text-muted">检测到 {scope.unfiledCount} 份尚未归档的真实资料。将它们放入研究文件夹后，问答、Agent 分析和成果都会自动限定在同一范围。</p><button onClick={() => scope.openManager({ selectUnfiled: true })} className="btn-primary mt-7"><FolderInput size={15} />整理这 {scope.unfiledCount} 份资料</button><Link href="/knowledge" className="mt-5 block text-sm text-muted hover:text-brand">继续导入新文件 →</Link></div> : <div className="max-w-lg"><span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-brand/10 text-brand"><FolderOpen size={24} /></span><h1 className="mt-6 text-3xl font-semibold tracking-[-.04em]">从一个研究文件夹开始。</h1><p className="mt-4 text-[15px] leading-7 text-muted">导入文件夹后，左栏会持续保留当前范围。工作台、资料问答和数据分析不再各自重复选择。</p><Link href="/knowledge" className="btn-primary mt-7"><FolderOpen size={15} />导入文件夹</Link><Link href="/demo" className="mt-5 block text-sm text-muted hover:text-brand">先用隔离示例体验完整流程 →</Link></div>}
        </section>
      )}
    </main>
  );
}

function ProjectProgress({ dashboard, documentCount, loading }: { dashboard?: DashboardData; documentCount: number; loading: boolean }) {
  const completed = [
    documentCount > 0,
    (dashboard?.review.counts.successful_runs ?? 0) > 0,
    (dashboard?.review.counts.saved_artifacts ?? 0) > 0,
    (dashboard?.review.counts.verified_claims ?? 0) > 0,
  ];
  const steps = [
    { label: "添加资料", href: "/knowledge" },
    { label: "运行分析", href: "/analysis" },
    { label: "检查成果", href: "/results" },
    { label: "形成报告", href: "/results?tab=writing" },
  ];
  const current = completed.findIndex((item) => !item);
  return <nav aria-label="当前项目进度" className="mt-6 rounded-apple border bg-surface px-3 py-3 sm:px-4">
    <div className="flex items-center justify-between gap-3 px-1"><span className="text-xs font-semibold text-muted">当前项目进度</span><span className="text-[11px] text-subtle">{loading && !dashboard ? "正在核对真实记录…" : `${completed.filter(Boolean).length}/4 已完成`}</span></div>
    <ol className="mt-3 grid grid-cols-4 gap-1">
      {steps.map((step, index) => {
        const done = completed[index];
        const active = current === index || (current === -1 && index === steps.length - 1);
        return <li key={step.label} className="relative min-w-0"><Link href={step.href} className={`group flex min-h-12 flex-col items-center justify-center gap-1 rounded-appleSm px-1 text-center text-[11px] transition sm:flex-row sm:text-xs ${active ? "bg-brand/[.08] font-semibold text-brand" : done ? "text-status-ok hover:bg-status-ok/[.06]" : "text-subtle hover:bg-ink/[.04]"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${done ? "border-status-ok bg-status-ok text-white" : active ? "border-brand text-brand" : "border-ink/10"}`}>{done ? <Check size={12} /> : index + 1}</span><span className="truncate">{step.label}</span></Link></li>;
      })}
    </ol>
  </nav>;
}

function DashboardContent({ dashboard, documentCount, loading }: { dashboard?: DashboardData; documentCount: number; loading: boolean }) {
  if (loading && !dashboard) return <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]"><div className="h-48 animate-pulse rounded-appleLg bg-ink/[.05]" /><div className="h-48 animate-pulse rounded-appleLg bg-ink/[.05]" /></div>;
  const next = nextAction(dashboard, documentCount);
  return <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
    <section aria-labelledby="next-action-title" className="rounded-appleLg border border-brand/15 bg-[linear-gradient(145deg,rgba(47,91,210,.09),rgba(255,255,255,.92)_60%)] p-5 sm:p-6">
      <p className="eyebrow text-brand">建议下一步</p>
      <h2 id="next-action-title" className="mt-2 text-2xl font-semibold tracking-[-.03em]">{next.title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{next.detail}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3"><Link href={next.href} className="btn-primary">{next.action}<ArrowRight size={14} /></Link>{next.secondary && <Link href={next.secondary.href} className="text-link text-sm">{next.secondary.label}<ArrowRight size={13} /></Link>}</div>
      <TrustReceipt dashboard={dashboard} />
    </section>

    <section aria-labelledby="recent-title" className="rounded-appleLg border bg-surface p-5">
      <div className="flex items-center gap-2"><Clock3 size={16} className="text-brand" /><h2 id="recent-title" className="font-semibold">最近研究记录</h2><Link href="/results?tab=records" className="ml-auto text-xs text-link">查看全部</Link></div>
      {dashboard?.events.length ? <ol className="mt-4 space-y-3">{dashboard.events.map((item, index) => <li key={`${item.created_at}-${index}`} className="border-l pl-3"><div className="text-[11px] text-subtle">{timelineLabel(item.kind)} · {formatTime(item.created_at)}</div>{item.href ? <Link href={item.href} className="mt-0.5 line-clamp-2 block text-sm font-semibold leading-5 hover:text-brand">{item.title}</Link> : <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5">{item.title}</p>}</li>)}</ol> : <div className="mt-4 rounded-apple border border-dashed p-4 text-sm leading-6 text-muted">运行第一次分析后，这里会留下资料、代码运行、成果和结论的真实记录。</div>}
    </section>
  </div>;
}

function TrustReceipt({ dashboard }: { dashboard?: DashboardData }) {
  if (!dashboard) return null;
  const { review } = dashboard;
  return <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand/10 pt-4 text-xs text-muted"><span className="inline-flex items-center gap-1.5 font-semibold text-status-ok"><ShieldCheck size={14} />可信状态</span><span>成功分析 {review.counts.successful_runs}</span><span>来源完整 {dashboard.sourceCompleteCount}/{dashboard.savedCount} 项成果</span><span>已验证结论 {review.counts.verified_claims}</span></div>;
}

function nextAction(dashboard: DashboardData | undefined, documentCount: number) {
  const counts = dashboard?.review.counts;
  if (documentCount === 0) return { title: "先把资料放进当前文件夹", detail: "明确研究范围后，Agent 的检索、分析和回答才不会混入其他项目内容。", action: "管理资料", href: "/knowledge" };
  if (!counts?.successful_runs) return { title: "提出第一个研究问题", detail: "直接描述目标即可。Agent 会自动检索当前文件夹、检查数据结构，并在需要时生成和运行 Python。", action: "开始研究", href: "/analysis", secondary: { label: "检查当前资料", href: "/knowledge" } };
  if (!counts.saved_artifacts) return { title: "继续研究并保存关键成果", detail: "回到对话检查图、表和数字，只把真正支持结论的结果保存到成果库。", action: "继续研究", href: "/analysis", secondary: { label: "查看候选结果", href: "/results" } };
  if (!counts.verified_claims) return { title: "形成并校验报告", detail: "使用已保存成果起草结论。关键数字会绑定真实产物，缺少来源或证据不足的内容会被拦截。", action: "形成报告", href: "/results?tab=writing", secondary: { label: "检查已保存成果", href: "/results" } };
  return { title: "继续推进这个研究", detail: "当前项目已形成可回溯结论。可以继续追问、补充数据，或检查最近运行是否发生变化。", action: "继续研究", href: "/analysis", secondary: { label: "查看记录与质量", href: "/results?tab=records" } };
}

function timelineLabel(kind: TimelineItem["kind"]) {
  return { document: "资料", run: "分析", claim: "结论", conversation: "对话" }[kind];
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DashboardSkeleton() {
  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12" aria-label="正在加载工作台"><div className="mx-auto max-w-4xl"><div className="h-32 animate-pulse rounded-appleLg bg-ink/[.05]" /><div className="mt-6 h-20 animate-pulse rounded-appleLg bg-ink/[.05]" /><div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="h-48 animate-pulse rounded-appleLg bg-ink/[.05]" /><div className="h-48 animate-pulse rounded-appleLg bg-ink/[.05]" /></div></div></main>;
}
