"use client";

import { ArrowRight, Database, FileQuestion, FolderInput, FolderOpen } from "lucide-react";
import Link from "next/link";

import { useWorkspaceScope } from "@/components/workspace/WorkspaceScope";

export default function Home() {
  const scope = useWorkspaceScope();

  if (scope.loading) return <DashboardSkeleton />;

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      {scope.error && <div role="alert" className="mb-6 flex items-center rounded-apple border border-status-err/20 bg-status-err/[.07] px-4 py-3 text-sm text-status-err"><span>{scope.error}</span><button onClick={() => void scope.refresh()} className="ml-auto min-h-11 font-semibold">重试</button></div>}

      {scope.activeCollection ? (
        <div className="mx-auto max-w-3xl">
          <header className="border-b pb-8">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-apple bg-brand/10 text-brand"><FolderOpen size={21} /></span>
              <div className="min-w-0"><div className="eyebrow text-status-ok">当前研究文件夹</div><h1 className="mt-1 truncate text-4xl font-semibold tracking-[-.045em]">{scope.activeCollection.name}</h1><p className="mt-3 text-[15px] leading-7 text-muted">{scope.activeCollection.description || `${scope.activeCollection.document_count} 份资料已限定在这个文件夹中。`}</p></div>
            </div>
          </header>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-muted">继续处理</h2>
            <div className="mt-3 space-y-2">
              <WorkspaceAction href="/knowledge" icon={<FileQuestion size={19} />} title="询问这个文件夹" detail="检索、总结和回答只引用当前文件夹中的资料。" action="进入问答" />
              <WorkspaceAction href="/analysis" icon={<Database size={19} />} title="分析这个文件夹的数据" detail="只加载当前文件夹中的 CSV、XLSX 等数据文件。" action="开始分析" />
            </div>
          </section>

          <footer className="mt-8 flex flex-wrap items-center gap-3 border-t pt-5 text-sm text-muted"><span>{scope.activeCollection.document_count} 份资料</span><span aria-hidden>·</span><span className="text-status-ok">范围已锁定</span><Link href="/knowledge" className="ml-auto text-link">管理当前文件夹<ArrowRight size={13} /></Link></footer>
        </div>
      ) : (
        <section className="grid min-h-[calc(100vh-10rem)] place-items-center text-center">
          {scope.unfiledCount > 0 ? <div className="max-w-lg"><span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-status-warn/10 text-status-warn"><FolderInput size={24} /></span><p className="mt-6 text-xs font-semibold uppercase tracking-[.12em] text-status-warn">还有一步即可开始</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">让现有资料成为可分析的研究范围。</h1><p className="mt-4 text-[15px] leading-7 text-muted">检测到 {scope.unfiledCount} 份尚未归档的真实资料。将它们放入研究文件夹后，问答、Agent 分析和成果都会自动限定在同一范围。</p><button onClick={() => scope.openManager({ selectUnfiled: true })} className="btn-primary mt-7"><FolderInput size={15} />整理这 {scope.unfiledCount} 份资料</button><Link href="/knowledge" className="mt-5 block text-sm text-muted hover:text-brand">继续导入新文件 →</Link></div> : <div className="max-w-lg"><span className="mx-auto grid h-14 w-14 place-items-center rounded-apple bg-brand/10 text-brand"><FolderOpen size={24} /></span><h1 className="mt-6 text-3xl font-semibold tracking-[-.04em]">从一个研究文件夹开始。</h1><p className="mt-4 text-[15px] leading-7 text-muted">导入文件夹后，左栏会持续保留当前范围。工作台、资料问答和数据分析不再各自重复选择。</p><Link href="/knowledge" className="btn-primary mt-7"><FolderOpen size={15} />导入文件夹</Link></div>}
        </section>
      )}
    </main>
  );
}

function WorkspaceAction({ href, icon, title, detail, action }: { href: string; icon: React.ReactNode; title: string; detail: string; action: string }) {
  return <Link href={href} className="apple-interactive group flex min-h-24 items-center gap-4 rounded-appleLg border bg-surface px-5 py-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-appleSm bg-brand/[.08] text-brand transition group-hover:bg-brand/[.12]">{icon}</span><span className="min-w-0 flex-1"><strong className="block text-[17px] font-semibold tracking-[-.02em]">{title}</strong><span className="mt-1 block text-[14px] leading-6 text-muted">{detail}</span></span><span className="hidden items-center gap-1 text-sm text-brand sm:inline-flex">{action}<ArrowRight size={14} className="transition group-hover:translate-x-1" /></span></Link>;
}

function DashboardSkeleton() {
  return <main className="mx-auto max-w-5xl px-8 py-12" aria-label="正在加载工作台"><div className="mx-auto max-w-3xl"><div className="h-40 animate-pulse rounded-appleLg bg-ink/[.05]" /><div className="mt-8 h-56 animate-pulse rounded-appleLg bg-ink/[.05]" /></div></main>;
}
