"use client";

import { BookOpen, Brain, ChevronDown, CircleHelp, Moon, Settings, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { defaultProfile, profileInitials, readProfile, type LocalProfile } from "@/lib/profile";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [profile, setProfile] = useState<LocalProfile>(defaultProfile);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setProfile(readProfile());
    const update = (event: Event) => setProfile((event as CustomEvent<LocalProfile>).detail || readProfile());
    window.addEventListener("reprolab-profile-updated", update);
    return () => window.removeEventListener("reprolab-profile-updated", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const setTheme = (next: boolean) => {
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("reprolab-theme", next ? "dark" : "light");
    setDark(next);
  };
  const links = [
    { href: "/profile", label: "个人资料", icon: UserRound },
    { href: "/knowledge", label: "资料与导入", icon: BookOpen },
    { href: "/memory", label: "科研记忆", icon: Brain },
    { href: "/guide", label: "使用指南", icon: CircleHelp },
    { href: "/settings", label: "模型与设置", icon: Settings },
  ];
  return <div className="relative">
    <button onClick={() => setOpen((value) => !value)} aria-label="账户菜单" aria-expanded={open} className="flex h-11 items-center gap-1 rounded-full bg-ink px-3 text-xs font-semibold text-surface dark:bg-surface dark:text-ink md:h-10">
      {profileInitials(profile.name)}<ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <>
      <button className="fixed inset-0 z-40" aria-label="关闭账户菜单" onClick={() => setOpen(false)} />
      <div role="menu" aria-label="账户与设置" className="popover absolute right-0 top-12 z-50 w-64 rounded-appleLg border p-2">
        <div className="border-b px-3 py-3"><strong className="block truncate text-sm">{profile.name}</strong><span className="text-xs text-muted">{profile.role} · 本地工作区</span></div>
        <div className="py-2">{links.map(({ href, label, icon: Icon }) => <Link role="menuitem" key={href} href={href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-apple px-3 text-sm hover:bg-ink/[.05]"><Icon size={16} />{label}</Link>)}</div>
        <div className="flex min-h-14 items-center gap-3 border-t px-3 py-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-ink/[.06]">{dark ? <Moon size={15} /> : <Sun size={15} />}</span><span className="flex-1 text-sm">深色模式</span><Switch checked={dark} onCheckedChange={setTheme} label="深色模式" /></div>
      </div>
    </>}
  </div>;
}
