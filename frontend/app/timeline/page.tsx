"use client";

import { ArrowRight, BookOpen, CheckCircle2, FileCheck2, FlaskConical, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api, type TimelineItem } from "@/lib/api";

const meta = {
  document: { icon: BookOpen, label: "资料" },
  run: { icon: FlaskConical, label: "分析" },
  claim: { icon: FileCheck2, label: "结论" },
  conversation: { icon: MessageSquareText, label: "会话" },
};

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api.timeline().then((result) => setEvents(result.events)).catch((reason) => setError(reason instanceof Error ? reason.message : "时间线加载失败")); }, []);
  return <div className="mx-auto max-w-4xl p-5 lg:p-8"><header className="mb-8"><div className="label">研究日志</div><h1 className="mt-1 text-2xl font-semibold">研究时间线</h1><p className="mt-2 text-sm leading-6 text-slate-500">资料、分析、结论和会话按时间串联；每一项都回到真实记录，而不是手工日志。</p></header>{error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}{events.length ? <ol className="border-l border-slate-200 pl-6 dark:border-slate-800">{events.map((item, index) => { const Icon = meta[item.kind].icon; return <li key={`${item.kind}-${index}-${item.created_at}`} className="relative pb-7 last:pb-0"><span className={`absolute -left-[39px] grid h-7 w-7 place-items-center rounded-full border ${item.trusted ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950"}`}><Icon size={14}/></span><div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>{meta[item.kind].label}</span><span>·</span><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time>{item.trusted && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12}/>可信记录</span>}</div><h2 className="mt-1 font-semibold">{item.title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>{item.href && <Link href={item.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand">查看记录<ArrowRight size={12}/></Link>}</li>; })}</ol> : <div className="card p-8 text-center text-sm text-slate-500">开始上传资料或运行一次分析后，这里会留下可回溯的研究过程。</div>}</div>;
}
