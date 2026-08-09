"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  FileText,
  Loader2,
  LocateFixed,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnchoredMarkdown } from "@/components/anchor/AnchoredMarkdown";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { activeProjectId, api, type ArtifactSummary, type VerifyResult } from "@/lib/api";
import { addArtifactToWriting, readWritingState, rememberWritingArtifact, writingTemplate } from "@/lib/writingStorage";
import { notifyFeedback } from "@/lib/feedback";

const anchorPattern = /⟦((?:art|src)_[0-9a-fA-F]{4})⟧/g;
const checkLabels = { citation: "引用支持", number: "数字来源", figure: "图表来源" } as const;
type MobileWritingView = "edit" | "preview" | "issues";

function artifactLabel(kind: ArtifactSummary["kind"]) {
  return ({ number: "数字", coefficient: "系数", table: "表格", figure: "图表", text: "文本", conclusion: "结论" })[kind];
}

export function WritingTab({ initialArtifactId }: { initialArtifactId?: string }) {
  const router = useRouter();
  const [text, setText] = useState(writingTemplate);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [allArtifacts, setAllArtifacts] = useState<ArtifactSummary[]>([]);
  const [verification, setVerification] = useState<VerifyResult>();
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingArtifacts, setLoadingArtifacts] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [mobileView, setMobileView] = useState<MobileWritingView>("edit");
  const keyRef = useRef("");
  const projectRef = useRef("");
  const loadedRef = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const projectId = activeProjectId();
      projectRef.current = projectId;
      const state = readWritingState(projectId);
      const [saved, all] = await Promise.all([api.artifacts("saved", 100), api.artifacts("all", 100)]);
      const requestedArtifact = initialArtifactId ? saved.items.find((item) => item.id === initialArtifactId && item.source_complete) : undefined;
      if (requestedArtifact) addArtifactToWriting(projectId, { artifact_id: requestedArtifact.id, title: requestedArtifact.title });
      keyRef.current = state.keys.draft;
      setText(readWritingState(projectId).draft);
      setArtifacts(saved.items);
      setAllArtifacts(all.items);
      loadedRef.current = true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报告加载失败");
    } finally {
      setLoadingArtifacts(false);
    }
  }, [initialArtifactId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (loadedRef.current && keyRef.current) localStorage.setItem(keyRef.current, text); }, [text]);

  const anchors = useMemo(
    () => Array.from(new Set(Array.from(text.matchAll(anchorPattern), (match) => match[1].toLowerCase()))),
    [text],
  );
  const hasArtifact = anchors.some((item) => item.startsWith("art_"));
  const failedChecks = verification?.items.filter((item) => item.verdict === "fail") || [];
  const writingStages = [
    { label: "选择可信成果", detail: "插入至少一项成果", complete: hasArtifact, current: !hasArtifact },
    { label: "校验来源", detail: "核对数字、引用和图表", complete: verification?.verdict === "pass", current: hasArtifact && verification?.verdict !== "pass" },
    { label: "发布结论", detail: "写入项目可信账本", complete: saved, current: verification?.verdict === "pass" && !saved },
  ];

  useEffect(() => {
    if (failedChecks.length > 0) setMobileView("issues");
  }, [failedChecks.length]);

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
      notifyFeedback(result.verdict === "pass" ? "报告来源校验通过" : `发现 ${result.items.filter((item) => item.verdict === "fail").length} 项需要处理`, result.verdict === "pass" ? "success" : "warning");
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
      notifyFeedback("可信结论已发布并写入项目账本");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setSaving(false);
    }
  }

  async function generateDraft() {
    if (drafting) return;
    setDrafting(true);
    setError("");
    try {
      const draft = await api.generateWritingDraft();
      updateText(draft.text);
      notifyFeedback("已根据成果库生成报告草稿");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动生成报告失败");
    } finally {
      setDrafting(false);
    }
  }

  function openAnchor(anchor: string) {
    const match = anchor.match(/art_([0-9a-fA-F]{4})/i);
    if (!match) {
      setError("当前锚点不是分析产物，来源文档请从资料页打开。");
      return;
    }
    const code = match[1].toLowerCase();
    const matches = allArtifacts.filter((item) => item.id.toLowerCase().startsWith(code));
    if (matches.length !== 1) {
      setError(matches.length ? "锚点短码不唯一，请重新插入该成果。" : "找不到该产物，可能已从当前项目移除。");
      return;
    }
    router.push(`/lineage/${matches[0].id}`);
  }

  function resetDraft() {
    updateText(writingTemplate);
    setResetOpen(false);
  }

  function locateIssue(locate: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const start = text.indexOf(locate);
    if (start < 0) {
      setError("未能在当前草稿中定位这段内容，可能已被修改。请重新运行校验。");
      return;
    }
    setError("");
    setMobileView("edit");
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start, start + locate.length);
      const line = text.slice(0, start).split("\n").length;
      editor.scrollTop = Math.max(0, (line - 3) * 28);
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  const publishHint = !hasArtifact ? "先插入至少一项可引用成果" : verification?.verdict !== "pass" ? "校验通过后可发布" : "来源完整，可以发布";

  return <>
    <div className="space-y-4">
      <section className="rounded-appleLg border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl"><div className="flex items-center gap-2"><FileText size={18} className="text-brand" /><h2 className="text-lg font-semibold">项目研究报告</h2></div><p className="mt-2 text-sm leading-6 text-muted">先保存值得引用的成果，再自动生成报告草稿。模型只读取成果库中的可信证据；分析过程和临时指标不会自动堆积。</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void generateDraft()} disabled={drafting || !artifacts.length} className="btn-primary h-9 px-3 text-xs"><WandSparkles size={13} />{drafting ? "正在生成…" : "根据成果生成报告"}</button><button onClick={() => setResetOpen(true)} className="btn-secondary h-9 px-3 text-xs"><RotateCcw size={13} />重新套用模板</button></div>
        </div>
        <ol aria-label="报告发布流程" className="mt-5 grid gap-2 border-t pt-4 sm:grid-cols-3">
          {writingStages.map((stage, index) => <li key={stage.label} aria-current={stage.current ? "step" : undefined} className={`rounded-apple border px-3 py-3 ${stage.complete ? "border-status-ok/20 bg-status-ok/[.05]" : stage.current ? "border-brand/20 bg-brand/[.05]" : "bg-canvas"}`}><div className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${stage.complete ? "bg-status-ok/10 text-status-ok" : stage.current ? "bg-brand/10 text-brand" : "bg-ink/[.06] text-subtle"}`}>{stage.complete ? <Check size={12}/> : index + 1}</span><strong className="text-xs">{stage.label}</strong><span className={`ml-auto text-[10px] ${stage.complete ? "text-status-ok" : stage.current ? "text-brand" : "text-subtle"}`}>{stage.complete ? "已完成" : stage.current ? "当前" : "待进行"}</span></div><p className="mt-2 text-[11px] leading-4 text-muted">{stage.detail}</p></li>)}
        </ol>
        <div className="mt-5 border-t pt-4">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">可引用成果</h3><p className="mt-1 text-xs text-muted">来自成果库，插入后自动生成可校验锚点。</p></div><span className="text-xs text-subtle">已插入 {anchors.filter((item) => item.startsWith("art_")).length} 项</span></div>
          {loadingArtifacts ? <div className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" />正在读取成果库…</div> : artifacts.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{artifacts.map((artifact) => { const code = artifact.id.slice(0, 4).toLowerCase(); const inserted = text.includes(`⟦art_${code}⟧`); return <button key={artifact.id} onClick={() => insertArtifact(artifact)} disabled={inserted} className="flex min-w-[220px] items-center gap-3 rounded-apple border bg-canvas px-3 py-3 text-left transition-colors hover:border-brand/30 disabled:cursor-default disabled:bg-status-ok/[.05]"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${inserted ? "bg-status-ok/10 text-status-ok" : "bg-brand/10 text-brand"}`}>{inserted ? <Check size={14} /> : <BarChart3 size={14} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{artifact.title || artifactLabel(artifact.kind)}</span><span className="text-xs text-subtle">{inserted ? "已在正文中" : `${artifactLabel(artifact.kind)} · 点击插入`}</span></span>{!inserted && <Plus size={14} className="text-subtle" />}</button>; })}</div> : <div className="mt-3 rounded-apple border border-dashed px-4 py-4 text-sm text-muted">成果库还是空的。请先在分析对话中打开有价值的图、表或数字，并选择“保存成果”。</div>}
        </div>
      </section>

      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-apple bg-canvas/95 py-2 backdrop-blur-xl">
        <div className={`mr-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs ${verification?.verdict === "pass" ? "bg-status-ok/10 text-status-ok" : verification?.verdict === "fail" ? "bg-status-warn/10 text-status-warn" : "bg-ink/[.06] text-muted"}`}>{checking ? <Loader2 size={14} className="animate-spin" /> : verification?.verdict === "pass" ? <Check size={14} /> : <ShieldCheck size={14} />}{checking ? "正在校验报告" : verification?.verdict === "pass" ? "来源校验通过" : verification?.verdict === "fail" ? `${failedChecks.length} 项需要处理` : "草稿 · 尚未校验"}</div>
        <button onClick={() => void verify()} disabled={checking} className="btn-secondary"><ShieldCheck size={14} />校验报告</button>
        {verification?.verdict === "fail" && <button onClick={() => void verify(true)} disabled={checking} className="btn-secondary"><WandSparkles size={14} />自动修复</button>}
        <div className="text-right"><button onClick={() => void publish()} disabled={verification?.verdict !== "pass" || !hasArtifact || saving} className="btn-primary"><Save size={14} />{saving ? "发布中…" : "发布可信结论"}</button><p className="mt-1 text-[11px] leading-4 text-muted" aria-live="polite">{publishHint}</p></div>
      </div>

      {error && <div className="status-error"><AlertTriangle size={16} />{error}</div>}
      {saved && <div className="rounded-apple bg-status-ok/10 px-4 py-3 text-sm text-status-ok">可信结论已发布，并保留正文锚点与来源关系。</div>}

      <div className="grid min-h-[560px] overflow-hidden rounded-appleLg border bg-surface xl:min-h-[640px] xl:grid-cols-2">
        <div role="tablist" aria-label="移动端报告视图" className="grid grid-cols-3 border-b bg-canvas p-1 xl:hidden">{([{ value: "edit", label: "编辑" }, { value: "preview", label: "预览" }, { value: "issues", label: `问题 ${failedChecks.length}` }] as const).map((view) => <button key={view.value} role="tab" aria-selected={mobileView === view.value} onClick={() => setMobileView(view.value)} className="min-h-10 rounded-appleSm px-3 text-sm text-muted aria-selected:bg-surface aria-selected:font-semibold aria-selected:text-ink aria-selected:shadow-sm">{view.label}</button>)}</div>
        <section className={`${mobileView === "edit" ? "flex" : "hidden"} min-h-[500px] flex-col xl:flex xl:min-h-[640px] xl:border-r`}><div className="flex h-12 items-center border-b px-5 text-xs font-semibold text-muted"><span>报告正文</span><span className="ml-auto">{text.length} 字符 · 自动保存</span></div><textarea ref={editorRef} value={text} onChange={(event) => updateText(event.target.value)} className="min-h-0 flex-1 resize-none bg-transparent p-6 text-[15px] leading-7 outline-none focus:ring-2 focus:ring-inset focus:ring-brand/20" spellCheck={false} aria-label="报告正文" /></section>
        <section className={`${mobileView === "preview" ? "block" : "hidden"} max-h-[70vh] overflow-y-auto bg-canvas p-5 sm:p-6 xl:block xl:max-h-none`}><div className="min-h-full rounded-apple border bg-surface p-6"><div className="mb-6 flex items-center gap-2 border-b pb-4 font-semibold"><ShieldCheck size={16} className="text-brand" />报告预览 <span className="ml-auto text-xs font-normal text-muted">点击蓝色锚点查看完整溯源</span></div><AnchoredMarkdown text={text} onAnchor={openAnchor} />{failedChecks.length > 0 && <IssueList items={failedChecks} onLocate={locateIssue}/>}</div></section>
        <section className={`${mobileView === "issues" ? "block" : "hidden"} min-h-[500px] overflow-y-auto bg-canvas p-5 xl:hidden`}><div className="rounded-apple border bg-surface p-5"><h3 className="font-semibold">校验问题</h3>{failedChecks.length ? <IssueList items={failedChecks} onLocate={locateIssue}/> : <p className="mt-3 text-sm leading-6 text-muted">运行校验后，需要处理的问题会集中显示在这里。</p>}</div></section>
      </div>
    </div>
    <ConfirmDialog open={resetOpen} title="重新套用报告模板？" description="当前草稿会被标准报告结构替换。已保存成果不会删除，你可以稍后重新插入。" confirmLabel="重新开始" onCancel={() => setResetOpen(false)} onConfirm={resetDraft} />
  </>;
}

function IssueList({ items, onLocate }: { items: VerifyResult["items"]; onLocate: (locate: string) => void }) {
  return <div className="mt-8 border-t pt-5"><h3 className="text-sm font-semibold">校验建议</h3><div className="mt-3 space-y-2">{items.map((item, index) => <div key={`${item.check}-${index}`} className="rounded-apple bg-status-warn/[.08] p-3"><div className="flex items-center gap-2 text-sm font-semibold text-status-warn"><AlertTriangle size={14}/>{checkLabels[item.check]}</div><p className="mt-1 text-sm leading-6 text-muted">{item.reason}</p>{item.locate && <div className="mt-2 flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-xs text-subtle">位置：{item.locate}</p><button onClick={() => onLocate(item.locate)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline"><LocateFixed size={12}/>定位正文</button></div>}</div>)}</div></div>;
}
