"use client";

import { Check, ChevronDown, FolderKanban, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearActiveProjectId, DEMO_PROJECT_ID, selectedProjectId, setActiveProjectId, type ProjectItem } from "@/lib/api";

export function ProjectSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [active, setActive] = useState<ProjectItem>();
  const [error, setError] = useState("");
  useEffect(() => {
    api.projects(true).then((items) => {
      setProjects(items);
      const stored = selectedProjectId();
      const chosen = items.find((item) => item.id === stored);
      if (chosen) setActive(chosen);
      else if (stored) clearActiveProjectId();
    }).catch(() => setError("项目列表暂不可用，请检查数据库状态。"));
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const select = (item: ProjectItem) => {
    setOpen(false);
    if (item.id === active?.id) return;
    setActiveProjectId(item.id);
    window.location.reload();
  };
  const stateLabel = (item: ProjectItem) => item.archived_at ? "已归档" : item.id === active?.id ? "当前项目" : "可切换";
  return <div className="relative min-w-0">
    <button onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`切换研究项目：${active?.name || "未选择"}`} className="flex h-11 max-w-[38vw] items-center gap-2 rounded-full border border-line/[.10] bg-surface/70 px-3 text-xs text-ink hover:bg-elevated sm:h-9 sm:max-w-56">
      <FolderKanban size={14} className="shrink-0 text-brand" />
      <span className="truncate">{active?.name || "选择研究项目"}</span>
      {active?.id === DEMO_PROJECT_ID && <span className="rounded-full bg-status-warn/12 px-2 py-0.5 text-[10px] text-status-warn">演示</span>}
      <ChevronDown size={13} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <>
      <button aria-label="关闭项目切换器" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      <div role="menu" aria-label="研究项目" className="popover absolute left-0 top-12 z-50 w-80 max-w-[calc(100vw-24px)] rounded-appleLg border p-2 sm:top-11">
        <div className="px-3 py-2 text-xs font-semibold text-muted">研究项目</div>
        <div className="max-h-72 overflow-y-auto">
          {projects.length ? projects.map((item) => <button key={item.id} role="menuitem" aria-label={`${item.name}，${item.description || "无项目说明"}，${stateLabel(item)}`} onClick={() => select(item)} className="flex min-h-14 w-full items-center gap-3 rounded-apple px-3 py-2 text-left hover:bg-ink/[.05]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${item.archived_at ? "bg-subtle" : item.id === active?.id ? "bg-brand" : "bg-status-ok"}`} />
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold">{item.name}</strong><span className="mt-0.5 block truncate text-[11px] text-muted">{item.description || stateLabel(item)}</span></span>
            {item.id === active?.id && <span className="inline-flex items-center gap-1 text-[11px] text-brand"><Check size={13} />当前</span>}
          </button>) : <p className="px-3 py-4 text-xs leading-5 text-muted">{error || "还没有研究项目。"}</p>}
        </div>
        <button role="menuitem" onClick={() => { setOpen(false); router.push("/projects?create=1"); }} className="mt-1 flex min-h-11 w-full items-center gap-2 border-t px-3 py-2 text-sm text-brand hover:bg-ink/[.05]"><Plus size={15} />新建或管理项目</button>
      </div>
    </>}
  </div>;
}
