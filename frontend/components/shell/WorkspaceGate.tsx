"use client";

import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type RuntimeStatus } from "@/lib/api";
import { useProjectScope } from "@/components/workspace/ProjectScope";

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const project = useProjectScope();
  const [runtime, setRuntime] = useState<RuntimeStatus | null>();
  useEffect(() => { api.runtimeStatus().then(setRuntime).catch(() => setRuntime(null)); }, []);
  const notice = runtime === null ? { state: "offline", message: "无法连接后端；请启动服务后在设置中重新检查。" } : runtime?.state === "degraded" ? runtime.components.find((item) => item.state !== "ready") : undefined;
  const requiresProject = pathname === "/" || ["/knowledge", "/analysis", "/results", "/lineage", "/report", "/writing", "/timeline", "/review", "/memory"].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  return <>{notice && <Link href="/settings#system-status" className={`flex min-h-9 items-center gap-2 border-b px-5 text-xs ${notice.state === "offline" ? "bg-status-err/10 text-status-err" : "bg-status-warn/10 text-status-warn"}`}><span className="h-2 w-2 rounded-full bg-current" /><span>{notice.message}</span><span className="ml-auto font-semibold">查看解决方式 →</span></Link>}{project.loading && requiresProject ? <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center"><div className="h-2 w-28 animate-pulse rounded-full bg-ink/10" /></div> : !project.active && requiresProject ? <section className="grid min-h-[calc(100vh-3.5rem)] place-items-center p-5"><div className="max-w-xl rounded-appleXl border bg-surface p-8 text-center sm:p-12"><span className="mx-auto grid h-12 w-12 place-items-center rounded-apple bg-brand/10 text-brand"><FolderKanban size={22} /></span><p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-brand">干净的研究工作区</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">从你的真实项目开始</h1><p className="mt-3 text-sm leading-6 text-muted">ReproLab 不会自动填充资料，也不会把测试数据当作你的研究内容。</p>{project.error && <div className="mt-5 rounded-apple bg-status-err/10 px-4 py-3 text-sm text-status-err">{project.error}</div>}<div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/projects" className="btn-primary"><Plus size={15} />创建或选择项目</Link><Link href="/guide" className="btn-secondary">查看使用指南</Link></div><p className="mt-4 text-xs text-subtle">每个项目都拥有独立的资料、对话、成果和长期记忆。</p></div></section> : children}</>;
}
