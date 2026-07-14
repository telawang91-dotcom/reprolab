"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, BookmarkPlus, ExternalLink, PenLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TimelineArtifact } from "@/lib/agentTimeline";
import { activeProjectId, api } from "@/lib/api";
import { agentSpring } from "@/lib/motion";
import { addArtifactToWriting } from "@/lib/writingStorage";
import { ArtifactValue, artifactKindLabel } from "./ArtifactValue";
import { ProvenanceStrip } from "./ProvenanceStrip";

export function ArtifactPanel({ artifact, total, onLineage, onSave }: { artifact?: TimelineArtifact; total: number; onLineage: (id: string) => void; onSave: (artifact: TimelineArtifact) => void }) {
  const [trust, setTrust] = useState<"checking" | "complete" | "incomplete">("checking");
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!artifact) return;
    let live = true;
    setTrust("checking");
    api.lineage(artifact.artifact_id).then((result) => {
      const types = new Set(result.nodes.map((node) => node.type));
      if (live) setTrust(types.has("dataset") && types.has("run") && types.has("artifact") ? "complete" : "incomplete");
    }).catch(() => { if (live) setTrust("incomplete"); });
    return () => { live = false; };
  }, [artifact]);
  if (!artifact) return <div className="grid min-h-64 place-items-center rounded-appleLg border border-dashed p-6 text-center"><div><BarChart3 className="mx-auto text-subtle" /><strong className="mt-4 block">产物等待区</strong><p className="mt-2 text-xs leading-5 text-muted">分析生成的图、表和数字会进入这里，并立即核对可信链。</p></div></div>;
  return (
    <motion.div layoutId={`artifact-${artifact.artifact_id}`} transition={reduceMotion ? { duration: 0 } : agentSpring} className="space-y-4">
      <div className="flex items-center gap-2"><BarChart3 size={16} className="text-brand" /><strong className="text-sm">{artifact.title || artifactKindLabel(artifact.kind)}</strong><span className="ml-auto text-xs text-muted">{total} 项</span></div>
      <div className="overflow-hidden rounded-apple border bg-surface">
        {artifact.figure_url ? <img src={api.artifactContentUrl(artifact.artifact_id)} alt={artifact.title || "当前分析图形"} className="max-h-72 w-full object-contain p-3" /> : <ArtifactValue artifact={artifact} />}
        <div className="border-t px-3 py-2 font-mono text-xs text-brand">{artifact.anchor}</div>
        <details className="border-t px-3 py-2 text-xs text-muted"><summary className="cursor-pointer">查看原始数据</summary><pre className="mt-2 max-h-48 overflow-auto rounded-apple bg-ink/[.035] p-3 font-mono text-[11px]">{JSON.stringify(artifact.value_json, null, 2)}</pre></details>
      </div>
      <ProvenanceStrip state={trust} />
      <Link href="/results?tab=writing" onClick={() => addArtifactToWriting(activeProjectId(), artifact)} className="btn-primary w-full"><PenLine size={14} />写入研究结论</Link>
      <div className="grid grid-cols-2 gap-2"><Link href={`/lineage/${artifact.artifact_id}`} className="btn-secondary px-3"><ExternalLink size={14} />完整溯源</Link><button onClick={() => void onSave(artifact)} className="btn-secondary px-3"><BookmarkPlus size={14} />存为技能</button></div>
      <button onClick={() => void onLineage(artifact.artifact_id)} className="w-full text-center text-xs text-muted hover:text-brand">快速检查可信链</button>
    </motion.div>
  );
}
