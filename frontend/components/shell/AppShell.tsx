"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Brain, Command, FlaskConical, Moon, Network, Search, Settings, Sun, Workflow } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { href: "/knowledge", label: "知识库", icon: BookOpen },
  { href: "/analysis", label: "分析对话", icon: FlaskConical },
  { href: "/lineage", label: "溯源图谱", icon: Network, disabled: true },
  { href: "/writing", label: "写作面板", icon: Workflow },
  { href: "/memory", label: "科研记忆", icon: Brain }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const [dark, setDark] = useState(false); const [command, setCommand] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommand(true); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);
  const toggleTheme = () => { document.documentElement.classList.toggle("dark"); setDark((value) => !value); };
  return <div className="min-h-screen bg-canvas dark:bg-[#0B0F17]">
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center border-b bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex w-[204px] items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white"><FlaskConical size={16}/></span>ReproLab</div>
      <button className="btn-secondary h-8 text-xs">ReproLab Demo <span className="text-slate-400">⌄</span></button>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setCommand(true)} className="hidden h-8 items-center gap-2 rounded-lg border px-3 text-xs text-slate-500 md:flex"><Search size={14}/>全局搜索 <kbd>⌘K</kbd></button>
        <button onClick={toggleTheme} aria-label="切换主题" className="btn-secondary h-8 w-8 px-0">{dark ? <Sun size={15}/> : <Moon size={15}/>}</button>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">RL</div>
      </div>
    </header>
    <aside className="fixed bottom-0 left-0 top-12 z-30 hidden w-[220px] flex-col border-r bg-white p-3 dark:border-slate-800 dark:bg-slate-950 md:flex">
      <nav className="space-y-1">{links.map(({ href, label, icon: Icon, disabled }) => disabled ?
        <div key={href} className="flex h-9 items-center gap-3 rounded-lg px-3 text-slate-400"><Icon size={16}/>{label}<span className="ml-auto text-[10px]">P1</span></div> :
        <Link key={href} href={href} className={`relative flex h-9 items-center gap-3 rounded-lg px-3 transition ${pathname === href ? "bg-blue-50 font-medium text-brand dark:bg-blue-950/40" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}>
          {pathname === href && <span className="absolute -left-3 h-5 w-0.5 rounded bg-brand"/>}<Icon size={16}/>{label}
        </Link>)}</nav>
      <div className="mt-auto space-y-2 border-t pt-3"><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-slate-500"><Settings size={16}/>设置</button><div className="rounded-lg border bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-900"><div className="text-slate-400">当前模型</div><div className="mt-1 flex items-center gap-2 font-medium"><span className="h-2 w-2 rounded-full bg-emerald-500"/>DeepSeek</div></div></div>
    </aside>
    <main className="min-h-screen pt-12 md:pl-[220px]">{children}</main>
    {command && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 pt-[15vh]" onMouseDown={() => setCommand(false)}><div className="card w-[520px] overflow-hidden" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b p-4"><Command size={18}/><input autoFocus className="w-full bg-transparent outline-none" placeholder="搜索文档、会话或命令…"/><kbd className="text-xs text-slate-400">ESC</kbd></div><div className="p-3 text-sm text-slate-500">输入关键词开始搜索。跨空间命令将在 P1 开放。</div></div></div>}
  </div>;
}
