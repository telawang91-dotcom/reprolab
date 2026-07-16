"use client";

import { AlertCircle, Check, CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { RoleChip } from "./RoleChip";

export function ConclusionCard({ text, status, onAnchor }: { text: string; status: "complete" | "partial"; onAnchor: (anchor: string) => void }) {
  const [copied, setCopied] = useState(false);
  const partial = status === "partial";
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <section className={`rounded-appleLg border bg-surface p-5 shadow-soft ${partial ? "border-status-warn/30" : ""}`}>
      <div className="mb-4 flex items-center gap-2">
        {partial ? <AlertCircle size={18} className="text-status-warn" /> : <CheckCircle2 size={18} className="text-status-ok" />}
        <strong>{partial ? "部分完成的分析报告" : "分析报告"}</strong>
        <button onClick={() => void copy()} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted hover:bg-ink/[.05] hover:text-ink" aria-label="复制分析报告">
          {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "已复制" : "复制"}
        </button>
        <RoleChip role="review" />
      </div>
      <div className="text-[15px] leading-7"><AnchoredMarkdown text={text} onAnchor={onAnchor} /></div>
    </section>
  );
}
