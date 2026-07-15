"use client";

import { Blocks, Brain, Check, ChevronDown, Database, Minus } from "lucide-react";
import type { AgentContext } from "@/lib/agentTimeline";

const icons = {
  "dataset.scope": Database,
  "memory.search": Brain,
  "skill.load": Blocks,
} as const;

export function AgentContextBar({ context }: { context?: AgentContext }) {
  if (!context) return null;
  return <details className="group overflow-hidden rounded-appleLg border bg-surface">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-left">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/10 text-brand"><Check size={15} /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">运行上下文已核对</strong><span className="mt-0.5 block truncate text-xs text-muted">数据、项目记忆与技能均按当前范围加载</span></span>
      <ChevronDown size={15} className="text-subtle transition group-open:rotate-180" />
    </summary>
    <div className="grid gap-px border-t bg-line/[.08] sm:grid-cols-3">
      {context.tools.map((tool) => {
        const Icon = icons[tool.name as keyof typeof icons] || Check;
        return <section key={tool.name} className="bg-surface p-4">
          <div className="flex items-center gap-2"><Icon size={14} className={tool.status === "used" ? "text-brand" : "text-subtle"}/><span className="text-xs font-semibold">{tool.label}</span><span className={`ml-auto grid h-5 w-5 place-items-center rounded-full ${tool.status === "used" ? "bg-status-ok/10 text-status-ok" : "bg-ink/[.05] text-subtle"}`}>{tool.status === "used" ? <Check size={11}/> : <Minus size={11}/>}</span></div>
          <p className="mt-2 text-xs leading-5 text-muted">{tool.detail}</p>
          {tool.items && tool.items.length > 0 && <div className="mt-2 space-y-1 border-t pt-2">{tool.items.slice(0, 3).map((item) => <p key={item.id} className="line-clamp-2 text-[11px] leading-4 text-subtle">{item.content}</p>)}</div>}
        </section>;
      })}
    </div>
  </details>;
}
