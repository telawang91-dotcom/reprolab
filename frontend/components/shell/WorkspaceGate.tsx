"use client";

import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, setActiveProjectId, type RuntimeStatus } from "@/lib/api";
import { useProjectScope } from "@/components/workspace/ProjectScope";

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const project = useProjectScope();
  const [runtime, setRuntime] = useState<RuntimeStatus | null>();
  const [preparingDemo, setPreparingDemo] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.runtimeStatus().then(setRuntime).catch(() => setRuntime(null)); }, []);
  const notice = runtime === null ? { state: "offline", message: "无法连接后端；请启动服务后在设置中重新检查。" } : runtime?.state === "degraded" ? runtime.components.find((item) => item.state !== "ready") : undefined;
  const requiresProject = pathname === "/" || ["/knowledge", "/analysis", "/results", "/lineage", "/report", "/writing", "/timeline", "/review", "/memory"].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const openDemo = async () => {
    setPreparingDemo(true); setError("");
    try { const prepared = await api.prepareDemo(); setActiveProjectId(prepared.id); window.location.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "隔离演示准备失败"); setPreparingDemo(false); }
  };
  return <>{notice && <Link href="/settings#system-status" className={`flex min-h-9 items-center gap-2 border-b px-5 text-xs ${notice.state === "offline" ? "bg-status-err/10 text-status-err" : "bg-status-warn/10 text-status-warn"}`}><span className="h-2 w-2 rounded-full bg-current" /><span>{notice.message}</span><span className="ml-auto font-semibold">查看解决方式 →</span></Link>}{project.loading && requiresProject ? <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center"><div className="h-2 w-28 animate-pulse rounded-full bg-ink/10" /></div> : !project.active && requiresProject ? <section className="grid min-h-[calc(100vh-3.5rem)] place-items-center p-5"><div className="max-w-xl rounded-appleXl border bg-surface p-8 text-center sm:p-12"><span className="mx-auto grid h-12 w-12 place-items-center rounded-apple bg-brand/10 text-brand"><FolderKanban size={22} /></span><p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-brand">干净的研究工作区</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">从你的真实项目开始</h1><p className="mt-3 text-sm leading-6 text-muted">ReproLab 不会自动填充资料，也不会把测试数据当作你的研究内容。</p>{(error || project.error) && <div className="mt-5 rounded-apple bg-status-err/10 px-4 py-3 text-sm text-status-err">{error || project.error}</div>}<div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/projects" className="btn-primary"><Plus size={15} />创建或选择项目</Link><button onClick={() => void openDemo()} disabled={preparingDemo} className="btn-secondary">{preparingDemo ? "准备隔离演示中…" : "体验隔离演示"}</button></div><p className="mt-4 text-xs text-subtle">演示数据会明确标识，并与真实项目完全隔离。</p></div></section> : children}</>;
}
