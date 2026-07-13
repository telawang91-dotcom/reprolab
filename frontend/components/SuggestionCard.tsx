import { BookOpen, FlaskConical, Lightbulb, Route } from "lucide-react";
import Link from "next/link";

import type { SuggestionItem } from "@/lib/api";

const meta = {
  hypothesis: { label: "假设", icon: Lightbulb, tone: "bg-brand/10 text-brand" },
  literature: { label: "文献", icon: BookOpen, tone: "bg-status-ok/10 text-status-ok" },
  next_step: { label: "下一步", icon: Route, tone: "bg-ink/[.06] text-ink" },
};

export function SuggestionCard({ item }: { item: SuggestionItem }) {
  const config = meta[item.type]; const Icon = config.icon;
  return <article className="card flex min-h-52 flex-col p-5">
    <div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.tone}`}><Icon size={13}/>{config.label}</span><FlaskConical size={14} className="ml-auto text-subtle"/></div>
    <p className="mt-4 flex-1 text-sm leading-7 text-ink">{item.content}</p>
    <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">{item.evidence.map((evidence) => <Link key={`${evidence.kind}-${evidence.id}`} href={evidence.kind === "artifact" ? `/lineage/${evidence.id}` : `/knowledge?document=${evidence.id}`} className="rounded-appleSm border px-2 py-1 font-mono text-xs text-muted transition hover:border-brand hover:text-brand">{evidence.anchor}</Link>)}</div>
  </article>;
}
