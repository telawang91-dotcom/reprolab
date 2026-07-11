"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, FileCheck2, FlaskConical, FolderKanban, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api, type ReviewSummary } from "@/lib/api";

export default function ReviewPage() {
  const [review, setReview] = useState<ReviewSummary>(); const [error, setError] = useState("");
  useEffect(() => { api.review().then(setReview).catch((reason) => setError(reason instanceof Error ? reason.message : "审阅摘要加载失败")); }, []);
  if (error) return <div className="mx-auto max-w-5xl p-8"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div></div>;
  if (!review) return <div className="mx-auto max-w-5xl p-8"><div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"/></div>;
  const cards = [{ label: "研究资料", value: review.counts.documents, icon: FolderKanban }, { label: "可信产物", value: review.counts.artifacts, icon: FlaskConical }, { label: "已验证结论", value: review.counts.verified_claims, icon: FileCheck2 }];
  return <div className="mx-auto max-w-5xl space-y-7 p-5 lg:p-8"><header className="flex flex-wrap items-end justify-between gap-4"><div><div className="label">只读审阅</div><h1 className="mt-1 text-2xl font-semibold">{review.project_name} · 研究摘要</h1><p className="mt-2 text-sm text-slate-500">给导师或答辩使用的可信概览：只看事实、风险与下一步。</p></div><Link href="/timeline" className="btn-secondary">查看研究时间线<ArrowRight size={14}/></Link></header><section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950"><div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18}/>可信闭环状态</div><p className="mt-2 text-sm leading-6">{review.counts.verified_claims ? "已有经过校验的结论，可继续导出复现报告。" : "尚未形成经过校验的结论；请从资料、分析或写作流程继续。"}</p></section><section className="grid gap-3 sm:grid-cols-3">{cards.map(({ label, value, icon: Icon }) => <article key={label} className="card p-5"><Icon size={17} className="text-brand"/><div className="mt-5 text-3xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-sm text-slate-500">{label}</div></article>)}</section>{review.risks.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={16}/>需要关注</div><ul className="mt-3 space-y-2 text-sm text-amber-800">{review.risks.map((risk) => <li key={risk}>• {risk}</li>)}</ul></section>}<section className="card p-5"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} className="text-emerald-600"/>建议下一步</div><div className="mt-3 space-y-2">{review.next_actions.map((action) => <p key={action} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">{action}</p>)}</div></section></div>;
}
