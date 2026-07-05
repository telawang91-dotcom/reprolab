"use client";
import { Braces, Database, FileText, FlaskConical, Quote } from "lucide-react";
import { Handle, NodeProps, Position } from "reactflow";

const styles: Record<string, { icon: typeof Database; accent: string; surface: string }> = {
  dataset: { icon: Database, accent: "#4F46E5", surface: "#EEF2FF" },
  run: { icon: Braces, accent: "#2563EB", surface: "#EFF6FF" },
  artifact: { icon: FlaskConical, accent: "#059669", surface: "#ECFDF5" },
  claim: { icon: Quote, accent: "#D97706", surface: "#FFFBEB" },
  document: { icon: FileText, accent: "#64748B", surface: "#F8FAFC" }
};

export type LineageNodeData = {
  label: string; type: string; meta: Record<string, unknown>; active?: boolean; dimmed?: boolean;
};

export function LineageNode({ data, selected }: NodeProps<LineageNodeData>) {
  const style = styles[data.type] ?? styles.document; const Icon = style.icon;
  return <div className={`min-w-[190px] rounded-xl border-2 bg-white p-3 shadow-card transition-all duration-200 dark:bg-slate-900 ${data.active ? "scale-[1.03] shadow-lg" : ""} ${data.dimmed ? "opacity-25 grayscale" : ""}`} style={{ borderColor: data.active || selected ? style.accent : "#E2E8F0" }}>
    <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0" style={{ background: style.accent }}/>
    <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: style.accent, background: style.surface }}><Icon size={16}/></span><div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: style.accent }}>{data.type}</div><div className="max-w-[135px] truncate text-sm font-medium">{data.label}</div></div></div>
    <div className="mt-2 truncate font-mono text-[9px] text-slate-400">{String(data.meta.code_hash ?? data.meta.storage_hash ?? data.meta.content_hash ?? "可审计节点")}</div>
    <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0" style={{ background: style.accent }}/>
  </div>;
}

