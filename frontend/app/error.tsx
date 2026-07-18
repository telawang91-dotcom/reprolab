"use client";

import { AlertTriangle, Home, RefreshCw, Settings2 } from "lucide-react";
import Link from "next/link";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-[calc(100vh-7rem)] place-items-center p-5">
    <section role="alert" className="w-full max-w-xl rounded-appleXl border bg-surface p-8 text-center sm:p-12">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-apple bg-status-err/10 text-status-err"><AlertTriangle size={22}/></span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-status-err">页面运行异常</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">这一步没有正常完成</h1>
      <p className="mt-3 text-sm leading-6 text-muted">当前页面的操作状态已经停止，不会继续假装加载。你可以安全重试；如果问题持续存在，请先检查本机服务状态。</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button onClick={reset} className="btn-primary"><RefreshCw size={15}/>重试当前页面</button>
        <Link href="/settings#system-status" className="btn-secondary"><Settings2 size={15}/>检查运行状态</Link>
      </div>
      <Link href="/" className="interactive mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand"><Home size={14}/>返回工作台</Link>
    </section>
  </main>;
}
