"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, BookmarkPlus, Check, ExternalLink, Loader2, PenLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { TimelineArtifact } from "@/lib/agentTimeline";
import { activeProjectId, api } from "@/lib/api";
import { agentSpring } from "@/lib/motion";
import { addArtifactToWriting } from "@/lib/writingStorage";
import { ArtifactValue, artifactKindLabel } from "./ArtifactValue";
import { ProvenanceStrip } from "./ProvenanceStrip";

type SaveSkill = (artifact: TimelineArtifact, name: string, intent: string, discipline: string) => Promise<void>;

export function ArtifactPanel({ artifact, total, onLineage, onSave }: { artifact?: TimelineArtifact; total: number; onLineage: (id: string) => void; onSave: SaveSkill }) {
  const [trust, setTrust] = useState<"checking" | "complete" | "incomplete">("checking");
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [discipline, setDiscipline] = useState("general");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [libraryState, setLibraryState] = useState<"checking" | "saved" | "candidate">("checking");
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!artifact) return;
    let live = true;
    setTrust("checking");
    setLibraryState("checking");
    setLibraryError("");
    api.lineage(artifact.artifact_id).then((result) => {
      const types = new Set(result.nodes.map((node) => node.type));
      if (live) setTrust(types.has("dataset") && types.has("run") && types.has("artifact") ? "complete" : "incomplete");
    }).catch(() => { if (live) setTrust("incomplete"); });
    api.artifactLibraryState(artifact.artifact_id).then((library) => {
      if (live) setLibraryState(library.saved ? "saved" : "candidate");
    }).catch(() => { if (live) setLibraryState("candidate"); });
    return () => { live = false; };
  }, [artifact]);

  async function saveToLibrary() {
    if (!artifact || librarySaving || libraryState === "saved") return;
    setLibrarySaving(true);
    setLibraryError("");
    try {
      await api.setArtifactLibraryState(artifact.artifact_id, true);
      setLibraryState("saved");
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : "保存到成果库失败");
    } finally {
      setLibrarySaving(false);
    }
  }

  function openHarvest() {
    if (!artifact) return;
    setName(artifact.title?.trim() || `${artifactKindLabel(artifact.kind)}技能`);
    setIntent(artifact.title ? `在新数据上复用“${artifact.title}”的分析流程` : "在新数据上复用本次已验证的分析流程");
    setDiscipline("general");
    setSaveError("");
    setHarvestOpen(true);
  }

  async function save() {
    if (!artifact || !name.trim() || !intent.trim() || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(artifact, name.trim(), intent.trim(), discipline);
      setHarvestOpen(false);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "技能沉淀失败");
    } finally {
      setSaving(false);
    }
  }

  if (!artifact) return <div className="grid min-h-64 place-items-center rounded-appleLg border border-dashed p-6 text-center"><div><BarChart3 className="mx-auto text-subtle"/><strong className="mt-4 block">暂无选中产物</strong><p className="mt-2 text-xs leading-5 text-muted">从回答的技术详情中打开图、表或数字，再决定是否保存。</p></div></div>;

  return <>
    <motion.div layoutId={`artifact-${artifact.artifact_id}`} transition={reduceMotion ? { duration: 0 } : agentSpring} className="space-y-4">
      <div className="flex items-center gap-2"><BarChart3 size={16} className="text-brand"/><strong className="min-w-0 flex-1 truncate text-sm">{artifact.title || artifactKindLabel(artifact.kind)}</strong><span className="text-xs text-muted">{total} 项</span></div>
      <div className="overflow-hidden rounded-apple border bg-surface">
        {artifact.figure_url ? <img src={api.artifactContentUrl(artifact.artifact_id)} alt={artifact.title || "当前分析产物"} className="max-h-72 w-full object-contain p-3"/> : <ArtifactValue artifact={artifact} />}
        <div className="border-t px-3 py-2 font-mono text-xs text-brand">{artifact.anchor}</div>
        <details className="border-t px-3 py-2 text-xs text-muted"><summary className="cursor-pointer">查看原始数据</summary><pre className="mt-2 max-h-48 overflow-auto rounded-apple bg-ink/[.035] p-3 font-mono text-[11px]">{JSON.stringify(artifact.value_json, null, 2)}</pre></details>
      </div>
      <ProvenanceStrip state={trust}/>
      <div className="grid grid-cols-2 gap-2"><button disabled={libraryState === "checking" || librarySaving || libraryState === "saved"} onClick={() => void saveToLibrary()} className={libraryState === "saved" ? "btn-secondary px-3" : "btn-primary px-3"}>{librarySaving ? <Loader2 size={14} className="animate-spin"/> : libraryState === "saved" ? <Check size={14}/> : <BookmarkPlus size={14}/>} {librarySaving ? "保存中…" : libraryState === "saved" ? "已保存" : "保存成果"}</button><Link href="/results?tab=writing" onClick={() => addArtifactToWriting(activeProjectId(), artifact)} className="btn-secondary px-3"><PenLine size={14}/>用于写作</Link></div>
      {libraryError && <div role="alert" className="text-xs leading-5 text-status-err">{libraryError}</div>}
      <div className="grid grid-cols-2 gap-2"><Link href={`/lineage/${artifact.artifact_id}`} className="btn-secondary px-3"><ExternalLink size={14}/>完整溯源</Link><button onClick={openHarvest} className="btn-secondary px-3"><BookmarkPlus size={14}/>保存工作流</button></div>
      <button onClick={() => void onLineage(artifact.artifact_id)} className="w-full text-center text-xs text-muted hover:text-brand">快速检查可信链</button>
    </motion.div>

    <Sheet open={harvestOpen} onOpenChange={setHarvestOpen} title="保存为可复用工作流" side="bottom">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-start gap-3 rounded-apple bg-status-ok/[.08] p-4 text-sm text-status-ok"><ShieldCheck size={17} className="mt-0.5 shrink-0"/><span><strong>只有确认后才会保存。</strong> 系统会从本次运行提取可复用步骤；应用到新数据时仍会重新执行并登记来源。</span></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="label">技能名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} className="input mt-2 w-full"/></label><label className="block"><span className="label">领域</span><select value={discipline} onChange={(event) => setDiscipline(event.target.value)} className="input mt-2 w-full"><option value="general">通用</option><option value="materials">材料</option><option value="biology">生物</option><option value="chemistry">化学</option><option value="medicine">医学</option></select></label></div>
        <label className="block"><span className="label">适用意图</span><textarea value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={500} rows={4} className="input mt-2 h-auto w-full resize-y rounded-apple py-3" placeholder="说明这个流程解决什么问题，以及何时适用。"/></label>
        <div className="rounded-apple border bg-surface p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Check size={14} className="text-status-ok"/>来源产物</div><div className="mt-2 flex flex-wrap gap-2 text-xs text-muted"><span>{artifact.title || artifact.kind}</span><span className="font-mono text-brand">{artifact.anchor}</span><span>· 完整血缘由后端再次校验</span></div></div>
        {saveError && <div role="alert" className="status-error">{saveError}</div>}
        <div className="flex justify-end gap-2"><button onClick={() => setHarvestOpen(false)} className="btn-secondary">取消</button><button disabled={!name.trim() || !intent.trim() || saving} onClick={() => void save()} className="btn-primary">{saving ? <Loader2 size={14} className="animate-spin"/> : <BookmarkPlus size={14}/>} {saving ? "正在识别字段…" : "保存工作流"}</button></div>
      </div>
    </Sheet>
  </>;
}
