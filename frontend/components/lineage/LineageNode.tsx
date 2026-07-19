"use client";
import { Braces, Database, FileText, FlaskConical, Quote } from "lucide-react";
import { Handle, NodeProps, Position } from "reactflow";

const styles: Record<string, { icon: typeof Database; tone: string; accent: string }> = {
  dataset: { icon: Database, tone: "bg-brand/10 text-brand", accent: "rgb(var(--accent))" },
  run: { icon: Braces, tone: "bg-role-execute/10 text-role-execute", accent: "rgb(var(--role-execute))" },
  artifact: { icon: FlaskConical, tone: "bg-role-review/10 text-role-review", accent: "rgb(var(--role-review))" },
  claim: { icon: Quote, tone: "bg-status-warn/10 text-status-warn", accent: "rgb(var(--status-warn))" },
  document: { icon: FileText, tone: "bg-ink/[.05] text-muted", accent: "rgb(var(--text-secondary))" }
};
const typeLabels: Record<string, string> = { dataset: "数据", run: "代码与运行", artifact: "产物", claim: "结论", document: "文档" };

export type LineageNodeData = {
  label: string; type: string; meta: Record<string, unknown>; active?: boolean; dimmed?: boolean;
};

export function LineageNode({ data, selected }: NodeProps<LineageNodeData>) {
  const style = styles[data.type] ?? styles.document; const Icon = style.icon;
  return <div className={`min-w-[190px] rounded-apple border bg-surface p-3 transition-all duration-200 ${data.active ? "scale-[1.02]" : ""} ${data.dimmed ? "opacity-25 grayscale" : ""}`} style={data.active || selected ? { borderColor: style.accent } : undefined}>
    <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0" style={{ background: style.accent }}/>
    <div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-appleSm ${style.tone}`}><Icon size={16}/></span><div className="min-w-0"><div className="text-[10px] font-semibold tracking-wider" style={{ color: style.accent }}>{typeLabels[data.type] ?? data.type}</div><div className="max-w-[135px] truncate text-sm font-semibold">{data.label}</div></div></div>
    <div className="mt-2 truncate font-mono text-[9px] text-subtle">{String(data.meta.code_hash ?? data.meta.storage_hash ?? data.meta.content_hash ?? "可审计节点")}</div>
    <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0" style={{ background: style.accent }}/>
  </div>;
}
