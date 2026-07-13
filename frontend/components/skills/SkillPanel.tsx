"use client";

import { Blocks, Check, Download, Loader2, Play, Store, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, SkillHubItem, SkillItem } from "@/lib/api";

type Props = {
  selected?: string;
  onSelect: (skill?: SkillItem) => void;
  onApply?: (skill: SkillItem) => Promise<void>;
  refreshKey?: number;
};

export function SkillPanel({ selected, onSelect, onApply, refreshKey = 0 }: Props) {
  const [discipline, setDiscipline] = useState("");
  const [items, setItems] = useState<SkillItem[]>([]);
  const [hub, setHub] = useState<SkillHubItem[]>([]);
  const [hubOpen, setHubOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await api.skills(discipline || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "技能加载失败"); }
    finally { setLoading(false); }
  }, [discipline]);

  useEffect(() => { void reload(); }, [reload, refreshKey]);

  async function exportItem(item: SkillItem) {
    setBusy(item.id); setError("");
    try {
      const payload = await api.exportSkill(item.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${item.name}.reproskill.json`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(""); }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setBusy("import"); setError("");
    try { await api.importSkill(JSON.parse(await file.text())); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "技能导入失败"); }
    finally { setBusy(""); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function toggleHub() {
    const next = !hubOpen; setHubOpen(next);
    if (next && !hub.length) {
      try { setHub(await api.skillHub()); } catch (reason) { setError((reason as Error).message); }
    }
  }

  async function importHub(item: SkillHubItem) {
    setBusy(item.id); setError("");
    try { await api.importHubSkill(item.id); await reload(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(""); }
  }

  async function applyItem(item: SkillItem) {
    if (!onApply) return;
    setBusy(item.id); setError("");
    try { await onApply(item); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "技能应用失败"); }
    finally { setBusy(""); }
  }

  return <div className="mt-7 border-t pt-5">
    <div className="flex items-center gap-2 text-sm font-semibold"><Blocks size={15} className="text-brand"/>我的技能<span className="ml-auto text-[10px] text-subtle">可复用</span></div>
    <select value={discipline} onChange={(event) => setDiscipline(event.target.value)} className="input mt-2 h-8 w-full text-xs"><option value="">全部领域</option><option value="general">通用</option><option value="materials">材料</option><option value="biology">生物</option></select>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button onClick={() => inputRef.current?.click()} className="btn-secondary h-8 text-xs"><Upload size={12}/>导入</button>
      <button onClick={() => void toggleHub()} className="btn-secondary h-8 text-xs"><Store size={12}/>SkillHub</button>
      <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])}/>
    </div>
    {loading ? <div className="mt-3 flex items-center gap-2 text-xs text-subtle"><Loader2 size={13} className="animate-spin"/>加载技能…</div> : <div className="mt-2 space-y-2">
      <button onClick={() => onSelect(undefined)} className={`w-full rounded-appleSm border p-2 text-left text-xs ${!selected ? "border-brand/35 bg-brand/[.06]" : "hover:bg-ink/[.04]"}`}><span className="font-semibold">根据问题自动分析</span><span className="mt-1 block text-[10px] text-subtle">没有合适技能时使用</span></button>
      {items.map((item) => <div key={item.id} className={`rounded-appleSm border p-2 text-xs ${selected === item.id ? "border-brand/35 bg-brand/[.06]" : ""}`}>
        <button onClick={() => onSelect(item)} className="w-full text-left"><span className="flex items-center gap-2 font-semibold">{item.name}{selected === item.id && <Check size={12} className="ml-auto text-brand"/>}</span><span className="mt-1 block text-[10px] leading-4 text-subtle">{item.intent || `${item.discipline || "通用"}模板`} · v{item.version}</span></button>
        <div className="mt-2 flex gap-1 border-t pt-2"><button disabled={busy === item.id || !onApply} onClick={() => void applyItem(item)} className="flex flex-1 items-center justify-center gap-1 rounded-appleSm px-1 py-1 text-[10px] text-brand hover:bg-brand/10 disabled:opacity-50">{busy === item.id ? <Loader2 size={10} className="animate-spin"/> : <Play size={10}/>}应用</button><button onClick={() => void exportItem(item)} className="flex items-center gap-1 rounded-appleSm px-2 py-1 text-[10px] text-muted hover:bg-ink/[.05]"><Download size={10}/>导出</button></div>
      </div>)}
    </div>}
    {hubOpen && <div className="mt-3 rounded-appleSm border bg-ink/[.04] p-2"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted">SkillHub</div>{hub.map((item) => <div key={item.id} className="mt-2 rounded-appleSm bg-surface p-2 text-xs"><div className="font-semibold">{item.name}</div><div className="mt-1 text-[10px] leading-4 text-subtle">{item.intent} · {item.author}</div><button onClick={() => void importHub(item)} className="mt-2 text-[10px] font-semibold text-brand">导入到我的技能</button></div>)}</div>}
    {error && <div className="mt-2 text-xs text-status-err">{error}</div>}
    <p className="mt-2 text-[10px] leading-4 text-subtle">复用仍会重新执行并登记完整溯源；字段不匹配时自动回退动态分析。</p>
  </div>;
}
