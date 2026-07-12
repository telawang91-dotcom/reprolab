"use client";

import {
  Archive,
  ArrowRight,
  Brain,
  Check,
  Clock3,
  FolderKanban,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  activeProjectId,
  api,
  setActiveProjectId,
  type ProjectItem,
} from "@/lib/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [dialog, setDialog] = useState<{
    type: "rename" | "archive";
    project: ProjectItem;
  }>();
  const [renameValue, setRenameValue] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProjects(await api.projects(true));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setActiveId(activeProjectId());
    void load();
  }, [load]);
  useEffect(() => {
    if (!dialog) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(undefined);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [dialog]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    setError("");
    try {
      const project = await api.createProject(name.trim(), description.trim());
      setActiveProjectId(project.id);
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目创建失败");
    } finally {
      setBusy("");
    }
  }
  async function archive(project: ProjectItem) {
    setBusy(project.id);
    setError("");
    try {
      await api.archiveProject(project.id);
      if (project.id === activeId) {
        const next = projects.find(
          (item) => item.id !== project.id && !item.archived_at,
        );
        if (next) {
          setActiveProjectId(next.id);
          window.location.reload();
        }
      }
      await load();
      setDialog(undefined);
      setToast("项目已归档，历史资料仍可只读查看");
      window.setTimeout(() => setToast(""), 3000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目归档失败");
    } finally {
      setBusy("");
    }
  }
  async function restore(project: ProjectItem) {
    setBusy(project.id);
    setError("");
    try {
      await api.restoreProject(project.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目恢复失败");
    } finally {
      setBusy("");
    }
  }
  async function rename(project: ProjectItem, next = renameValue.trim()) {
    if (!next || next === project.name) return;
    setBusy(project.id);
    setError("");
    try {
      await api.updateProject(project.id, { name: next });
      await load();
      setDialog(undefined);
      setToast("项目名称已更新");
      window.setTimeout(() => setToast(""), 3000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目重命名失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-5 lg:p-8">
      <header>
        <div className="label">研究上下文</div>
        <h1 className="mt-1 text-2xl font-semibold">研究项目</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          项目是资料、数据、分析、结论与科研记忆的隔离边界。归档只读保留历史血缘，不会删除研究记录。
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            href: "/timeline",
            label: "研究时间线",
            detail: "回看资料、分析和结论",
            icon: Clock3,
          },
          {
            href: "/review",
            label: "导师审阅",
            detail: "只读查看项目健康度",
            icon: ShieldCheck,
          },
          {
            href: "/memory",
            label: "科研记忆",
            detail: "管理偏好和复用方法",
            icon: Brain,
          },
        ].map(({ href, label, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-indigo-200 hover:shadow-card dark:border-white/[.10] dark:bg-slate-900"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-brand dark:bg-indigo-950">
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">{label}</strong>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {detail}
              </span>
            </span>
            <ArrowRight
              size={14}
              className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand"
            />
          </Link>
        ))}
      </section>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      <section className="card p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand">
            <Plus size={18} />
          </span>
          <div>
            <h2 className="font-semibold">新建研究项目</h2>
            <p className="mt-1 text-sm text-slate-500">
              从一个课题、论文或实验目标开始。
            </p>
          </div>
        </div>
        <form
          onSubmit={create}
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]"
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input"
            placeholder="例如：企鹅形态差异研究"
            maxLength={120}
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="input"
            placeholder="可选：课题说明"
            maxLength={1000}
          />
          <button
            disabled={!name.trim() || busy === "create"}
            className="btn-primary"
          >
            <Plus size={14} />
            {busy === "create" ? "创建中…" : "创建并进入"}
          </button>
        </form>
      </section>
      <section>
        <div className="mb-3">
          <h2 className="font-semibold">全部项目</h2>
          <p className="mt-1 text-sm text-slate-500">
            切换后，所有页面会重新读取该项目范围内的内容。
          </p>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((project) => {
              const active = project.id === activeId;
              const archived = Boolean(project.archived_at);
              return (
                <article
                  key={project.id}
                  className={`card p-5 ${archived ? "opacity-70" : ""}`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-xl ${archived ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-brand"}`}
                    >
                      <FolderKanban size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">
                          {project.name}
                        </h3>
                        {active && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            当前项目
                          </span>
                        )}
                        {archived && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            已归档
                          </span>
                        )}
                      </div>
                      <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
                        {project.description || "尚未添加项目说明。"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!active && (
                      <button
                        onClick={() => {
                          setActiveProjectId(project.id);
                          window.location.reload();
                        }}
                        className="btn-primary h-8"
                      >
                        <Check size={14} />
                        {archived ? "只读查看" : "切换到此项目"}
                      </button>
                    )}
                    {!archived && (
                      <button
                        onClick={() => {
                          setRenameValue(project.name);
                          setDialog({ type: "rename", project });
                        }}
                        disabled={busy === project.id}
                        className="btn-secondary h-8"
                      >
                        <Pencil size={14} />
                        重命名
                      </button>
                    )}
                    {!archived && (
                      <button
                        onClick={() => setDialog({ type: "archive", project })}
                        disabled={busy === project.id}
                        className="btn-secondary h-8"
                      >
                        <Archive size={14} />
                        归档
                      </button>
                    )}
                    {archived && (
                      <button
                        onClick={() => void restore(project)}
                        disabled={busy === project.id}
                        className="btn-secondary h-8"
                      >
                        <RotateCcw size={14} />
                        恢复项目
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {dialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
          onMouseDown={() => setDialog(undefined)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-dialog-title"
            className="card w-full max-w-md p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="label">研究项目</div>
            <h2
              id="project-dialog-title"
              className="mt-2 text-xl font-semibold"
            >
              {dialog.type === "rename" ? "重命名项目" : "归档项目"}
            </h2>
            {dialog.type === "rename" ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  修改名称不会影响项目中的资料、运行和血缘。
                </p>
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) =>
                    event.key === "Enter" &&
                    renameValue.trim() &&
                    void rename(dialog.project)
                  }
                  className="input mt-5 w-full"
                  maxLength={120}
                />
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                归档“{dialog.project.name}
                ”后将禁止继续写入，但所有历史资料、产物和血缘都会保留，可随时恢复。
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDialog(undefined)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() =>
                  dialog.type === "rename"
                    ? void rename(dialog.project)
                    : void archive(dialog.project)
                }
                disabled={
                  busy === dialog.project.id ||
                  (dialog.type === "rename" && !renameValue.trim())
                }
                className={
                  dialog.type === "archive"
                    ? "btn bg-red-600 text-white hover:bg-red-700"
                    : "btn-primary"
                }
              >
                {busy === dialog.project.id
                  ? "处理中…"
                  : dialog.type === "rename"
                    ? "保存名称"
                    : "确认归档"}
              </button>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
