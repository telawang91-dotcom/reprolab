"use client";

import { AlertTriangle, ArrowDown, Braces, Database, FileText, FlaskConical, Quote, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Lineage } from "@/lib/api";

const nodeView: Record<string, { label: string; icon: typeof Database }> = {
  dataset: { label: "原始数据", icon: Database },
  run: { label: "分析代码与环境", icon: Braces },
  artifact: { label: "当前产物", icon: FlaskConical },
  claim: { label: "可信结论", icon: Quote },
  document: { label: "来源文档", icon: FileText },
};

const order = ["document", "dataset", "run", "artifact", "claim"];

export function QuickLineage({ lineage }: { lineage?: Lineage }) {
  if (!lineage) return <div className="grid min-h-48 place-items-center text-sm text-muted">正在读取可信链…</div>;
  const nodes = [...lineage.nodes].sort((left, right) => order.indexOf(left.type) - order.indexOf(right.type));
  const types = new Set(nodes.map((node) => node.type));
  const complete = types.has("dataset") && types.has("run") && types.has("artifact");
  const artifact = nodes.find((node) => node.type === "artifact");

  return <div className="space-y-5">
    <div className={`rounded-appleLg p-5 ${complete ? "bg-status-ok/[.07]" : "bg-status-warn/[.08]"}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${complete ? "text-status-ok" : "text-status-warn"}`}>{complete ? <ShieldCheck size={16}/> : <AlertTriangle size={16}/>} {complete ? "来源完整，可回到数据和运行" : "来源尚未完整，暂不要用于结论"}</div>
      <p className="mt-2 text-sm leading-6 text-muted">数据、代码或环境任一变化，运行指纹都会改变；下方每个节点都来自项目账本。</p>
    </div>
    <div className="mx-auto max-w-xl">
      {nodes.map((node, index) => {
        const view = nodeView[node.type] || nodeView.document;
        const Icon = view.icon;
        const fingerprint = String(node.meta.code_hash ?? node.meta.storage_hash ?? node.meta.content_hash ?? "已登记到项目账本");
        return <div key={node.id}>
          <article className="rounded-appleLg border bg-surface p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Icon size={18}/></span><div className="min-w-0"><div className="text-xs font-semibold text-brand">{view.label}</div><div className="mt-1 truncate text-sm font-semibold">{node.label}</div></div></div><div className="mt-3 truncate rounded-appleSm bg-ink/[.035] px-3 py-2 font-mono text-[10px] text-muted" title={fingerprint}>{fingerprint}</div></article>
          {index < nodes.length - 1 && <div className="grid h-8 place-items-center text-brand"><ArrowDown size={15}/></div>}
        </div>;
      })}
    </div>
    {artifact && <div className="text-center"><Link href={`/lineage/${artifact.id}`} className="btn-secondary inline-flex">打开完整溯源并复现</Link></div>}
  </div>;
}
