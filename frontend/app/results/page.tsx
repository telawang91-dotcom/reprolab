"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FlaskConical,
  History,
  PackageCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ResearchFlow } from "@/components/workflow/ResearchFlow";
import { api, type ReviewSummary, type TimelineItem } from "@/lib/api";

export default function ResultsPage() {
  const [review, setReview] = useState<ReviewSummary>();
  const [events, setEvents] = useState<TimelineItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api.review(), api.timeline()])
      .then(([summary, timeline]) => {
        setReview(summary);
        setEvents(timeline.events);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "成果加载失败"),
      );
  }, []);
  const results = events
    .filter((item) => item.kind === "run" || item.kind === "claim")
    .slice(0, 8);
  return (
    <div className="page-shell space-y-7">
      <ResearchFlow stage={2} />
      <header className="page-header">
        <div>
          <div className="eyebrow text-brand">Research outputs</div>
          <h1>研究成果</h1>
          <p>
            把运行、产物、验证状态和结论集中到一处，再决定哪些内容进入报告。
          </p>
        </div>
        <Link href="/writing" className="btn-primary">
          <FileCheck2 size={15} />
          整理报告
        </Link>
      </header>
      {error && (
        <div className="status-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      {!review && !error ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-[20px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : (
        review && (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: "成功运行",
                  value: review.counts.successful_runs,
                  icon: FlaskConical,
                  tone: "text-indigo-600 bg-indigo-50",
                },
                {
                  label: "分析产物",
                  value: review.counts.artifacts,
                  icon: PackageCheck,
                  tone: "text-blue-600 bg-blue-50",
                },
                {
                  label: "可信结论",
                  value: review.counts.verified_claims,
                  icon: CheckCircle2,
                  tone: "text-emerald-600 bg-emerald-50",
                },
              ].map(({ label, value, icon: Icon, tone }) => (
                <article key={label} className="metric-card">
                  <span className={`metric-icon ${tone}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                </article>
              ))}
            </section>
            <section className="content-card">
              <div className="section-heading">
                <div>
                  <h2>最近成果</h2>
                  <p>可信状态来自真实运行和结论记录。</p>
                </div>
                <Link href="/timeline" className="text-link">
                  <History size={14} />
                  完整时间线
                </Link>
              </div>
              {results.length ? (
                <div className="divide-y dark:divide-slate-800">
                  {results.map((item, index) => (
                    <article
                      key={`${item.created_at}-${index}`}
                      className="result-row"
                    >
                      <span
                        className={`result-status ${item.trusted ? "result-status-trusted" : ""}`}
                      >
                        {item.trusted ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <AlertTriangle size={16} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3>{item.title}</h3>
                          <span
                            className={
                              item.trusted ? "badge-success" : "badge-pending"
                            }
                          >
                            {item.trusted ? "来源完整" : "待检查"}
                          </span>
                        </div>
                        <p>{item.detail}</p>
                      </div>
                      {item.href && (
                        <Link
                          href={item.href}
                          className="btn-secondary h-9 px-4"
                        >
                          查看
                          <ArrowRight size={13} />
                        </Link>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-panel">
                  <PackageCheck size={24} />
                  <h3>还没有分析成果</h3>
                  <p>选择一份数据提出问题，完成后会自动出现在这里。</p>
                  <Link href="/analysis" className="btn-primary">
                    开始分析
                    <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
