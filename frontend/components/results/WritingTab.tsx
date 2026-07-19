"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { activeProjectId, api, type ArtifactSummary, type VerifyResult } from "@/lib/api";
import { readWritingState, rememberWritingArtifact, writingTemplate } from "@/lib/writingStorage";

const anchorPattern = /⟦((?:art|src)_[0-9a-fA-F]{4})⟧/g;
const checkLabels = { citation: "引用支持", number: "数字来源", figure: "图表来源" } as const;

function artifactLabel(kind: ArtifactSummary["kind"]) {
  return ({ number: "数字", coefficient: "系数", table: "表格", figure: "图表", text: "文本", conclusion: "结论" })[kind];
}

export function WritingTab() {
  const [text, setText] = useState(writingTemplate);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [verification, setVerification] = useState<VerifyResult>();
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingArtifacts, setLoadingArtifacts] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const keyRef = useRef("");
  const projectRef = useRef("");

  const load = useCallback(async () => {
    try {
      const projectId = activeProjectId();
      projectRef.current = projectId;
      const state = readWritingState(projectId);
      keyRef.current = state.keys.draft;
      setText(state.draft);
      setArtifacts((await api.artifacts("saved", 100)).items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报告加载失败");
    } finally {
      setLoadingArtifacts(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (keyRef.current) localStorage.setItem(keyRef.current, text); }, [text]);

  const anchors = useMemo(() => Array.from(text.matchAll(anchorPattern), (match) => match[1].toLowerCase()), [text]);
  const hasArtifact = anchors.some((item) => item.startsWith("art_"));
  const failedChecks = verification?.items.filter((item) => item.verdict === "fail") || [];

  function updateText(next: string) {
    setText(next);
    setVerification(undefined);
    setSaved(false);
  }

  function insertArtifact(artifact: ArtifactSummary) {
    const state = rememberWritingArtifact(projectRef.current, { artifact_id: artifact.id, title: artifact.title });
    if (text.includes(state.anchor)) return;
    const line = `- ${artifact.title || artifactLabel(artifact.kind)} ${state.anchor}`;
    const heading = "## 关键发现";
    updateText(text.includes(heading) ? text.replace(heading, `${heading}\n${line}`) : `${text.trim()}\n\n${heading}\n${line}`);
  }

  async function verify(repair = false) {
    setChecking(true);
    setError("");
    setSaved(false);
    try {
      const result = await api.verify(text, repair ? ["citation", "number", "figure"] : undefined, repair);
      if (result.repaired_text && result.repaired_text !== text) setText(result.repaired_text);
      setVerification(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "来源检查失败");
    } finally {
      setChecking(false);
    }
  }

  async function publish() {
    if (verification?.verdict !== "pass" || !hasArtifact) return;
    setSaving(true);
    setError("");
    try {
      await api.postConclusion(text, anchors);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setSaving(false);
    }
  }

  function resetDraft() {
    updateText(writingTemplate);
    setResetOpen(false);
  }

  const publishHint = !hasArtifact ? "先插入至少一项可引用成果" : verification?.verdict !== "pass" ? "校验通过后可发布" : "来源完整，可以发布";

  return <>
    <div className="space-y-4">
      <section className="rounded-appleLg border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl"><div className="flex items-center gap-2"><FileText size={18} className="text-brand" /><h2 className="text-lg font-semibold">项目研究报告</h2></div><p className="mt-2 text-sm leading-6 text-muted">报告与当前研究文件夹独立保存。只有你主动插入的成果进入正文；分析过程和临时指标不会自动堆积。</p></div>
          <button onClick={() => setResetOpen(true)} className="btn-secondary h-9 px-3 text-xs"><RotateCcw size={13} />重新套用模板</button>
        </div>
        <div className="mt-5 border-t pt-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">可引用成果</h3><p className="mt-1 text-xs text-muted">来自成果库，插入后自动生成可校验锚点。</p></div><span className="text-xs text-subtle">已插入 {anchors.filter((item) => item.startsWith("art_")).length} 项</span></div>
          {loadingArtifacts ? <div className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" />正在读取成果库…</div> : artifacts.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{artifacts.map((artifact) => { const code = artifact.id.slice(0, 4).toLowerCase(); const inserted = text.includes(`⟦art_${code}⟧`); return <button key={artifact.id} onClick={() => insertArtifact(artifact)} disabled={inserted} className="flex min-w-[220px] items-center gap-3 rounded-apple border bg-canvas px-3 py-3 text-left transition-colors hover:border-brand/30 disabled:cursor-default disabled:bg-status-ok/[.05]"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${inserted ? "bg-status-ok/10 text-status-ok" : "bg-brand/10 text-brand"}`}>{inserted ? <Check size={14} /> : <BarChart3 size={14} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{artifact.title || artifactLabel(artifact.kind)}</span><span className="text-xs text-subtle">{inserted ? "已在正文中" : `${artifactLabel(artifact.kind)} · 点击插入`}</span></span>{!inserted && <Plus size={14} className="text-subtle" />}</button>; })}</div> : <div className="mt-3 rounded-apple border border-dashed px-4 py-4 text-sm text-muted">成果库还是空的。请先在分析对话中打开有价值的图、表或数字，并选择“保存成果”。</div>}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className={`mr-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs ${verification?.verdict === "pass" ? "bg-status-ok/10 text-status-ok" : verification?.verdict === "fail" ? "bg-status-warn/10 text-status-warn" : "bg-ink/[.06] text-muted"}`}>{checking ? <Loader2 size={14} className="animate-spin" /> : verification?.verdict === "pass" ? <Check size={14} /> : <ShieldCheck size={14} />}{checking ? "正在校验报告" : verification?.verdict === "pass" ? "来源校验通过" : verification?.verdict === "fail" ? `${failedChecks.length} 项需要处理` : "草稿 · 尚未校验"}</div>
        <button onClick={() => void verify()} disabled={checking} className="btn-secondary"><ShieldCheck size={14} />校验报告</button>
        {verification?.verdict === "fail" && <button onClick={() => void verify(true)} disabled={checking} className="btn-secondary"><WandSparkles size={14} />自动修复</button>}
        <div className="group relative"><button onClick={() => void publish()} disabled={verification?.verdict !== "pass" || !hasArtifact || saving} className="btn-primary"><Save size={14} />{saving ? "发布中…" : "发布可信结论"}</button><span className="pointer-events-none absolute right-0 top-full z-10 mt-2 hidden whitespace-nowrap rounded-appleSm bg-ink px-3 py-2 text-xs text-white group-hover:block">{publishHint}</span></div>
      </div>

      {error && <div className="status-error"><AlertTriangle size={16} />{error}</div>}
      {saved && <div className="rounded-apple bg-status-ok/10 px-4 py-3 text-sm text-status-ok">可信结论已发布，并保留正文锚点与来源关系。</div>}

      <div className="grid min-h-[640px] overflow-hidden rounded-appleLg border bg-surface xl:grid-cols-2">
        <section className="flex min-h-[480px] flex-col border-b xl:border-b-0 xl:border-r"><div className="flex h-12 items-center border-b px-5 text-xs font-semibold text-muted"><span>报告正文</span><span className="ml-auto">{text.length} 字符 · 自动保存</span></div><textarea value={text} onChange={(event) => updateText(event.target.value)} className="min-h-0 flex-1 resize-none bg-transparent p-6 text-[15px] leading-7 outline-none" spellCheck={false} aria-label="报告正文" /></section>
        <section className="overflow-y-auto bg-canvas p-5 sm:p-6"><div className="min-h-full rounded-apple border bg-surface p-6"><div className="mb-6 flex items-center gap-2 border-b pb-4 font-semibold"><ShieldCheck size={16} className="text-brand" />报告预览</div><AnchoredMarkdown text={text} />{failedChecks.length > 0 && <div className="mt-8 border-t pt-5"><h3 className="text-sm font-semibold">校验建议</h3><div className="mt-3 space-y-2">{failedChecks.map((item, index) => <div key={`${item.check}-${index}`} className="rounded-apple bg-status-warn/[.08] p-3"><div className="flex items-center gap-2 text-sm font-semibold text-status-warn"><AlertTriangle size={14} />{checkLabels[item.check]}</div><p className="mt-1 text-sm leading-6 text-muted">{item.reason}</p>{item.locate && <p className="mt-1 truncate text-xs text-subtle">位置：{item.locate}</p>}</div>)}</div></div>}</div></section>
      </div>
    </div>
    <ConfirmDialog open={resetOpen} title="重新套用报告模板？" description="当前草稿会被标准报告结构替换。已保存成果不会删除，你可以稍后重新插入。" confirmLabel="重新开始" onCancel={() => setResetOpen(false)} onConfirm={resetDraft} />
  </>;
}
