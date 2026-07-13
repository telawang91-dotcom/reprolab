"use client";

import { Command, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { commandNavigation } from "./navigation";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? commandNavigation.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(keyword)) : commandNavigation;
  }, [query]);
  const navigate = (href: string) => { onOpenChange(false); setQuery(""); router.push(href); };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="搜索页面与功能" side="bottom">
      <div className="mx-auto max-w-2xl">
        <div className="flex h-12 items-center gap-3 rounded-apple border bg-surface px-4 focus-within:border-brand/50">
          <Search size={17} className="text-subtle" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜索上传、校验、记忆…" />
          <Command size={15} className="text-subtle" />
        </div>
        <div className="mt-3 grid max-h-[48vh] gap-1 overflow-y-auto sm:grid-cols-2">
          {matches.map(({ href, label, detail, icon: Icon }) => (
            <button key={`${href}-${label}`} onClick={() => navigate(href)} className="flex min-h-16 items-center gap-3 rounded-apple p-3 text-left hover:bg-ink/[.05]">
              <span className="grid h-9 w-9 place-items-center rounded-appleSm bg-brand/10 text-brand"><Icon size={16} /></span>
              <span><strong className="block text-sm font-semibold">{label}</strong><span className="text-xs text-muted">{detail}</span></span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
