"use client";

import {
  Blocks,
  Brain,
  Check,
  ChevronDown,
  Database,
  Files,
  Minus,
  Search,
  TableProperties,
} from "lucide-react";
import type { AgentContext, AgentToolReceipt } from "@/lib/agentTimeline";

const icons = {
  "dataset.scope": Database,
  "file.scope": Files,
  "knowledge.search": Search,
  "dataset.inspect": TableProperties,
  "memory.search": Brain,
  "skill.load": Blocks,
} as const;

const why: Record<string, string> = {
  "dataset.scope": "问题需要计算，因此只使用当前文件夹内已锁定的数据。",
  "file.scope": "回答范围仅限当前研究文件夹，避免混入其他项目资料。",
  "knowledge.search": "为了让回答回到原文，先检索与问题直接相关的片段。",
  "dataset.inspect": "先核对字段与结构，再决定是否需要运行分析。",
  "memory.search": "只召回与当前问题相关且仍有效的项目记忆。",
  "skill.load": "可选技能只用于加速；执行时仍会重新登记数据、代码和环境。",
};

function receiptSummary(tool: AgentToolReceipt) {
  const count = tool.count || 1;
  if (tool.name === "dataset.scope" && tool.status === "used") return `${count} 份数据`;
  if (tool.name === "file.scope" && tool.status === "used") return `${count} 个文件`;
  if (tool.name === "knowledge.search" && tool.status === "used") return `${tool.count} 条原文依据`;
  if (tool.name === "dataset.inspect" && tool.status === "used") return `${count} 个数据表`;
  if (tool.name === "memory.search" && tool.status === "used") return `${tool.count} 条有效记忆`;
  if (tool.name === "skill.load") return tool.status === "used" ? `${count} 个分析技能` : "动态分析";
  return tool.status === "used" ? tool.label : "";
}

function receiptWhy(tool: AgentToolReceipt) {
  if (tool.name === "skill.load" && tool.status === "empty") {
    return "未套用固定模板，由 Agent 根据真实字段动态规划。";
  }
  return why[tool.name] || "这项依据已按当前研究范围核对。";
}

export function AgentContextBar({ context }: { context?: AgentContext }) {
  if (!context) return null;
  const summary = context.tools.map(receiptSummary).filter(Boolean).join(" · ");

  return <details className="group overflow-hidden rounded-appleLg border bg-surface">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-left">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/10 text-brand"><Check size={15} /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">本轮依据已核对</strong><span className="mt-0.5 block truncate text-xs text-muted">{summary || "未调用额外资料或技能"}</span></span>
      <ChevronDown size={15} className="text-subtle transition group-open:rotate-180" />
    </summary>
    <div className="grid gap-px border-t bg-line/[.08] sm:grid-cols-3">
      {context.tools.map((tool, index) => {
        const Icon = icons[tool.name as keyof typeof icons] || Check;
        const used = tool.status === "used";
        return <section key={`${tool.name}-${index}`} className="bg-surface p-4">
          <div className="flex items-center gap-2"><Icon size={14} className={used ? "text-brand" : "text-subtle"}/><span className="text-xs font-semibold">{tool.label}</span><span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${used ? "bg-status-ok/10 text-status-ok" : "bg-ink/[.05] text-subtle"}`}>{used ? <><Check size={10} className="mr-1 inline"/>已使用</> : <><Minus size={10} className="mr-1 inline"/>未使用</>}</span></div>
          <p className="mt-2 text-xs leading-5 text-muted">{tool.detail}</p>
          <p className="mt-2 border-t pt-2 text-[11px] leading-4 text-subtle">{receiptWhy(tool)}</p>
          {tool.items && tool.items.length > 0 && <div className="mt-2 space-y-1 rounded-appleSm bg-ink/[.025] p-2">{tool.items.slice(0, 3).map((item) => <p key={item.id} className="line-clamp-2 text-[11px] leading-4 text-subtle">{item.content}</p>)}</div>}
        </section>;
      })}
    </div>
  </details>;
}
