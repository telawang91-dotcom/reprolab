"use client";
import { Check, Clipboard, X } from "lucide-react";
import { useState } from "react";
import type { LineageNode as FlowNode } from "./types";

export function NodeDetailPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  async function copy(key: string, value: unknown) { await navigator.clipboard.writeText(String(value)); setCopied(key); window.setTimeout(() => setCopied(""), 1200); }
  return <aside className="absolute bottom-0 right-0 top-0 z-20 w-[380px] overflow-y-auto border-l bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
    <div className="flex items-start"><div><div className="label">{node.type} node</div><h2 className="mt-1 text-lg font-semibold">{node.label}</h2></div><button onClick={onClose} className="btn-secondary ml-auto h-8 w-8 px-0" aria-label="关闭详情"><X size={15}/></button></div>
    <div className="mt-5 rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><div className="label">Node ID</div><div className="mt-1 break-all font-mono text-xs">{node.id}</div></div>
    {node.type === "run" && node.meta.code ? <div className="mt-5"><div className="label">执行代码</div><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">{String(node.meta.code)}</pre></div> : null}
    <div className="mt-5 space-y-3">{Object.entries(node.meta).filter(([key]) => key !== "code" && key !== "packages").map(([key, value]) => <div key={key} className="rounded-lg border p-3"><div className="flex items-center"><span className="label">{key}</span>{key.includes("hash") && value ? <button onClick={() => void copy(key, value)} className="ml-auto text-slate-400 hover:text-brand" aria-label={`复制 ${key}`}>{copied === key ? <Check size={14} className="text-emerald-600"/> : <Clipboard size={14}/>}</button> : null}</div><div className={`mt-1 break-all text-xs ${key.includes("hash") ? "font-mono" : ""}`}>{value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</div></div>)}</div>
    {Array.isArray(node.meta.packages) && node.meta.packages.length > 0 ? <details className="mt-4 rounded-lg border p-3"><summary className="cursor-pointer text-xs font-medium">环境依赖（{node.meta.packages.length}）</summary><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-slate-500">{node.meta.packages.join("\n")}</pre></details> : null}
  </aside>;
}

