"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Brain, ChevronDown, CircleHelp, Clock3, Command, FlaskConical, LayoutDashboard, Menu, Moon, Network, Plus, Search, Settings, ShieldCheck, Sun, UserRound, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { activeProjectId, api, setActiveProjectId, type ProjectItem, type RuntimeStatus } from "@/lib/api";
import { defaultProfile, profileInitials, readProfile, type LocalProfile } from "@/lib/profile";

const links = [
  { href: "/", label: "开始", detail: "任务入口与研究进度", icon: LayoutDashboard },
  { href: "/knowledge", label: "资料", detail: "上传、检索与阅读", icon: BookOpen },
  { href: "/analysis", label: "分析", detail: "描述问题并运行分析", icon: FlaskConical },
  { href: "/lineage", label: "记录", detail: "查看运行与结果", icon: Network },
  { href: "/writing", label: "写作", detail: "整理报告与结论", icon: Workflow },
  { href: "/timeline", label: "时间线", detail: "回看项目进展", icon: Clock3 },
  { href: "/review", label: "审阅", detail: "查看项目摘要", icon: ShieldCheck },
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
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [profile, setProfile] = useState<LocalProfile>(defaultProfile);
  const [modelLabel, setModelLabel] = useState("读取中…");
  const [runtime, setRuntime] = useState<RuntimeStatus | null>();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectItem>();
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
    api.runtimeStatus().then(setRuntime).catch(() => setRuntime(null));
    api.projects().then((items) => {
      setProjects(items);
      const chosen = items.find((item) => item.id === activeProjectId()) || items[0];
      if (chosen) { setActiveProject(chosen); setActiveProjectId(chosen.id); }
    }).catch(() => undefined);
    window.addEventListener("reprolab-model-updated", updateModel);
    return () => { window.removeEventListener("reprolab-profile-updated", updateProfile); window.removeEventListener("reprolab-model-updated", updateModel); };
  }, []);
  useEffect(() => { setMobileMenu(false); setAccountOpen(false); setProjectMenuOpen(false); }, [pathname]);

  const toggleTheme = () => { document.documentElement.classList.toggle("dark"); setDark((value) => !value); };
  const open = (href: string) => { setCommand(false); setQuery(""); router.push(href); };
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  const selectProject = (item: ProjectItem) => { if (item.id === activeProject?.id) { setProjectMenuOpen(false); return; } setActiveProjectId(item.id); window.location.reload(); };
  const createProject = async () => { const name = window.prompt("研究项目名称"); if (!name?.trim()) return; const item = await api.createProject(name.trim()); setActiveProjectId(item.id); window.location.reload(); };

  const navigation = <nav><div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">工作</div><div className="space-y-1">{links.slice(0, 5).map(({ href, label, icon: Icon }) =>
    <Link key={href} href={href} className={`relative flex h-9 items-center gap-3 rounded-lg px-3 transition ${isActive(href) ? "bg-blue-50 font-medium text-brand dark:bg-blue-950/40" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}>
      {isActive(href) && <span className="absolute -left-3 h-5 w-0.5 rounded bg-brand"/>}<Icon size={16}/>{label}
    </Link>)}</div><div className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">项目</div><Link href="/timeline" className={`relative flex h-9 items-center gap-3 rounded-lg px-3 transition ${isActive("/timeline") ? "bg-indigo-50 font-medium text-brand dark:bg-indigo-950/40" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}><Clock3 size={16}/>时间线</Link><Link href="/review" className={`relative mt-1 flex h-9 items-center gap-3 rounded-lg px-3 transition ${isActive("/review") ? "bg-indigo-50 font-medium text-brand dark:bg-indigo-950/40" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}><ShieldCheck size={16}/>审阅</Link><Link href="/memory" className={`relative mt-1 flex h-9 items-center gap-3 rounded-lg px-3 transition ${isActive("/memory") ? "bg-indigo-50 font-medium text-brand dark:bg-indigo-950/40" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}><Brain size={16}/>记忆</Link><Link href="/guide" className={`relative mt-1 flex h-9 items-center gap-3 rounded-lg px-3 transition ${isActive("/guide") ? "bg-indigo-50 font-medium text-brand dark:bg-indigo-950/40" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}><CircleHelp size={16}/>使用指南</Link></nav>;

  if (pathname.startsWith("/demo")) return <div className="min-h-screen bg-canvas dark:bg-[#0B0F17]">{children}</div>;

  const runtimeNotice = runtime === null
    ? { title: "本机服务", state: "offline" as const, message: "无法连接后端；请启动服务后在设置中重新检查。" }
    : runtime?.state === "degraded" ? runtime.components.find((item) => item.state !== "ready") : null;

  return <div className="min-h-screen bg-canvas dark:bg-[#0B0F17]">
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center border-b border-white/[.14] bg-gradient-to-r from-[#0f172a] via-[#1f2b59] to-[#334155] px-3 text-white shadow-[0_8px_28px_rgba(30,41,59,.18)] md:px-4">
      <button onClick={() => setMobileMenu(true)} aria-label="打开导航菜单" className="mr-2 grid h-8 w-8 place-items-center rounded-full text-white/80 transition hover:bg-white/10 md:hidden"><Menu size={16}/></button>
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-[-.02em] md:w-[204px]"><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-black"><FlaskConical size={15}/></span><span className="hidden sm:inline">ReproLab</span></Link>
      <div className="relative ml-2 hidden sm:block"><button onClick={() => setProjectMenuOpen((value) => !value)} aria-expanded={projectMenuOpen} className="flex h-8 max-w-52 items-center gap-2 rounded-full border border-white/[.16] bg-white/[.08] px-3 text-xs text-white/90 transition hover:bg-white/[.14]"><span className="truncate">{activeProject?.name || "默认项目"}</span><ChevronDown size={13} className={projectMenuOpen ? "rotate-180 transition" : "transition"}/></button>{projectMenuOpen && <><button aria-label="关闭项目菜单" onClick={() => setProjectMenuOpen(false)} className="fixed inset-0 z-40 cursor-default"/><div role="menu" className="absolute left-0 top-10 z-50 w-72 overflow-hidden rounded-[18px] border border-black/[.08] bg-white p-2 text-[#1d1d1f]"><div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#7a7a7a]">研究项目</div><div className="max-h-56 overflow-y-auto">{projects.length ? projects.map((item) => <button key={item.id} role="menuitem" onClick={() => selectProject(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[#f5f5f7] ${item.id === activeProject?.id ? "bg-[#f5f5f7] text-brand" : ""}`}><span className={`h-2 w-2 rounded-full ${item.id === activeProject?.id ? "bg-brand" : "bg-[#d2d2d7]"}`}/><span className="min-w-0 flex-1 truncate">{item.name}</span></button>) : <div className="px-3 py-4 text-xs leading-5 text-[#7a7a7a]">项目列表暂不可用；可先检查后端与数据库状态。</div>}</div><button onClick={() => void createProject()} className="mt-1 flex w-full items-center gap-2 rounded-xl border-t px-3 py-2.5 text-sm text-brand hover:bg-[#f5f5f7]"><Plus size={15}/>新建研究项目</button><Link role="menuitem" href="/projects" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[#1d1d1f] hover:bg-[#f5f5f7]">管理项目与归档</Link></div></>}</div>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setCommand(true)} className="hidden h-8 items-center gap-2 rounded-full px-3 text-xs text-white/70 transition hover:bg-white/10 md:flex"><Search size={14}/>搜索 <kbd className="text-white/40">⌘K</kbd></button>
        <button onClick={() => setCommand(true)} aria-label="搜索功能" className="grid h-8 w-8 place-items-center rounded-full text-white/80 transition hover:bg-white/10 md:hidden"><Search size={15}/></button>
        <button onClick={toggleTheme} aria-label="切换主题" className="grid h-8 w-8 place-items-center rounded-full text-white/80 transition hover:bg-white/10">{dark ? <Sun size={15}/> : <Moon size={15}/>}</button>
        <button onClick={() => setAccountOpen((value) => !value)} aria-label="打开账户菜单" aria-expanded={accountOpen} className="flex h-8 items-center gap-1 rounded-full bg-white pl-2.5 pr-1.5 text-xs font-semibold text-black transition hover:bg-white/90"><span>{profileInitials(profile.name)}</span><ChevronDown size={12} className={`transition ${accountOpen ? "rotate-180" : ""}`}/></button>
      </div>
      {accountOpen && <><button aria-label="关闭账户菜单" onClick={() => setAccountOpen(false)} className="fixed inset-0 top-12 z-40 cursor-default"/><div role="menu" className="absolute right-3 top-11 z-50 w-64 overflow-hidden rounded-xl border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"><div className="border-b p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{profileInitials(profile.name)}</span><div className="min-w-0"><div className="truncate text-sm font-semibold">{profile.name}</div><div className="truncate text-xs text-slate-400">{profile.role} · 本地工作区</div></div></div></div><div className="p-2"><Link role="menuitem" href="/profile" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><UserRound size={15}/>个人资料</Link><Link role="menuitem" href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><Settings size={15}/>模型与设置</Link><Link role="menuitem" href="/guide" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><CircleHelp size={15}/>使用帮助</Link></div></div></>}
    </header>

    <aside className="fixed bottom-0 left-0 top-12 z-30 hidden w-[220px] flex-col border-r border-white/70 bg-white/70 p-3 backdrop-blur-xl dark:border-white/[.12] dark:bg-slate-950/70 md:flex">
      {navigation}
      <div className="mt-auto space-y-2 border-t pt-3"><Link href="/settings" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-slate-500 transition hover:bg-slate-50 dark:hover:bg-slate-900"><Settings size={16}/>设置</Link><Link href="/settings#system-status" className="block rounded-lg border bg-slate-50 p-2 text-xs transition hover:border-blue-200 dark:border-slate-800 dark:bg-slate-900"><div className="text-slate-400">当前模型</div><div className="mt-1 flex items-center gap-2 font-medium"><span className={`h-2 w-2 rounded-full ${modelLabel === "未连接" ? "bg-red-500" : "bg-emerald-500"}`}/><span className="truncate">{modelLabel}</span></div></Link></div>
    </aside>

    {mobileMenu && <div className="fixed inset-0 z-50 bg-slate-950/35 md:hidden" onMouseDown={() => setMobileMenu(false)}><aside className="h-full w-[280px] bg-white p-4 shadow-2xl dark:bg-slate-950" onMouseDown={(event) => event.stopPropagation()}><div className="mb-5 flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><FlaskConical size={17}/></span>ReproLab<button onClick={() => setMobileMenu(false)} aria-label="关闭导航菜单" className="btn-secondary ml-auto h-8 w-8 px-0"><X size={15}/></button></div>{navigation}<Link href="/settings" className="mt-4 flex h-9 items-center gap-3 border-t px-3 pt-4 text-slate-500"><Settings size={16}/>设置</Link></aside></div>}

    <main className="min-h-screen pt-12 md:pl-[220px]">
      {runtimeNotice && <Link href="/settings#system-status" className={`flex items-center gap-2 border-b px-5 py-2 text-xs md:px-8 ${runtimeNotice.state === "offline" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><span className={`h-2 w-2 rounded-full ${runtimeNotice.state === "offline" ? "bg-red-500" : "bg-amber-500"}`}/><span className="font-medium">{runtimeNotice.title}需要处理：</span><span>{runtimeNotice.message}</span><span className="ml-auto font-medium text-brand">查看解决方式 →</span></Link>}
      {children}
    </main>
    {command && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh]" onMouseDown={() => setCommand(false)}><div role="dialog" aria-label="搜索页面与功能" className="card w-full max-w-[560px] overflow-hidden" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b p-4"><Command size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && matches.length === 1) open(matches[0].href); }} className="w-full bg-transparent outline-none" placeholder="搜索页面与功能，例如：上传、校验、记忆…"/><kbd className="text-xs text-slate-400">ESC</kbd></div><div className="max-h-[52vh] overflow-y-auto p-2">{matches.length ? matches.map(({ href, label, detail, icon: Icon }) => <button key={href} onClick={() => open(href)} className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition hover:bg-blue-50 dark:hover:bg-blue-950/30"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon size={16}/></span><span><strong className="block text-sm">{label}</strong><span className="text-xs text-slate-500">{detail}</span></span></button>) : <div className="p-8 text-center text-sm text-slate-500">没有匹配的功能，试试“分析”或“校验”。</div>}</div></div></div>}
  </div>;
}
