import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-[calc(100vh-7rem)] place-items-center p-5">
    <section className="w-full max-w-xl rounded-appleXl border bg-surface p-8 text-center sm:p-12">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-apple bg-brand/10 text-brand"><Compass size={22}/></span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-brand">404 · 页面不存在</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">这里没有可继续的研究任务</h1>
      <p className="mt-3 text-sm leading-6 text-muted">链接可能已经变更，或对应内容已被删除。返回工作台后，你的项目、资料和分析记录不会受到影响。</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary"><ArrowLeft size={15}/>返回工作台</Link>
        <Link href="/projects" className="btn-secondary">查看研究项目</Link>
      </div>
    </section>
  </main>;
}
