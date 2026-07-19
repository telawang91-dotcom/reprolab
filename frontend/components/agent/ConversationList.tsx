"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, MessageSquareText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type ConversationSummary } from "@/lib/api";
import { agentSpring } from "@/lib/motion";

type Props = {
  activeId?: string;
  collectionId?: string;
  refreshKey?: string | number;
  onNew: () => void;
  onDeleted?: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function ConversationList({
  activeId,
  collectionId,
  refreshKey = "",
  onNew,
  onDeleted,
  disabled = false,
  compact = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const itemIdsRef = useRef<Set<string>>(new Set());
  const loadedCollectionRef = useRef<string>();
  itemIdsRef.current = new Set(items.map((item) => item.id));

  useEffect(() => {
    if (loadedCollectionRef.current === collectionId && typeof refreshKey === "string" && refreshKey && itemIdsRef.current.has(refreshKey)) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const load = async () => {
      if (!live) return;
      if (attempt === 0) setLoading(true);
      try {
        const value = await api.conversations(collectionId);
        if (!live) return;
        setItems(value);
        loadedCollectionRef.current = collectionId;
        setError("");
        setLoading(false);
      } catch (reason) {
        if (!live) return;
        if (attempt < 2) {
          attempt += 1;
          timer = setTimeout(() => void load(), 600 * 2 ** attempt);
          return;
        }
        setError(reason instanceof Error ? reason.message : "会话加载失败");
        setLoading(false);
      }
    };
    void load();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [collectionId, refreshKey, reloadVersion]);

  const remove = async (item: ConversationSummary) => {
    if (disabled || deleting) return;
    setDeleting(item.id);
    setError("");
    try {
      await api.deleteConversation(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setConfirming(undefined);
      onDeleted?.(item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "会话删除失败");
    } finally {
      setDeleting(undefined);
    }
  };

  return (
    <section aria-label="文件夹会话">
      {!compact && <div className="flex min-h-9 items-center gap-2">
        <MessageSquareText size={14} className="text-brand" />
        <strong className="text-xs">分析会话</strong>
        <button
          type="button"
          onClick={onNew}
          disabled={disabled}
          className="ml-auto grid h-8 w-8 place-items-center rounded-full text-brand transition hover:bg-brand/10 active:scale-95 disabled:opacity-40"
          aria-label="新建分析会话"
          title="新建分析会话"
        >
          <Plus size={16} />
        </button>
      </div>}
      <div className="mt-1 space-y-1">
        {loading && !items.length ? <div className="h-12 animate-pulse rounded-appleSm bg-ink/[.05]" /> : (
          <AnimatePresence initial={false}>
            {items.slice(0, compact ? 12 : 20).map((item) => {
              const isConfirming = confirming === item.id;
              const isDeleting = deleting === item.id;
              return (
                <motion.div
                  layout
                  key={item.id}
                  initial={false}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12, height: 0 }}
                  transition={reduceMotion ? { duration: 0 } : agentSpring}
                  className={`flex items-center overflow-hidden rounded-appleSm transition-colors ${compact ? "min-h-10" : "min-h-12"} ${activeId === item.id ? "bg-ink/[.06] text-ink" : "text-muted hover:bg-ink/[.04] hover:text-ink"}`}
                >
                  {isConfirming ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-status-err">确认删除？</span>
                      <button type="button" onClick={() => setConfirming(undefined)} disabled={isDeleting} className="grid h-7 w-7 place-items-center rounded-full hover:bg-ink/[.06]" aria-label="取消删除"><X size={13} /></button>
                      <button type="button" onClick={() => void remove(item)} disabled={isDeleting} className="inline-flex h-7 items-center gap-1 rounded-full bg-status-err px-2.5 text-[11px] font-semibold text-white disabled:opacity-60">
                        {isDeleting ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}{isDeleting ? "删除中" : "删除"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <Link href={`/analysis${collectionId ? `?collection=${collectionId}&` : "?"}conversation=${item.id}`} className={`min-w-0 flex-1 px-3 text-xs ${compact ? "py-1.5" : "py-2"}`}>
                        <strong className="block truncate font-semibold">{item.title || "未命名分析"}</strong>
                        {!compact && <span className="mt-0.5 block text-[10px] opacity-70">{new Date(item.updated_at).toLocaleString("zh-CN")} · {item.message_count} 条记录</span>}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirming(item.id)}
                        disabled={disabled || !!deleting}
                        className={`mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-subtle transition hover:bg-status-err/10 hover:text-status-err disabled:opacity-40 ${activeId === item.id ? "opacity-100" : "opacity-60"}`}
                        aria-label={`删除会话 ${item.title || "未命名分析"}`}
                        title="删除会话"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        {!loading && !items.length && !error && <p className={`px-2 text-xs leading-5 text-muted ${compact ? "py-2" : "py-3"}`}>{compact ? "暂无对话" : "这里还没有会话。点击右上角 + 开始新的分析。"}</p>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-appleSm bg-status-err/[.07] px-2.5 py-2 text-xs leading-5 text-status-err"><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => setReloadVersion((value) => value + 1)} className="inline-flex shrink-0 items-center gap-1 font-semibold"><RotateCcw size={12} />重试</button></div>}
      </div>
    </section>
  );
}
