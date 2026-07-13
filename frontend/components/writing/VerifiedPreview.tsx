"use client";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import type { VerifyItem } from "@/lib/api";

type Span = { start: number; end: number; reasons: string[] };

function spans(items: VerifyItem[]): Span[] {
  const raw = items.filter((item) => item.verdict === "fail").flatMap((item) => {
    const match = /chars (\d+):(\d+)/.exec(item.locate);
    const nli = item.label ? `\nNLI: ${item.label} · ${(item.support_score ?? 0).toFixed(2)}${item.evidence_span ? `\n证据：${item.evidence_span}` : ""}` : "";
    return match ? [{ start: Number(match[1]), end: Number(match[2]), reasons: [item.reason + nli] }] : [];
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
  const evidence = items.filter((item) => item.check === "citation" && item.evidence_span);
  return <div><div className="whitespace-pre-wrap leading-7">{parts.map((part, index) => part.failure ? <span key={index} title={part.failure.reasons.join("；")} className="decoration-wavy decoration-status-err decoration-2 underline underline-offset-4"><AnchoredMarkdown text={part.text} onAnchor={onAnchor}/></span> : <AnchoredMarkdown key={index} text={part.text} onAnchor={onAnchor}/>)}</div>{evidence.length > 0 && <div className="mt-5 space-y-2 border-t pt-4">{evidence.map((item, index) => <details key={`${item.target_anchor}-${index}`} className="rounded-appleSm border bg-ink/[.04] p-3 text-xs"><summary className="cursor-pointer font-semibold"><button type="button" onClick={(event) => { event.preventDefault(); if (item.target_anchor) onAnchor(item.target_anchor); }} className="mr-2 font-mono text-brand">{item.target_anchor}</button>{item.label} · {(item.support_score ?? 0).toFixed(2)} · 展开证据段落</summary><p className="mt-3 whitespace-pre-wrap leading-5 text-muted">{item.evidence_span}</p></details>)}</div>}</div>;
}
