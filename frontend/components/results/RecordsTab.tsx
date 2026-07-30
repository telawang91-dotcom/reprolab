"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  FileCheck2,
  FlaskConical,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  api,
  type QualityMetric,
  type QualityReport,
  type ReviewSummary,
  type TimelineItem,
} from "@/lib/api";

const timelineMeta = {
  document: { icon: BookOpen, label: "资料" },
  run: { icon: FlaskConical, label: "分析" },
  claim: { icon: FileCheck2, label: "结论" },
  conversation: { icon: MessageSquareText, label: "会话" },
};

const metricTone: Record<QualityMetric["state"], string> = {
  ready: "border-status-ok/20 bg-status-ok/[.06] text-status-ok",
  warn: "border-status-warn/20 bg-status-warn/[.06] text-status-warn",
  block: "border-status-err/20 bg-status-err/[.06] text-status-err",
};

function metricValue(metric: QualityMetric) {
  if (metric.ratio !== null) return `${Math.round(metric.ratio * 100)}%`;
  if (metric.total !== null) return `${metric.value}/${metric.total}`;
  return String(metric.value);
}

export function RecordsTab() {
  const [events, setEvents] = useState<TimelineItem[]>([]);
  const [review, setReview] = useState<ReviewSummary>();
  const [quality, setQuality] = useState<QualityReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [timeline, summary, report] = await Promise.all([
        api.timeline(),
        api.review(),
        api.qualityReport(),
      ]);
      setEvents(timeline.events);
      setReview(summary);
      setQuality(report);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "研究记录加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-appleLg bg-ink/[.06]" />)}</div>;
  }
  if (error || !review || !quality) {
    return <div className="status-error flex items-center gap-3"><AlertTriangle size={16} /><span className="flex-1">{error || "质量报告暂不可用"}</span><button onClick={() => void load()} className="btn-secondary h-8 px-3"><RefreshCw size={13} />重试</button></div>;
  }

  return (
    <div className="space-y-6">
      <section className={`rounded-appleLg border p-5 ${quality.ready_for_demo ? "border-status-ok/20 bg-status-ok/[.05]" : "border-status-warn/25 bg-status-warn/[.05]"}`}>
        <div className="flex flex-wrap items-start gap-4">
          <span className={`grid h-11 w-11 place-items-center rounded-full ${quality.ready_for_demo ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>
            {quality.ready_for_demo ? <ShieldCheck size={21} /> : <AlertTriangle size={21} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Project quality gate</p>
            <h2 className="mt-1 text-xl font-semibold">{quality.ready_for_demo ? "可信研究闭环已就绪" : "可信研究闭环仍有阻塞项"}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {quality.ready_for_demo ? "数据、运行、血缘、复现与结论校验均已留下可审计证据。" : `还有 ${quality.blockers.length} 项需要处理；完成后再导出或演示。`}
            </p>
          </div>
          <button onClick={() => void load()} className="btn-secondary h-9 px-3"><RefreshCw size={13} />重新检查</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quality.metrics.map((metric) => (
            <article key={metric.key} className={`rounded-apple border p-4 ${metricTone[metric.state]}`}>
              <div className="flex items-center gap-2 text-xs font-semibold">
                {metric.state === "ready" ? <CheckCircle2 size={14} /> : metric.state === "block" ? <XCircle size={14} /> : <Circle size={14} />}
                <span>{metric.title}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">{metricValue(metric)}</div>
              <p className="mt-1 text-xs leading-5 text-muted">{metric.evidence}</p>
            </article>
          ))}
        </div>

        {quality.blockers.length > 0 && (
          <div className="mt-5 rounded-apple border border-status-warn/20 bg-surface/70 p-4">
            <h3 className="text-sm font-semibold">阻塞项</h3>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted">
              {quality.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/knowledge" className="btn-secondary h-9 px-3">检查资料</Link>
          <Link href="/analysis" className="btn-secondary h-9 px-3">继续分析</Link>
          <Link href="/results?tab=writing" className="btn-primary h-9 px-3">校验报告</Link>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-appleLg border bg-surface p-6">
          <h2 className="text-xl font-semibold">研究时间线</h2>
          <p className="mt-1 text-sm text-muted">资料、分析、结论和会话均来自真实记录。</p>
          {events.length ? (
            <ol className="mt-7 border-l pl-6">
              {events.map((item, index) => {
                const meta = timelineMeta[item.kind];
                const Icon = meta.icon;
                return (
                  <li key={`${item.created_at}-${index}`} className="relative pb-7 last:pb-0">
                    <span className={`absolute -left-[39px] grid h-7 w-7 place-items-center rounded-full border bg-surface ${item.trusted ? "text-status-ok" : "text-muted"}`}><Icon size={14} /></span>
                    <div className="text-xs text-subtle">{meta.label} · {new Date(item.created_at).toLocaleString("zh-CN")}</div>
                    {item.href ? <Link href={item.href} className="mt-1 block font-semibold hover:text-brand">{item.title}</Link> : <h3 className="mt-1 font-semibold">{item.title}</h3>}
                    <p className="mt-1 text-sm leading-6 text-muted">{item.detail}</p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="mt-7 rounded-apple border border-dashed p-8 text-center text-sm text-muted">开始上传资料或运行分析后，这里会留下可回溯记录。</div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-appleLg border bg-surface p-5">
            <h3 className="font-semibold">审阅摘要</h3>
            <dl className="mt-4 space-y-3">
              {[
                { label: "研究资料", value: review.counts.documents },
                { label: "成功运行", value: review.counts.successful_runs },
                { label: "可信产物", value: review.counts.artifacts },
                { label: "已验证结论", value: review.counts.verified_claims },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <dt className="text-muted">{item.label}</dt>
                  <dd className="font-semibold">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {review.risks.length > 0 && (
            <section className="rounded-appleLg border bg-status-warn/[.06] p-5">
              <div className="flex items-center gap-2 font-semibold text-status-warn"><AlertTriangle size={16} />需要关注</div>
              <ul className="mt-3 space-y-2 text-sm text-muted">{review.risks.map((risk) => <li key={risk}>• {risk}</li>)}</ul>
            </section>
          )}
          <section className="rounded-appleLg border bg-surface p-5">
            <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} className="text-status-ok" />建议下一步</div>
            <div className="mt-3 space-y-2">{quality.next_actions.map((action) => <p key={action} className="rounded-apple bg-ink/[.04] p-3 text-sm text-muted">{action}</p>)}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
