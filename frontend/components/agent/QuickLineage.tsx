"use client";

import { ArrowDown, Braces, Database, FileText, FlaskConical, Quote, ShieldCheck } from "lucide-react";
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
  return <div className="space-y-5">
    <div className="rounded-appleLg bg-brand/[.055] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-brand"><ShieldCheck size={16}/>这项结果从哪里来</div><p className="mt-2 text-sm leading-6 text-muted">下面每个节点都来自项目账本。数据、代码或环境任一变化，运行指纹都会改变。</p></div>
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
    <p className="text-center text-xs leading-5 text-muted">完整溯源页可查看节点详情、执行代码、环境快照，并一键复现结果。</p>
  </div>;
}
