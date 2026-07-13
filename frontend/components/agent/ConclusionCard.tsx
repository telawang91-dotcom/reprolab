import { CheckCircle2 } from "lucide-react";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { RoleChip } from "./RoleChip";

export function ConclusionCard({ text, onAnchor }: { text: string; onAnchor: (anchor: string) => void }) {
  return (
    <section className="rounded-appleLg border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2"><CheckCircle2 size={18} className="text-status-ok" /><strong>分析结论</strong><span className="ml-auto"><RoleChip role="review" /></span></div>
      <div className="text-[15px] leading-7"><AnchoredMarkdown text={text} onAnchor={onAnchor} /></div>
    </section>
  );
}
