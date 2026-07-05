"use client";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import type { VerifyItem } from "@/lib/api";

type Span = { start: number; end: number; reasons: string[] };

function spans(items: VerifyItem[]): Span[] {
  const raw = items.filter((item) => item.verdict === "fail").flatMap((item) => {
    const match = /chars (\d+):(\d+)/.exec(item.locate);
    return match ? [{ start: Number(match[1]), end: Number(match[2]), reasons: [item.reason] }] : [];
  }).sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const item of raw) { const previous = merged[merged.length - 1]; if (previous && item.start <= previous.end) { previous.end = Math.max(previous.end, item.end); previous.reasons.push(...item.reasons); } else merged.push({ ...item }); }
  return merged;
}

export function VerifiedPreview({ text, items, onAnchor }: { text: string; items: VerifyItem[]; onAnchor: (anchor: string) => void }) {
  const failures = spans(items); const parts: { text: string; failure?: Span }[] = []; let cursor = 0;
  for (const failure of failures) { if (failure.start > cursor) parts.push({ text: text.slice(cursor, failure.start) }); parts.push({ text: text.slice(failure.start, failure.end), failure }); cursor = failure.end; }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  if (!parts.length) parts.push({ text });
  return <div className="whitespace-pre-wrap leading-7">{parts.map((part, index) => part.failure ? <span key={index} title={part.failure.reasons.join("；")} className="decoration-wavy decoration-red-500 decoration-2 underline underline-offset-4"><AnchoredMarkdown text={part.text} onAnchor={onAnchor}/></span> : <AnchoredMarkdown key={index} text={part.text} onAnchor={onAnchor}/>)}</div>;
}

