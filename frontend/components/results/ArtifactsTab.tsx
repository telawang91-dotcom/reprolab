"use client";

import { AlertTriangle, BarChart3, CheckCircle2, Download, Network, PenLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { activeProjectId, api, type ArtifactSummary, type ReviewSummary } from "@/lib/api";
import { addArtifactToWriting } from "@/lib/writingStorage";

export function ArtifactsTab() {
  const [items, setItems] = useState<ArtifactSummary[]>([]);
  const [review, setReview] = useState<ReviewSummary>();
  const [error, setError] = useState("");
  useEffect(() => { Promise.all([api.artifacts(), api.review()]).then(([artifacts, summary]) => { setItems(artifacts.items); setReview(summary); }).catch((reason) => setError(reason instanceof Error ? reason.message : "成果加载失败")); }, []);
  const exportArtifact = (item: ArtifactSummary) => {
    if (item.content_hash) { window.open(api.artifactContentUrl(item.id), "_blank", "noopener,noreferrer"); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(item.value, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${item.title || item.kind}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  if (error) return <div className="status-error"><AlertTriangle size={16} />{error}</div>;
  if (!review) return <div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="h-32 animate-pulse rounded-appleLg bg-ink/[.06]" />)}</div>;
  if (!items.length) return <section className="empty-interactive grid min-h-[420px] place-items-center rounded-appleLg border border-dashed p-12 text-center"><div><span className="empty-interactive-icon mx-auto grid h-14 w-14 place-items-center rounded-apple bg-ink/[.05] text-subtle"><BarChart3 /></span><h2 className="mt-5 text-xl font-semibold">当前文件夹还没有成果</h2><p className="mt-2 text-sm leading-6 text-muted">完成一次真实数据分析后，图、表和可信数字会集中出现在这里。</p><Link href="/analysis" className="btn-primary mt-6">开始分析</Link></div></section>;
  return <div className="space-y-6"><section className="grid gap-4 sm:grid-cols-3">{[{ label: "成功运行", value: review.counts.successful_runs }, { label: "分析产物", value: review.counts.artifacts }, { label: "可信结论", value: review.counts.verified_claims }].map((item) => <article key={item.label} className="rounded-appleLg border bg-surface p-5"><strong className="text-3xl font-semibold tracking-tight">{item.value}</strong><span className="mt-1 block text-sm text-muted">{item.label}</span></article>)}</section><section><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-semibold">成果库</h2><p className="mt-1 text-sm text-muted">每个结果都可检查来源、导出或进入写作。</p></div><span className="text-xs text-status-ok">{items.filter((item) => item.source_complete).length} 项来源完整</span></div><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{items.map((item) => <article key={item.id} className="group rounded-appleLg border bg-surface p-4 transition hover:-translate-y-0.5"><div className="flex items-start gap-3"><span className={`grid h-9 w-9 place-items-center rounded-appleSm ${item.source_complete ? "bg-status-ok/10 text-status-ok" : "bg-status-warn/10 text-status-warn"}`}>{item.source_complete ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span><div className="min-w-0"><span className="text-xs uppercase tracking-wide text-subtle">{item.kind}</span><h3 className="truncate font-semibold">{item.title || "未命名分析产物"}</h3></div></div>{item.kind === "figure" && item.content_hash ? <img src={api.artifactContentUrl(item.id)} alt={item.title || "分析图表"} className="mt-4 h-44 w-full rounded-apple object-contain" /> : <pre className="mt-4 h-44 overflow-auto rounded-apple bg-ink/[.04] p-3 font-mono text-xs">{JSON.stringify(item.value, null, 2)}</pre>}<div className="mt-4 flex gap-2"><Link href={`/lineage/${item.id}`} className="btn-secondary h-9 flex-1 px-3"><Network size={13} />来源</Link><button onClick={() => exportArtifact(item)} className="btn-secondary h-9 px-3" aria-label="导出产物"><Download size={13} /></button><Link href="/results?tab=writing" onClick={() => addArtifactToWriting(activeProjectId(), { artifact_id: item.id, title: item.title })} className="btn-primary h-9 px-3"><PenLine size={13} />写作</Link></div></article>)}</div></section></div>;
}
