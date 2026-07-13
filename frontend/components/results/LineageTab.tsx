import { ArrowRight, Database, FlaskConical, Network, PackageCheck } from "lucide-react";
import Link from "next/link";

export function LineageTab() {
  const nodes = [{ label: "数据", detail: "内容哈希与版本", icon: Database }, { label: "运行", detail: "代码、输入与环境哈希", icon: FlaskConical }, { label: "产物", detail: "图、表、数字与结论", icon: PackageCheck }];
  return <section className="rounded-appleXl border bg-surface p-7 shadow-soft sm:p-10"><span className="grid h-12 w-12 place-items-center rounded-apple bg-brand/10 text-brand"><Network size={22} /></span><h2 className="mt-5 text-2xl font-semibold tracking-tight">每个结果都有独立可信链</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">总览只解释链路结构；从任意产物卡片进入详情，查看真实的 Dataset → Run → Artifact 节点并执行复现。</p><div className="mt-8 grid gap-3 sm:grid-cols-3">{nodes.map(({ label, detail, icon: Icon }, index) => <div key={label} className="relative rounded-appleLg border p-5"><Icon size={18} className="text-brand" /><strong className="mt-4 block">{label}</strong><span className="mt-1 block text-sm text-muted">{detail}</span>{index < nodes.length - 1 && <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden text-subtle sm:block" size={18} />}</div>)}</div><Link href="/analysis" className="btn-primary mt-8">进入分析并生成可信产物<ArrowRight size={14} /></Link></section>;
}
