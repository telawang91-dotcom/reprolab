"use client";

import { Blocks, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api, SkillItem } from "@/lib/api";

export function SkillPanel({ selected, onSelect }: { selected?: string; onSelect: (skill?: SkillItem) => void }) {
  const [discipline, setDiscipline] = useState("");
  const [items, setItems] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setLoading(true); setError("");
    api.skills(discipline || undefined).then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : "技能加载失败")).finally(() => setLoading(false));
  }, [discipline]);
  return <div className="mt-7 border-t pt-5"><div className="flex items-center gap-2 text-sm font-medium"><Blocks size={15} className="text-violet-600"/>可选技能包<span className="ml-auto text-[10px] text-slate-400">加速模板</span></div><select value={discipline} onChange={(event) => setDiscipline(event.target.value)} className="input mt-2 h-8 w-full text-xs"><option value="">全部学科</option><option value="general">通用</option><option value="materials">材料</option><option value="biology">生物</option></select>{loading ? <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Loader2 size={13} className="animate-spin"/>加载技能库…</div> : error ? <div className="mt-3 text-xs text-red-600">{error}</div> : <div className="mt-2 space-y-2"><button onClick={() => onSelect(undefined)} className={`w-full rounded-lg border p-2 text-left text-xs ${!selected ? "border-blue-300 bg-blue-50" : "hover:bg-slate-50"}`}><span className="font-medium">动态分析（不使用模板）</span><span className="mt-1 block text-[10px] text-slate-400">核心通用路径</span></button>{items.map((item) => <button key={item.id} onClick={() => onSelect(item)} className={`w-full rounded-lg border p-2 text-left text-xs ${selected === item.id ? "border-violet-300 bg-violet-50" : "hover:bg-slate-50"}`}><span className="flex items-center gap-2 font-medium">{item.name}{selected === item.id && <Check size={12} className="ml-auto text-violet-600"/>}</span><span className="mt-1 block text-[10px] text-slate-400">{item.discipline || "未分类"} · {String(item.meta?.renderer || "auto")}</span></button>)}</div>}<p className="mt-2 text-[10px] leading-4 text-slate-400">技能只提供提示与代码骨架；Agent 仍会按当前问题动态调整。</p></div>;
}
