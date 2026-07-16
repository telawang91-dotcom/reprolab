"use client";

import { ArrowLeftRight, Archive, FileDown, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type RunCompare, type RunReport } from "@/lib/api";
import { ArtifactValue } from "@/components/agent/ArtifactValue";

const changeTone = (changed: boolean) => changed ? "text-status-err" : "text-status-ok";

export default function ReportPage() {
  const params = useParams<{ runId: string }>();
  const [report, setReport] = useState<RunReport>();
  const [otherRun, setOtherRun] = useState("");
  const [comparison, setComparison] = useState<RunCompare>();
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.runReport(params.runId).then(setReport).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "报告加载失败"));
  }, [params.runId]);

  if (error) return <div className="mx-auto max-w-4xl p-8"><div className="rounded-apple border border-status-err/20 bg-status-err/[.06] p-4 text-sm text-status-err">{error}</div></div>;
  if (!report) return <div className="mx-auto max-w-4xl p-8"><div className="h-72 animate-pulse rounded-xl bg-ink/[.06]" /></div>;

  return <div className="mx-auto max-w-4xl space-y-7 p-5 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="label">可交付复现报告</div><h1 className="mt-1 text-2xl font-semibold">运行 {report.run_id.slice(0, 8)}</h1><p className="mt-2 text-sm text-muted">{report.reproduction_note}</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => window.print()} className="btn-secondary"><FileDown size={14} />打印 / 导出 PDF</button><button onClick={() => { setExporting(true); api.downloadRunBundle(report.run_id).catch((reason) => setError(reason instanceof Error ? reason.message : "复现包导出失败")).finally(() => setExporting(false)); }} disabled={exporting} className="btn-primary"><Archive size={14} />{exporting ? "正在打包…" : "导出完整复现包"}</button></div>
    </header>

    <section className={`rounded-appleLg border p-5 ${report.status === "success" ? "border-status-ok/20 bg-status-ok/[.06]" : "border-status-err/20 bg-status-err/[.06]"}`}>
      <div className={`flex items-center gap-2 font-semibold ${changeTone(report.status !== "success")}`}><ShieldCheck size={16} />运行状态：{report.status === "success" ? "成功" : "失败"}</div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><span>随机种子：{report.seed ?? "—"}</span><span>输入哈希：{report.input_hash.slice(0, 12)}</span><span>代码哈希：{report.code_hash.slice(0, 12)}</span></div>
    </section>

    <section className="card p-5"><h2 className="font-semibold">输入数据</h2><div className="mt-3 space-y-2">{report.datasets.length ? report.datasets.map((item) => <div key={item.id} className="rounded-lg bg-ink/[.04] p-3 text-sm"><strong>{item.name}</strong><span className="ml-2 font-mono text-xs text-subtle">{item.storage_hash.slice(0, 12)}</span></div>) : <p className="text-sm text-muted">本次运行未读取数据集。</p>}</div></section>
    <section className="card p-5"><h2 className="font-semibold">结果产物</h2><div className="mt-3 space-y-2">{report.artifacts.map((item) => <div key={item.id} className="overflow-hidden rounded-lg border"><div className="border-b px-3 py-2 text-sm font-medium">{item.title || item.kind}</div><ArtifactValue artifact={{ artifact_id: item.id, kind: item.kind, title: item.title, value_json: item.value }} /></div>)}</div></section>
    <section className="card p-5"><h2 className="font-semibold">环境</h2><p className="mt-2 text-sm text-muted">Python {report.environment.python_version || "—"} · 环境哈希 {report.environment.env_hash?.slice(0, 12) || "—"}</p></section>

    <section className="card p-5">
      <div className="flex items-center gap-2 font-semibold"><ArrowLeftRight size={16} className="text-brand" />对比另一次运行</div>
      <div className="mt-3 flex gap-2"><input value={otherRun} onChange={(event) => setOtherRun(event.target.value)} className="input flex-1 font-mono text-xs" placeholder="粘贴另一运行 UUID" /><button onClick={() => api.compareRuns(report.run_id, otherRun).then(setComparison).catch((reason) => setError(reason.message))} disabled={!otherRun.trim()} className="btn-secondary">比较</button></div>
      {comparison && <div className="mt-4 text-sm"><div className="flex flex-wrap gap-2 text-xs"><span className={changeTone(comparison.code_changed)}>代码{comparison.code_changed ? "有变化" : "一致"}</span><span className={changeTone(comparison.input_changed)}>输入{comparison.input_changed ? "有变化" : "一致"}</span><span className={changeTone(comparison.environment_changed)}>环境{comparison.environment_changed ? "有变化" : "一致"}</span></div><div className="mt-3 space-y-2">{comparison.artifact_changes.filter((item) => item.changed).map((item) => <div key={item.key} className="rounded-appleSm bg-status-err/[.06] p-3 text-xs text-status-err">{item.key}：结果发生变化</div>)}</div></div>}
    </section>
  </div>;
}
