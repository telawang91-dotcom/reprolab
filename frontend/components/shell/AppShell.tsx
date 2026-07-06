"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Brain, ChevronDown, CircleHelp, Command, FlaskConical, LayoutDashboard, Menu, Moon, Network, Search, Settings, Sun, UserRound, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FirstRunGuide } from "@/components/guide/FirstRunGuide";
import { api } from "@/lib/api";
import { defaultProfile, profileInitials, readProfile, type LocalProfile } from "@/lib/profile";

const links = [
  { href: "/", label: "工作台", detail: "项目概览与科研建议", icon: LayoutDashboard },
  { href: "/knowledge", label: "知识库", detail: "上传、检索与问答", icon: BookOpen },
  { href: "/analysis", label: "分析对话", detail: "选择数据并提出分析问题", icon: FlaskConical },
  { href: "/lineage", label: "溯源图谱", detail: "查看数据、运行与产物", icon: Network },
  { href: "/writing", label: "写作与校验", detail: "检查来源并保存结论", icon: Workflow },
  { href: "/memory", label: "科研记忆", detail: "管理偏好与方法", icon: Brain },
  { href: "/guide", label: "产品指南", detail: "第一次使用从这里开始", icon: CircleHelp },
  { href: "/settings", label: "设置", detail: "模型、个人资料与运行状态", icon: Settings },
  { href: "/profile", label: "个人资料", detail: "称呼、身份与研究方向", icon: UserRound }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [command, setCommand] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profile, setProfile] = useState<LocalProfile>(defaultProfile);
  const [modelLabel, setModelLabel] = useState("读取中…");
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? links.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(keyword)) : links;
  }, [query]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setCommand(true);
      }
      if (event.key === "Escape") { setCommand(false); setMobileMenu(false); setAccountOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    setProfile(readProfile());
    const updateProfile = (event: Event) => setProfile((event as CustomEvent<LocalProfile>).detail || readProfile());
    window.addEventListener("reprolab-profile-updated", updateProfile);
    const labelProvider = (provider: string) => setModelLabel(provider === "deepseek" ? "DeepSeek" : provider === "hunyuan" ? "腾讯混元" : "自定义模型");
    const updateModel = (event: Event) => labelProvider((event as CustomEvent<string>).detail);
    api.modelConfig().then((item) => labelProvider(item.provider)).catch(() => setModelLabel("未连接"));
    window.addEventListener("reprolab-model-updated", updateModel);
    return () => { window.removeEventListener("reprolab-profile-updated", updateProfile); window.removeEventListener("reprolab-model-updated", updateModel); };
  }, []);
  useEffect(() => { setMobileMenu(false); setAccountOpen(false); }, [pathname]);

  const toggleTheme = () => { document.documentElement.classList.toggle("dark"); setDark((value) => !value); };
  const open = (href: string) => { setCommand(false); setQuery(""); router.push(href); };
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const navigation = <nav className="space-y-1">{links.slice(0, 7).map(({ href, label, icon: Icon }) =>
    <Link key={href} href={href} className={`relative flex h-9 items-center gap-3 rounded-lg px-3 transition ${isActive(href) ? "bg-blue-50 font-medium text-brand dark:bg-blue-950/40" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}>
      {isActive(href) && <span className="absolute -left-3 h-5 w-0.5 rounded bg-brand"/>}<Icon size={16}/>{label}
    </Link>)}</nav>;

  return <div className="min-h-screen bg-canvas dark:bg-[#0B0F17]">
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center border-b bg-white/95 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:px-4">
      <button onClick={() => setMobileMenu(true)} aria-label="打开导航菜单" className="btn-secondary mr-2 h-8 w-8 px-0 md:hidden"><Menu size={16}/></button>
      <Link href="/" className="flex items-center gap-2 font-semibold md:w-[204px]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white"><FlaskConical size={16}/></span><span className="hidden sm:inline">ReproLab</span></Link>
      <div title="当前项目" className="ml-2 hidden h-8 items-center rounded-lg border bg-slate-50 px-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:flex">默认项目</div>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setCommand(true)} className="hidden h-8 items-center gap-2 rounded-lg border px-3 text-xs text-slate-500 md:flex"><Search size={14}/>搜索功能 <kbd>⌘K</kbd></button>
        <button onClick={() => setCommand(true)} aria-label="搜索功能" className="btn-secondary h-8 w-8 px-0 md:hidden"><Search size={15}/></button>
        <button onClick={toggleTheme} aria-label="切换主题" className="btn-secondary h-8 w-8 px-0">{dark ? <Sun size={15}/> : <Moon size={15}/>}</button>
        <button onClick={() => setAccountOpen((value) => !value)} aria-label="打开账户菜单" aria-expanded={accountOpen} className="flex h-8 items-center gap-1 rounded-full bg-slate-900 pl-2.5 pr-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"><span>{profileInitials(profile.name)}</span><ChevronDown size={12} className={`transition ${accountOpen ? "rotate-180" : ""}`}/></button>
      </div>
      {accountOpen && <><button aria-label="关闭账户菜单" onClick={() => setAccountOpen(false)} className="fixed inset-0 top-12 z-40 cursor-default"/><div role="menu" className="absolute right-3 top-11 z-50 w-64 overflow-hidden rounded-xl border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"><div className="border-b p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{profileInitials(profile.name)}</span><div className="min-w-0"><div className="truncate text-sm font-semibold">{profile.name}</div><div className="truncate text-xs text-slate-400">{profile.role} · 本地工作区</div></div></div></div><div className="p-2"><Link role="menuitem" href="/profile" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><UserRound size={15}/>个人资料</Link><Link role="menuitem" href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><Settings size={15}/>模型与设置</Link><Link role="menuitem" href="/guide" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><CircleHelp size={15}/>使用帮助</Link></div></div></>}
    </header>

    <aside className="fixed bottom-0 left-0 top-12 z-30 hidden w-[220px] flex-col border-r bg-white p-3 dark:border-slate-800 dark:bg-slate-950 md:flex">
      {navigation}
      <div className="mt-auto space-y-2 border-t pt-3"><Link href="/settings" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-slate-500 transition hover:bg-slate-50 dark:hover:bg-slate-900"><Settings size={16}/>设置</Link><Link href="/settings" className="block rounded-lg border bg-slate-50 p-2 text-xs transition hover:border-blue-200 dark:border-slate-800 dark:bg-slate-900"><div className="text-slate-400">当前模型</div><div className="mt-1 flex items-center gap-2 font-medium"><span className={`h-2 w-2 rounded-full ${modelLabel === "未连接" ? "bg-red-500" : "bg-emerald-500"}`}/><span className="truncate">{modelLabel}</span></div></Link></div>
    </aside>

    {mobileMenu && <div className="fixed inset-0 z-50 bg-slate-950/35 md:hidden" onMouseDown={() => setMobileMenu(false)}><aside className="h-full w-[280px] bg-white p-4 shadow-2xl dark:bg-slate-950" onMouseDown={(event) => event.stopPropagation()}><div className="mb-5 flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><FlaskConical size={17}/></span>ReproLab<button onClick={() => setMobileMenu(false)} aria-label="关闭导航菜单" className="btn-secondary ml-auto h-8 w-8 px-0"><X size={15}/></button></div>{navigation}<Link href="/settings" className="mt-4 flex h-9 items-center gap-3 border-t px-3 pt-4 text-slate-500"><Settings size={16}/>设置</Link></aside></div>}

    <main className="min-h-screen pt-12 md:pl-[220px]">{children}</main>
    {command && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh]" onMouseDown={() => setCommand(false)}><div role="dialog" aria-label="搜索页面与功能" className="card w-full max-w-[560px] overflow-hidden" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b p-4"><Command size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && matches.length === 1) open(matches[0].href); }} className="w-full bg-transparent outline-none" placeholder="搜索页面与功能，例如：上传、校验、记忆…"/><kbd className="text-xs text-slate-400">ESC</kbd></div><div className="max-h-[52vh] overflow-y-auto p-2">{matches.length ? matches.map(({ href, label, detail, icon: Icon }) => <button key={href} onClick={() => open(href)} className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition hover:bg-blue-50 dark:hover:bg-blue-950/30"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon size={16}/></span><span><strong className="block text-sm">{label}</strong><span className="text-xs text-slate-500">{detail}</span></span></button>) : <div className="p-8 text-center text-sm text-slate-500">没有匹配的功能，试试“分析”或“校验”。</div>}</div></div></div>}
    <FirstRunGuide/>
  </div>;
}
