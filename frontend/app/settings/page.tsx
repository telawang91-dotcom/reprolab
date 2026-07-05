"use client";

import { CheckCircle2, CircleHelp, Database, KeyRound, Server, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const API_ROOT = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1").replace(/\/api\/v1$/, "");

export default function SettingsPage() {
  const [backend, setBackend] = useState<"checking" | "online" | "offline">("checking");
  const [database, setDatabase] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => { fetch(`${API_ROOT}/health`, { cache: "no-store" }).then(async (response) => { const result = await response.json(); setBackend(response.ok ? "online" : "offline"); setDatabase(result.database === "online" ? "online" : "offline"); }).catch(() => { setBackend("offline"); setDatabase("offline"); }); }, []);
  return <div className="mx-auto max-w-5xl space-y-6 p-5 lg:p-8">
    <header><div className="label">Runtime & configuration</div><h1 className="mt-1 text-2xl font-semibold">设置与运行状态</h1><p className="mt-2 text-sm text-slate-500">这里展示当前 Demo 的关键运行条件；密钥只保存在服务端环境变量中，不会发送到浏览器。</p></header>
    <section className="grid gap-4 md:grid-cols-3">
      <StatusCard icon={Server} title="后端服务" value={backend === "checking" ? "检查中…" : backend === "online" ? "已连接" : "未连接"} ok={backend === "online"}/>
      <StatusCard icon={Database} title="数据与向量库" value={database === "checking" ? "检查中…" : database === "online" ? "PostgreSQL 已连接" : "PostgreSQL 未连接"} ok={database === "online"}/>
      <StatusCard icon={ShieldCheck} title="沙箱与可信链" value="运行时按服务端配置"/>
    </section>
    <section className="card p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><KeyRound size={18}/></span><div><h2 className="font-semibold">模型路由</h2><p className="mt-1 text-sm text-slate-500">Planner / Executor 使用 DeepSeek，Critic 使用更强校验模型；业务层统一经过 ModelAdapter。</p></div><span className="ml-auto hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:block">服务端安全配置</span></div></section>
    <section className="grid gap-4 md:grid-cols-2"><article className="card p-5"><h2 className="font-semibold">遇到页面没有数据？</h2><ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>1. 确认上方后端状态为“已连接”。</li><li>2. 确认 PostgreSQL 已启动并完成 Alembic 迁移。</li><li>3. 先在知识库上传资料，再进入分析对话。</li></ol></article><article className="card p-5"><h2 className="font-semibold">第一次使用</h2><p className="mt-3 text-sm leading-6 text-slate-600">产品指南解释完整闭环、功能边界和可信链规则。</p><Link href="/guide" className="btn-secondary mt-4"><CircleHelp size={15}/>打开产品指南</Link></article></section>
  </div>;
}

function StatusCard({ icon: Icon, title, value, ok }: { icon: typeof Server; title: string; value: string; ok?: boolean }) {
  return <article className="card p-5"><div className="flex items-center gap-2 text-sm font-medium"><Icon size={16} className={ok ? "text-emerald-600" : "text-brand"}/>{title}{ok && <CheckCircle2 size={14} className="ml-auto text-emerald-600"/>}</div><p className="mt-3 text-sm text-slate-500">{value}</p></article>;
}
