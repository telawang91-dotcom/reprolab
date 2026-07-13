"use client";

import { FlaskConical, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "./AccountMenu";
import { ActivityCenter } from "./ActivityCenter";
import { CommandPalette } from "./CommandPalette";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { Sidebar } from "./Sidebar";
import { Sheet } from "@/components/ui/Sheet";

export function Topbar() {
  const [command, setCommand] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommand(true); }
      if (event.key === "Escape") { setCommand(false); setMobile(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <>
      <header className="material fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b px-3 md:px-5">
        <button onClick={() => setMobile(true)} aria-label="打开导航" className="mr-1 grid h-11 w-11 place-items-center rounded-full hover:bg-ink/[.06] md:hidden"><Menu size={18} /></button>
        <Link href="/" aria-label="ReproLab 工作台" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-surface dark:bg-surface dark:text-ink"><FlaskConical size={16} /></span><span className="hidden sm:inline">ReproLab</span></Link>
        <div className="ml-3 min-w-0"><ProjectSwitcher /></div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setCommand(true)} aria-label="搜索页面与功能" className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm text-muted hover:bg-ink/[.06] hover:text-ink md:h-10"><Search size={17} /><span className="hidden lg:inline">搜索</span><kbd className="hidden text-xs text-subtle lg:inline">⌘K</kbd></button>
          <ActivityCenter />
          <AccountMenu />
        </div>
      </header>
      <CommandPalette open={command} onOpenChange={setCommand} />
      <Sheet open={mobile} onOpenChange={setMobile} title="ReproLab" side="bottom"><Sidebar mobile onNavigate={() => setMobile(false)} /></Sheet>
    </>
  );
}
