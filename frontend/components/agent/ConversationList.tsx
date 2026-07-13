"use client";

import { MessageSquareText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type ConversationSummary } from "@/lib/api";

export function ConversationList({ activeId, collectionId, refreshKey = "" }: { activeId?: string; collectionId?: string; refreshKey?: string | number }) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); api.conversations().then(setItems).catch(() => setItems([])).finally(() => setLoading(false)); }, [refreshKey]);
  const newHref = collectionId ? `/analysis?collection=${collectionId}` : "/analysis";
  return <section><div className="flex min-h-9 items-center gap-2"><MessageSquareText size={14} className="text-brand" /><strong className="text-xs">分析会话</strong><Link href={newHref} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-brand hover:bg-brand/10" aria-label="新建分析"><Plus size={14} /></Link></div><div className="mt-1 space-y-1">{loading ? <div className="h-9 animate-pulse rounded-appleSm bg-ink/[.05]" /> : items.slice(0, 8).map((item) => <Link key={item.id} href={`/analysis${collectionId ? `?collection=${collectionId}&` : "?"}conversation=${item.id}`} className={`block rounded-appleSm px-3 py-2 text-xs ${activeId === item.id ? "bg-brand/10 text-brand" : "text-muted hover:bg-ink/[.04] hover:text-ink"}`}><strong className="block truncate font-semibold">{item.title || "未命名分析"}</strong><span className="mt-0.5 block text-[10px] opacity-70">{new Date(item.updated_at).toLocaleString("zh-CN")} · {item.message_count} 条记录</span></Link>)}{!loading && !items.length && <p className="px-2 py-3 text-xs leading-5 text-muted">完成第一次分析后，会话会保存在这里。</p>}</div></section>;
}
