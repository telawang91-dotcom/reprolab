import { ArrowRight, FlaskConical, Network } from "lucide-react";
import Link from "next/link";

export default function LineageIndexPage() {
  return <div className="mx-auto max-w-4xl p-5 lg:p-8"><div className="label">Provenance graph</div><h1 className="mt-1 text-2xl font-semibold">溯源图谱</h1><section className="card mt-6 grid min-h-[420px] place-items-center p-8 text-center"><div className="max-w-lg"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-brand"><Network size={24}/></span><h2 className="mt-5 text-xl font-semibold">先选择一个分析产物</h2><p className="mt-3 text-sm leading-7 text-slate-500">每张图和每个数字都有独立的溯源图。完成一次分析后，在产物卡片点击“全屏溯源”，即可查看 Dataset → Run → Artifact 完整可信链并一键复现。</p><Link href="/analysis" className="btn-primary mt-6"><FlaskConical size={15}/>进入分析对话<ArrowRight size={15}/></Link></div></section></div>;
}
