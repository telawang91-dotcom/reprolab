"use client";

import { Blocks, Check, ChevronRight, Download, FileCode2, Loader2, Play, Store, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Sheet } from "@/components/ui/Sheet";
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
  const [hubLoading, setHubLoading] = useState(false);
  const [focusedHub, setFocusedHub] = useState<string>();
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
    try { const created = await api.importSkill(JSON.parse(await file.text())); await reload(); onSelect(created); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "技能导入失败"); }
    finally { setBusy(""); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function openHub() {
    setHubOpen(true); setError("");
    if (hub.length) return;
    setHubLoading(true);
    try {
      const catalog = await api.skillHub();
      setHub(catalog);
      setFocusedHub(catalog[0]?.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "SkillHub 加载失败"); }
    finally { setHubLoading(false); }
  }

  async function importHub(item: SkillHubItem) {
    setBusy(item.id); setError("");
    try { const created = await api.importHubSkill(item.id); await reload(); onSelect(created); }
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

  const focused = hub.find((item) => item.id === focusedHub) || hub[0];
  const installed = (item: SkillHubItem) => items.some((skill) => skill.package_hash === item.package_hash);

  return <div className="mt-7 border-t pt-5">
    <div className="flex items-center gap-2 text-sm font-semibold"><Blocks size={15} className="text-brand"/>技能<span className="ml-auto text-[10px] text-subtle">可选加速</span></div>
    <p className="mt-1 text-[10px] leading-4 text-subtle">技能不会限制 Agent 的动态分析；字段不匹配时安全回退。</p>
    <select value={discipline} onChange={(event) => setDiscipline(event.target.value)} className="input mt-3 h-9 w-full px-3 text-xs"><option value="">全部领域</option><option value="general">通用</option><option value="materials">材料</option><option value="biology">生物</option></select>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button onClick={() => inputRef.current?.click()} className="btn-secondary h-9 px-2 text-xs"><Upload size={12}/>{busy === "import" ? "导入中" : "导入"}</button>
      <button onClick={() => void openHub()} className="btn-secondary h-9 px-2 text-xs"><Store size={12}/>SkillHub</button>
      <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])}/>
    </div>
    {loading ? <div className="mt-3 flex items-center gap-2 text-xs text-subtle"><Loader2 size={13} className="animate-spin"/>加载技能…</div> : <div className="mt-3 space-y-2">
      <button onClick={() => onSelect(undefined)} className={`w-full rounded-apple border p-3 text-left text-xs ${!selected ? "border-brand/35 bg-brand/[.06]" : "hover:bg-ink/[.04]"}`}><span className="font-semibold">动态分析</span><span className="mt-1 block text-[10px] leading-4 text-subtle">根据问题与真实字段即时规划</span></button>
      {items.map((item) => <article key={item.id} className={`rounded-apple border p-3 text-xs ${selected === item.id ? "border-brand/35 bg-brand/[.06]" : "bg-surface"}`}>
        <button onClick={() => onSelect(item)} className="w-full text-left"><span className="flex items-center gap-2 font-semibold">{item.name}{selected === item.id && <Check size={12} className="ml-auto text-brand"/>}</span><span className="mt-1 block text-[10px] leading-4 text-subtle">{item.intent || `${item.discipline || "通用"}模板`} · v{item.version}</span></button>
        <div className="mt-2 flex gap-1 border-t pt-2"><button disabled={busy === item.id || !onApply} onClick={() => void applyItem(item)} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[10px] text-brand hover:bg-brand/10 disabled:opacity-50">{busy === item.id ? <Loader2 size={10} className="animate-spin"/> : <Play size={10}/>}应用到数据</button><button onClick={() => void exportItem(item)} className="flex min-h-8 items-center gap-1 rounded-full px-2 text-[10px] text-muted hover:bg-ink/[.05]"><Download size={10}/>导出</button></div>
      </article>)}
    </div>}
    {error && <div role="alert" className="mt-3 text-xs leading-5 text-status-err">{error}</div>}

    <Sheet open={hubOpen} onOpenChange={setHubOpen} title="SkillHub · 可复用分析">
      {hubLoading ? <div className="grid min-h-64 place-items-center text-sm text-muted"><Loader2 className="animate-spin"/></div> : hub.length === 0 ? <div className="empty-panel"><Store/><h3>目录暂时不可用</h3><p>请检查后端连接后重试。</p></div> : <div className="space-y-5">
        <p className="text-sm leading-6 text-muted">这里展示的是可执行、带字段契约和产物协议的真实技能包。导入后仍会在沙箱重跑并登记完整血缘。</p>
        <div className="space-y-2">{hub.map((item) => <button key={item.id} onClick={() => setFocusedHub(item.id)} className={`flex w-full items-center gap-3 rounded-apple border p-3 text-left ${focused?.id === item.id ? "border-brand/35 bg-brand/[.06]" : "bg-surface"}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-appleSm bg-brand/10 text-brand"><FileCode2 size={16}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.name}</strong><span className="mt-0.5 block truncate text-xs text-muted">{item.intent}</span></span>{installed(item) ? <span className="text-xs font-semibold text-status-ok">已导入</span> : <ChevronRight size={15} className="text-subtle"/>}</button>)}</div>
        {focused && <section className="rounded-appleLg border bg-surface p-5">
          <div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><span className="eyebrow text-brand">{focused.discipline} · v{focused.version}</span><h3 className="mt-1 text-xl font-semibold">{focused.name}</h3><p className="mt-2 text-sm leading-6 text-muted">{focused.intent}</p></div><span className="text-xs text-subtle">{focused.author}</span></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><HubDetail title="字段契约" items={focused.input_roles.length ? focused.input_roles.map((role) => `${role.description} · ${role.dtype || "任意"}`) : ["无需指定字段，由技能自动检查全表"]}/><HubDetail title="可信输出" items={focused.outputs}/><HubDetail title="执行工具" items={focused.tools}/><HubDetail title="运行流程" items={focused.workflow}/></div>
          <div className="mt-5 flex items-center gap-3 border-t pt-4"><span className="mr-auto text-xs text-muted">动态生成约需 {focused.estimated_from_scratch_tokens.toLocaleString()} token</span><button disabled={installed(focused) || busy === focused.id} onClick={() => void importHub(focused)} className={installed(focused) ? "btn-secondary" : "btn-primary"}>{busy === focused.id ? <Loader2 size={14} className="animate-spin"/> : installed(focused) ? <Check size={14}/> : <Download size={14}/>} {installed(focused) ? "已导入" : "导入到项目"}</button></div>
        </section>}
      </div>}
    </Sheet>
  </div>;
}

function HubDetail({ title, items }: { title: string; items: string[] }) {
  return <div><div className="label">{title}</div><ul className="mt-2 space-y-1.5">{items.map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-muted"><Check size={12} className="mt-1 shrink-0 text-status-ok"/>{item}</li>)}</ul></div>;
}
