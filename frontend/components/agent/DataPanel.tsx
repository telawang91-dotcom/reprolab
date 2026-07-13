"use client";

import { Check, Database, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { SkillPanel } from "@/components/skills/SkillPanel";
import type { DocumentDetail, SkillItem } from "@/lib/api";

export function DataPanel({ datasets, selected, onToggle, skill, onSelectSkill, onApplySkill, refreshKey }: { datasets: DocumentDetail[]; selected: string[]; onToggle: (id: string) => void; skill?: SkillItem; onSelectSkill: (skill?: SkillItem) => void; onApplySkill: (skill: SkillItem) => Promise<void>; refreshKey: number }) {
  return <div><div className="flex items-center gap-2"><Database size={16} className="text-brand" /><strong className="text-sm">数据</strong><span className="ml-auto text-xs text-muted">{selected.length} 已选</span></div><div className="mt-3 space-y-2">{datasets.length ? datasets.map((dataset) => { const active = !!dataset.dataset_id && selected.includes(dataset.dataset_id); return <button key={dataset.id} onClick={() => dataset.dataset_id && onToggle(dataset.dataset_id)} className={`w-full rounded-apple border p-3 text-left transition ${active ? "border-brand/35 bg-brand/[.07]" : "hover:bg-ink/[.04]"}`}><div className="flex items-center gap-2"><FileSpreadsheet size={15} className="text-status-ok" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{dataset.filename}</span>{active && <Check size={14} className="text-brand" />}</div><div className="mt-2 text-[11px] text-muted">{dataset.schema_json?.row_count ?? 0} 行 · {dataset.schema_json?.column_count ?? 0} 列</div></button>; }) : <div className="rounded-apple border border-dashed p-4 text-xs leading-5 text-muted">还没有可分析的数据。<Link href="/knowledge" className="mt-2 block font-semibold text-brand">上传 CSV 或 XLSX →</Link></div>}</div><SkillPanel selected={skill?.id} onSelect={onSelectSkill} onApply={onApplySkill} refreshKey={refreshKey} /></div>;
}
