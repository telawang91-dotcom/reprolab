"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Blocks,
  Check,
  ChevronRight,
  Download,
  FileCode2,
  Loader2,
  Play,
  Search,
  Sparkles,
  Store,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Sheet } from "@/components/ui/Sheet";
import { api, SkillHubItem, SkillItem } from "@/lib/api";

type Props = {
  selected?: string;
  onSelect: (skill?: SkillItem) => void;
  onApply?: (skill: SkillItem) => Promise<void>;
  refreshKey?: number;
};

const originLabels: Record<SkillItem["origin"], string> = {
  builtin: "内置",
  local: "项目沉淀",
  imported: "外部导入",
  hub: "SkillHub",
};

function searchableSkill(item: SkillItem) {
  return [item.name, item.intent, item.discipline, originLabels[item.origin]]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function searchableHubItem(item: SkillHubItem) {
  return [
    item.name,
    item.intent,
    item.author,
    ...item.tools,
    ...item.outputs,
    ...item.workflow,
    ...item.input_roles.map((role) => role.description),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function SkillPanel({ selected, onSelect, onApply, refreshKey = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [hubQuery, setHubQuery] = useState("");
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
    setLoading(true);
    setError("");
    try {
      setItems(await api.skills());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "能力工具加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? items.filter((item) => searchableSkill(item).includes(normalized)) : items;
  }, [items, query]);

  const visibleHub = useMemo(() => {
    const normalized = hubQuery.trim().toLocaleLowerCase();
    return normalized ? hub.filter((item) => searchableHubItem(item).includes(normalized)) : hub;
  }, [hub, hubQuery]);

  const focused = visibleHub.find((item) => item.id === focusedHub) || visibleHub[0];
  const installed = (item: SkillHubItem) => items.some((skill) => skill.package_hash === item.package_hash);

  async function exportItem(item: SkillItem) {
    setBusy(item.id);
    setError("");
    try {
      const payload = await api.exportSkill(item.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${item.name}.reproskill.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "技能导出失败");
    } finally {
      setBusy("");
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setBusy("import");
    setError("");
    try {
      const created = await api.importSkill(JSON.parse(await file.text()));
      await reload();
      onSelect(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "技能导入失败");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openHub() {
    setHubOpen(true);
    setError("");
    if (hub.length) return;
    setHubLoading(true);
    try {
      const catalog = await api.skillHub();
      setHub(catalog);
      setFocusedHub(catalog[0]?.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "SkillHub 加载失败");
    } finally {
      setHubLoading(false);
    }
  }

  async function importHub(item: SkillHubItem) {
    setBusy(item.id);
    setError("");
    try {
      const created = await api.importHubSkill(item.id);
      await reload();
      onSelect(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "SkillHub 导入失败");
    } finally {
      setBusy("");
    }
  }

  async function applyItem(item: SkillItem) {
    if (!onApply) return;
    setBusy(item.id);
    setError("");
    try {
      await onApply(item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "技能复用失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt-7 border-t pt-5" aria-labelledby="agent-capabilities-title">
      <div className="flex items-center gap-2">
        <Blocks size={15} className="text-brand" />
        <h2 id="agent-capabilities-title" className="text-sm font-semibold">Agent 能力</h2>
        <span className="ml-auto rounded-full bg-ink/[.05] px-2 py-1 text-[10px] text-muted">按需增强</span>
      </div>
      <p className="mt-1 text-[11px] leading-[1.55] text-subtle">默认由 Agent 根据问题动态规划；技能只是可选工具，不限制学科与分析类型。</p>

      <button
        type="button"
        onClick={() => onSelect(undefined)}
        aria-pressed={!selected}
        className={`mt-3 flex w-full items-center gap-3 rounded-apple border px-3 py-3 text-left transition-colors ${!selected ? "border-brand/30 bg-brand/[.06]" : "border-line/70 bg-surface hover:bg-ink/[.03]"}`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Sparkles size={16} /></span>
        <span className="min-w-0 flex-1">
          <strong className="block text-xs font-semibold">智能规划</strong>
          <span className="mt-0.5 block text-[10px] leading-4 text-muted">理解问题后动态选择方法与工具</span>
        </span>
        {!selected && <Check size={14} className="shrink-0 text-brand" aria-label="当前使用" />}
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void openHub()} className="btn-secondary h-9 px-2 text-xs"><Store size={13} />SkillHub</button>
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary h-9 px-2 text-xs"><Upload size={13} />{busy === "import" ? "导入中…" : "导入"}</button>
        <input ref={inputRef} type="file" accept=".json,.reproskill.json" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <span className="text-xs font-semibold">可复用技能</span>
        <span className="text-[10px] text-subtle">{items.length}</span>
      </div>
      <label className="relative mt-2 block">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="input h-9 w-full pl-9 pr-3 text-xs" placeholder="搜索能力或用途" aria-label="搜索能力或用途" />
      </label>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-subtle"><Loader2 size={13} className="animate-spin" />加载能力…</div>
      ) : visibleItems.length === 0 ? (
        <div className="mt-3 rounded-apple border border-dashed px-3 py-4 text-center text-[11px] leading-5 text-muted">{items.length ? "没有匹配的技能" : "还没有可复用技能，可从 SkillHub 导入或将成功分析沉淀为技能。"}</div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-apple border bg-surface">
          {visibleItems.map((item, index) => {
            const active = selected === item.id;
            return (
              <article key={item.id} className={index ? "border-t" : undefined}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${active ? "bg-brand/[.06]" : "hover:bg-ink/[.03]"}`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-appleSm ${active ? "bg-brand/10 text-brand" : "bg-ink/[.05] text-muted"}`}><FileCode2 size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <strong className="line-clamp-2 text-xs font-semibold leading-4">{item.name}</strong>
                    <span className="mt-1 block text-[10px] text-subtle">{originLabels[item.origin]} · v{item.version}</span>
                  </span>
                  {active ? <Check size={14} className="shrink-0 text-brand" /> : <ChevronRight size={13} className="shrink-0 text-subtle" />}
                </button>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.div
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                      className="overflow-hidden bg-brand/[.035]"
                    >
                      <div className="border-t px-3 py-3">
                        <p className="text-[11px] leading-5 text-muted">{item.intent || "复用已验证的分析流程，并在当前数据上重新执行。"}</p>
                        <div className="mt-3 flex gap-2">
                          <button type="button" disabled={busy === item.id || !onApply} onClick={() => void applyItem(item)} className="btn-primary h-8 flex-1 px-3 text-[11px]">{busy === item.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}立即复用</button>
                          <button type="button" disabled={busy === item.id} onClick={() => void exportItem(item)} className="btn-secondary h-8 px-3 text-[11px]" aria-label={`导出${item.name}`}><Download size={12} />导出</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </article>
            );
          })}
        </div>
      )}
      {error && <div role="alert" className="mt-3 text-xs leading-5 text-status-err">{error}</div>}

      <Sheet open={hubOpen} onOpenChange={setHubOpen} title="SkillHub · 能力目录" side="bottom">
        <div className="mx-auto max-w-5xl">
          {hubLoading ? (
            <div className="grid min-h-64 place-items-center text-sm text-muted"><Loader2 className="animate-spin" /></div>
          ) : hub.length === 0 ? (
            <div className="empty-panel"><Store /><h3>能力目录暂时不可用</h3><p>请检查后端连接后重试。</p></div>
          ) : (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-muted">按研究任务查找可执行能力。所有技能都会在当前数据上重新核对字段、沙箱运行并登记完整血缘。</p>
                </div>
                <label className="relative block w-full sm:w-72">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <input value={hubQuery} onChange={(event) => setHubQuery(event.target.value)} className="input h-10 w-full pl-9 pr-3 text-sm" placeholder="搜索任务、输出或工具" aria-label="搜索 SkillHub" />
                </label>
              </div>

              {visibleHub.length === 0 ? (
                <div className="mt-6 rounded-appleLg border border-dashed p-8 text-center text-sm text-muted">没有匹配的能力，Agent 仍可直接动态完成你的请求。</div>
              ) : (
                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(240px,.8fr)_minmax(0,1.4fr)]">
                  <div className="overflow-hidden rounded-appleLg border bg-surface">
                    {visibleHub.map((item, index) => (
                      <button key={item.id} type="button" onClick={() => setFocusedHub(item.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${index ? "border-t" : ""} ${focused?.id === item.id ? "bg-brand/[.06]" : "hover:bg-ink/[.03]"}`}>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-appleSm bg-brand/10 text-brand"><FileCode2 size={16} /></span>
                        <span className="min-w-0 flex-1"><strong className="line-clamp-2 text-sm leading-5">{item.name}</strong><span className={`mt-0.5 block text-xs ${item.recommended ? "text-brand" : "text-muted"}`}>{item.recommended ? "适合当前数据" : `${item.outputs.length} 类可信输出 · v${item.version}`}</span></span>
                        {installed(item) ? <Check size={14} className="shrink-0 text-status-ok" aria-label="已导入" /> : <ChevronRight size={15} className="shrink-0 text-subtle" />}
                      </button>
                    ))}
                  </div>

                  {focused && (
                    <section className="rounded-appleLg border bg-surface p-5 sm:p-6">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1"><span className="eyebrow text-brand">{focused.recommended ? "当前项目推荐" : "可选研究能力"} · v{focused.version}</span><h3 className="mt-1 text-xl font-semibold tracking-tight">{focused.name}</h3><p className="mt-2 text-sm leading-6 text-muted">{focused.intent}</p>{focused.recommendation_reason && <p className="mt-3 rounded-appleSm bg-brand/[.06] px-3 py-2 text-xs leading-5 text-brand">{focused.recommendation_reason}</p>}</div>
                        <span className="text-xs text-subtle">{focused.author}</span>
                      </div>
                      <div className="mt-6 grid gap-5 sm:grid-cols-2"><HubDetail title="适用输入" items={focused.input_roles.length ? focused.input_roles.map((role) => `${role.description} · ${role.dtype || "任意类型"}`) : ["自动检查当前数据结构，无需预先指定字段"]} /><HubDetail title="可信输出" items={focused.outputs} /><HubDetail title="调用工具" items={focused.tools} /><HubDetail title="执行流程" items={focused.workflow} /></div>
                      <div className="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center"><span className="mr-auto text-xs leading-5 text-muted">预计减少约 {focused.estimated_from_scratch_tokens.toLocaleString()} token 的重复规划</span><button type="button" disabled={installed(focused) || busy === focused.id} onClick={() => void importHub(focused)} className={installed(focused) ? "btn-secondary" : "btn-primary"}>{busy === focused.id ? <Loader2 size={14} className="animate-spin" /> : installed(focused) ? <Check size={14} /> : <Download size={14} />}{installed(focused) ? "已导入" : "导入到项目"}</button></div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Sheet>
    </section>
  );
}

function HubDetail({ title, items }: { title: string; items: string[] }) {
  return <div><div className="label">{title}</div><ul className="mt-2 space-y-1.5">{items.map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-muted"><Check size={12} className="mt-1 shrink-0 text-status-ok" />{item}</li>)}</ul></div>;
}
