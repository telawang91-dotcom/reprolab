"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, FlaskConical, Play, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DiffPanel } from "@/components/lineage/DiffPanel";
import { LineageGraph } from "@/components/lineage/LineageGraph";
import type { LineageEdge, LineageNode } from "@/components/lineage/types";
import { api, type AttributionResult, type Lineage, type ReproduceResult } from "@/lib/api";

export default function LineagePage({ params }: { params: { artifactId: string } }) {
  const [lineage, setLineage] = useState<Lineage>(); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [reproducing, setReproducing] = useState(false); const [result, setResult] = useState<ReproduceResult>(); const [overrides, setOverrides] = useState("{}");
  const [attributing, setAttributing] = useState(false); const [attribution, setAttribution] = useState<AttributionResult>();
  useEffect(() => { void api.lineage(params.artifactId).then(setLineage).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [params.artifactId]);
  const runId = useMemo(() => lineage?.nodes.find((node) => node.type === "run")?.id, [lineage]);
  async function reproduce() { if (!runId) return; setError(""); setReproducing(true); try { const parsed = JSON.parse(overrides); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("dataset_overrides 必须是 JSON 对象"); setResult(await api.reproduce(runId, parsed)); } catch (e) { setError((e as Error).message); } finally { setReproducing(false); } }
  async function attribute() { if (!runId || !result) return; setError(""); setAttributing(true); try { const parsed = JSON.parse(overrides); const target = result.comparisons.find((item) => !item.within_tol)?.artifact_id; setAttribution(await api.attributeDrift(runId, parsed, target)); } catch (e) { setError((e as Error).message); } finally { setAttributing(false); } }
  return <div className="flex h-[calc(100vh-48px)] flex-col overflow-hidden"><header className="material flex min-h-20 shrink-0 items-center gap-4 border-b px-5"><div><div className="label text-brand">可信来源</div><h1 className="mt-1 font-semibold">这项结果从哪里来</h1><p className="mt-1 hidden text-xs text-muted sm:block">点击任意节点，查看原始数据、分析代码、环境快照和产物指纹。</p></div><div className="ml-4 hidden items-center gap-3 text-[11px] text-muted lg:flex"><Legend tone="bg-brand" label="数据"/><Legend tone="bg-role-execute" label="代码"/><Legend tone="bg-role-review" label="产物"/><Legend tone="bg-status-warn" label="结论"/><Legend tone="bg-muted" label="文献"/></div><div className="ml-auto flex items-center gap-2"><input value={overrides} onChange={(e) => setOverrides(e.target.value)} className="input hidden h-9 w-64 font-mono text-xs xl:block" aria-label="数据集哈希覆盖 JSON" title="旧 storage_hash 到新 storage_hash 的 JSON 映射"/><button onClick={() => void reproduce()} disabled={!runId || reproducing} className={`btn-primary ${reproducing ? "animate-pulse" : ""}`}><Play size={14}/>{reproducing ? "正在干净环境重放…" : "一键复现"}</button></div></header>
    {error && <div className="z-10 flex items-center gap-2 border-b bg-status-err/10 px-5 py-3 text-sm text-status-err"><AlertTriangle size={15}/>{error}</div>}
    {result?.status === "match" && <motion.div initial={{ scale: .8, opacity: 0 }} animate={{ scale: [0.8, 1.1, 1], opacity: 1 }} className="z-10 flex items-center gap-2 border-b bg-status-ok/10 px-5 py-3 text-sm font-semibold text-status-ok"><span className="grid h-6 w-6 place-items-center rounded-full bg-status-ok text-white"><Check size={14}/></span>复现结果完全一致 · {result.comparisons.length} 个产物均在容差内</motion.div>}
    {result?.status === "drift" && <motion.div animate={{ x: [0, -4, 4, -4, 0] }} className="z-10 flex items-center gap-2 border-b bg-status-err/10 px-5 py-3 text-sm font-semibold text-status-err"><XCircle size={18}/>检测到结果漂移 · {result.comparisons.filter((item) => !item.within_tol).length} 项超出容差</motion.div>}
    <div className="relative min-h-0 flex-1 bg-canvas">{loading ? <div className="m-6 h-[calc(100%-48px)] animate-pulse rounded-appleLg bg-ink/[.06]"/> : lineage ? <LineageGraph sourceNodes={lineage.nodes as LineageNode[]} sourceEdges={lineage.edges as LineageEdge[]}/> : <div className="grid h-full place-items-center text-center text-muted"><div><FlaskConical className="mx-auto mb-3"/><p>无法加载溯源图谱</p></div></div>}<AnimatePresence>{result?.status === "drift" && <DiffPanel result={result} attribution={attribution} attributing={attributing} onAttribute={() => void attribute()} onClose={() => { setResult(undefined); setAttribution(undefined); }}/>}</AnimatePresence></div>
  </div>;
}

function Legend({ tone, label }: { tone: string; label: string }) { return <span className="flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${tone}`}/>{label}</span>; }
