"use client";

import { LoaderCircle, MessageSquareText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type ConversationSummary } from "@/lib/api";

type Props = {
  activeId?: string;
  collectionId?: string;
  refreshKey?: string | number;
  onNew: () => void;
  onDeleted?: (id: string) => void;
  disabled?: boolean;
};

export function ConversationList({
  activeId,
  collectionId,
  refreshKey = "",
  onNew,
  onDeleted,
  disabled = false,
}: Props) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string>();
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api.conversations(collectionId)
      .then((value) => { if (live) setItems(value); })
      .catch((reason) => { if (live) { setItems([]); setError(reason instanceof Error ? reason.message : "会话加载失败"); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [collectionId, refreshKey]);

  const remove = async (item: ConversationSummary) => {
    if (disabled || deleting) return;
    const confirmed = window.confirm(`删除会话“${item.title || "未命名分析"}”？\n\n已生成的可信运行和产物仍会保留。`);
    if (!confirmed) return;
    setDeleting(item.id);
    setError("");
    try {
      await api.deleteConversation(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      onDeleted?.(item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "会话删除失败");
    } finally {
      setDeleting(undefined);
    }
  };

  return (
    <section>
      <div className="flex min-h-9 items-center gap-2">
        <MessageSquareText size={14} className="text-brand" />
        <strong className="text-xs">分析会话</strong>
        <button
          type="button"
          onClick={onNew}
          disabled={disabled}
          className="ml-auto grid h-8 w-8 place-items-center rounded-full text-brand hover:bg-brand/10 disabled:opacity-40"
          aria-label="新建分析会话"
          title="新建分析会话"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="mt-1 space-y-1">
        {loading ? <div className="h-9 animate-pulse rounded-appleSm bg-ink/[.05]" /> : items.slice(0, 20).map((item) => (
          <div key={item.id} className={`group flex items-center rounded-appleSm ${activeId === item.id ? "bg-brand/10 text-brand" : "text-muted hover:bg-ink/[.04] hover:text-ink"}`}>
            <Link
              href={`/analysis${collectionId ? `?collection=${collectionId}&` : "?"}conversation=${item.id}`}
              className="min-w-0 flex-1 px-3 py-2 text-xs"
            >
              <strong className="block truncate font-semibold">{item.title || "未命名分析"}</strong>
              <span className="mt-0.5 block text-[10px] opacity-70">{new Date(item.updated_at).toLocaleString("zh-CN")} · {item.message_count} 条记录</span>
            </Link>
            <button
              type="button"
              onClick={() => void remove(item)}
              disabled={disabled || !!deleting}
              className={`mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-subtle hover:bg-status-err/10 hover:text-status-err focus:opacity-100 disabled:opacity-40 ${activeId === item.id ? "opacity-100" : "opacity-60"}`}
              aria-label={`删除会话 ${item.title || "未命名分析"}`}
              title="删除会话"
            >
              {deleting === item.id ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        ))}
        {!loading && !items.length && !error && <p className="px-2 py-3 text-xs leading-5 text-muted">这里还没有会话。点击右上角 + 开始新的分析。</p>}
        {error && <p role="alert" className="px-2 py-2 text-xs leading-5 text-status-err">{error}</p>}
      </div>
    </section>
  );
}
