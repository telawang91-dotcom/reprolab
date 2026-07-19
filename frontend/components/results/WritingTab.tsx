"use client";

import { AlertTriangle, Check, Save, ShieldCheck, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { activeProjectId, api, type VerifyResult } from "@/lib/api";
import { readWritingState } from "@/lib/writingStorage";

const initialText = "# 研究结论\n\n在此撰写带可追溯锚点的结论。";
const anchorPattern = /⟦((?:art|src)_[0-9a-fA-F]{4})⟧/g;

export function WritingTab() {
  const [text, setText] = useState(initialText);
  const [verification, setVerification] = useState<VerifyResult>();
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const keyRef = useRef("");
  useEffect(() => {
    try { const state = readWritingState(activeProjectId()); keyRef.current = state.keys.draft; setText(state.draft || initialText); }
    catch { setError("请先选择研究项目。"); }
  }, []);
  useEffect(() => { if (keyRef.current) localStorage.setItem(keyRef.current, text); }, [text]);
  const anchors = useMemo(() => Array.from(text.matchAll(anchorPattern), (match) => match[1].toLowerCase()), [text]);
  const hasArtifact = anchors.some((item) => item.startsWith("art_"));
  const verify = async (repair = false) => {
    setChecking(true); setError(""); setSaved(false);
    try { const result = await api.verify(text, repair ? ["citation", "number", "figure"] : undefined, repair); if (result.repaired_text && result.repaired_text !== text) setText(result.repaired_text); setVerification(result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "来源检查失败"); }
    finally { setChecking(false); }
  };
  const writeBack = async () => {
    if (verification?.verdict !== "pass" || !hasArtifact) return;
    setSaving(true); setError("");
    try { await api.postConclusion(text, anchors); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  };
  return <div className="space-y-4"><div className="rounded-apple border bg-surface px-4 py-3 text-sm leading-6 text-muted">这是项目级报告草稿。只有你主动从成果页加入的图、表和数字会进入正文，普通对话步骤不会自动记录。</div><div className="flex flex-wrap items-center gap-2"><div className={`mr-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs ${verification?.verdict === "pass" ? "bg-status-ok/10 text-status-ok" : verification?.verdict === "fail" ? "bg-status-err/10 text-status-err" : "bg-ink/[.06] text-muted"}`}>{verification?.verdict === "pass" ? <Check size={14} /> : <ShieldCheck size={14} />}{checking ? "正在检查" : verification?.verdict === "pass" ? "来源检查通过" : verification?.verdict === "fail" ? "有内容待修正" : "草稿 · 尚未校验"}</div><button onClick={() => void verify()} disabled={checking} className="btn-secondary"><ShieldCheck size={14} />检查来源</button><button onClick={() => void verify(true)} disabled={checking} className="btn-secondary"><WandSparkles size={14} />检查并修复</button><button onClick={() => void writeBack()} disabled={verification?.verdict !== "pass" || !hasArtifact || saving} className="btn-primary"><Save size={14} />{saving ? "保存中…" : "发布可信结论"}</button></div>{error && <div className="status-error"><AlertTriangle size={16} />{error}</div>}{saved && <div className="rounded-apple bg-status-ok/10 px-4 py-3 text-sm text-status-ok">结论已回写知识库。</div>}{!hasArtifact && verification?.verdict === "pass" && <div className="rounded-apple bg-status-warn/10 px-4 py-3 text-sm text-status-warn">发布前至少需要一个主动加入的分析产物 ⟦art_*⟧ 锚点。</div>}<div className="grid min-h-[620px] overflow-hidden rounded-appleLg border bg-surface lg:grid-cols-2"><section className="flex min-h-[420px] flex-col border-b lg:border-b-0 lg:border-r"><div className="flex h-11 items-center border-b px-4 text-xs font-semibold text-muted"><span>报告正文</span><span className="ml-auto">{text.length} 字符 · 草稿自动保存</span></div><textarea value={text} onChange={(event) => { setText(event.target.value); setVerification(undefined); }} className="min-h-0 flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-7 outline-none" spellCheck={false} /></section><section className="overflow-y-auto bg-canvas p-6"><div className="min-h-full rounded-apple border bg-surface p-6"><div className="mb-5 flex items-center gap-2 border-b pb-3 font-semibold"><ShieldCheck size={16} className="text-brand" />报告预览</div><AnchoredMarkdown text={text} />{verification?.items.some((item) => item.verdict === "fail") && <div className="mt-7 border-t pt-4"><h3 className="text-sm font-semibold text-status-err">需要处理</h3><div className="mt-3 space-y-2">{verification.items.filter((item) => item.verdict === "fail").map((item, index) => <div key={index} className="rounded-apple bg-status-err/10 p-3 text-xs text-status-err"><strong>{item.check}</strong> · {item.reason}</div>)}</div></div>}</div></section></div></div>;
}
