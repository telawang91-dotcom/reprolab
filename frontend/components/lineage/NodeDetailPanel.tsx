"use client";
import { Check, Clipboard, X } from "lucide-react";
import { useState } from "react";
import type { LineageNode as FlowNode } from "./types";

const typeLabels: Record<string, string> = { dataset: "数据节点", run: "代码与运行节点", artifact: "分析产物节点", claim: "可信结论节点", document: "来源文档节点" };
const metaLabels: Record<string, string> = { storage_hash: "数据内容指纹", code_hash: "运行信任指纹", input_hash: "输入组合指纹", content_hash: "产物内容指纹", env_hash: "环境指纹", python_version: "Python 版本", seed: "随机种子", status: "运行状态", schema_json: "数据结构" };

export function NodeDetailPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  async function copy(key: string, value: unknown) { await navigator.clipboard.writeText(String(value)); setCopied(key); window.setTimeout(() => setCopied(""), 1200); }
  return <aside className="material absolute bottom-0 right-0 top-0 z-20 w-[380px] overflow-y-auto border-l p-5">
    <div className="flex items-start"><div><div className="label">{typeLabels[node.type] ?? node.type}</div><h2 className="mt-1 text-lg font-semibold">{node.label}</h2></div><button onClick={onClose} className="btn-secondary ml-auto h-8 w-8 px-0" aria-label="关闭详情"><X size={15}/></button></div>
    <div className="mt-5 rounded-appleSm bg-ink/[.04] p-3"><div className="label">账本节点 ID</div><div className="mt-1 break-all font-mono text-xs">{node.id}</div></div>
    {node.type === "run" && node.meta.code ? <div className="mt-5"><div className="label">执行代码</div><pre className="mt-2 max-h-64 overflow-auto rounded-appleSm bg-ink p-3 font-mono text-xs leading-5 text-white">{String(node.meta.code)}</pre></div> : null}
    <div className="mt-5 space-y-3">{Object.entries(node.meta).filter(([key]) => key !== "code" && key !== "packages").map(([key, value]) => <div key={key} className="rounded-appleSm border p-3"><div className="flex items-center"><span className="label">{metaLabels[key] ?? key}</span>{key.includes("hash") && value ? <button onClick={() => void copy(key, value)} className="ml-auto text-subtle hover:text-brand" aria-label={`复制 ${metaLabels[key] ?? key}`}>{copied === key ? <Check size={14} className="text-status-ok"/> : <Clipboard size={14}/>}</button> : null}</div><div className={`mt-1 break-all text-xs ${key.includes("hash") ? "font-mono" : ""}`}>{value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</div></div>)}</div>
    {Array.isArray(node.meta.packages) && node.meta.packages.length > 0 ? <details className="mt-4 rounded-appleSm border p-3"><summary className="cursor-pointer text-xs font-semibold">环境依赖（{node.meta.packages.length}）</summary><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted">{node.meta.packages.join("\n")}</pre></details> : null}
  </aside>;
}
