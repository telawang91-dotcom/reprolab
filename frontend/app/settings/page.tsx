"use client";

import { AlertTriangle, Check, CheckCircle2, CircleHelp, Database, Eye, EyeOff, KeyRound, RefreshCw, Save, Server, ShieldCheck, SlidersHorizontal, UserRound, Wifi } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { api, type ModelConfig, type ModelTestResult, type RuntimeStatus } from "@/lib/api";

const providerMeta = {
  deepseek: { label: "DeepSeek 官方", baseUrl: "https://api.deepseek.com/v1", analysis: "deepseek-chat", review: "deepseek-reasoner" },
  hunyuan: { label: "腾讯混元", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", analysis: "hunyuan-turbos-latest", review: "hunyuan-turbos-latest" },
  custom: { label: "其他兼容服务", baseUrl: "", analysis: "", review: "" },
} as const;

export default function SettingsPage() {
  const [runtime, setRuntime] = useState<RuntimeStatus>();
  const [config, setConfig] = useState<ModelConfig>();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [configError, setConfigError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string }>();
  const [testResult, setTestResult] = useState<ModelTestResult>();

  const loadConfig = useCallback(async () => {
    setLoading(true); setConfigError("");
    try { setConfig(await api.modelConfig()); }
    catch (reason) { setConfigError(reason instanceof Error ? reason.message : "模型配置读取失败"); }
    finally { setLoading(false); }
  }, []);

  const loadRuntime = useCallback(async () => {
    setRuntimeLoading(true); setRuntimeError("");
    try { setRuntime(await api.runtimeStatus()); }
    catch (reason) { setRuntime(undefined); setRuntimeError(reason instanceof Error ? reason.message : "运行状态读取失败"); }
    finally { setRuntimeLoading(false); }
  }, []);

  useEffect(() => { void loadConfig(); void loadRuntime(); }, [loadConfig, loadRuntime]);

  function changeProvider(provider: ModelConfig["provider"]) {
    const preset = providerMeta[provider];
    setConfig((current) => current ? { ...current, provider, base_url: preset.baseUrl, analysis_model: preset.analysis, review_model: preset.review } : current);
    setTestResult(undefined); setNotice(undefined);
  }

  async function save(testAfter = false) {
    if (!config) return;
    setSaving(true); setNotice(undefined); setTestResult(undefined);
    try {
      const saved = await api.saveModelConfig({
        provider: config.provider, base_url: config.base_url, analysis_model: config.analysis_model,
        review_model: config.review_model, ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setConfig(saved); setApiKey("");
      window.dispatchEvent(new CustomEvent("reprolab-model-updated", { detail: saved.provider }));
      setNotice({ kind: "success", text: "模型设置已保存" });
      if (testAfter) {
        setTesting(true);
        const result = await api.testModel(); setTestResult(result);
        setNotice(result.ok ? { kind: "success", text: "设置已保存，模型连接正常" } : { kind: "error", text: result.message });
      }
    } catch (reason) {
      setNotice({ kind: "error", text: reason instanceof Error ? reason.message : "设置保存失败" });
    } finally { setSaving(false); setTesting(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void save(false); }

  return <div className="mx-auto max-w-6xl space-y-6 p-5 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><div className="label">工作区偏好</div><h1 className="mt-1 text-2xl font-semibold">设置</h1><p className="mt-2 text-sm text-muted">管理模型、个人资料和本机运行状态。</p></div><Link href="/profile" className="btn-secondary"><UserRound size={15}/>个人资料</Link></header>

    {notice && <div role="status" className={`flex items-center gap-2 rounded-apple border px-4 py-3 text-sm ${notice.kind === "success" ? "border-status-ok/20 bg-status-ok/[.06] text-status-ok" : "border-status-err/20 bg-status-err/[.06] text-status-err"}`}>{notice.kind === "success" ? <Check size={16}/> : <CircleHelp size={16}/>}<span>{notice.text}</span><button onClick={() => setNotice(undefined)} className="interactive ml-auto text-xs underline">关闭</button></div>}

    <section className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-2"><div className="rounded-xl border bg-surface p-2"><div className="flex items-center gap-3 rounded-lg bg-brand/10 px-3 py-3 text-sm font-medium text-brand"><SlidersHorizontal size={16}/>模型配置</div><Link href="/profile" className="interactive mt-1 flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-muted hover:bg-ink/[.05]"><UserRound size={16}/>个人资料</Link><a href="#system-status" className="interactive mt-1 flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-muted hover:bg-ink/[.05]"><Server size={16}/>运行状态</a></div><p className="px-2 text-xs leading-5 text-subtle">密钥只提交给本机后端保存，不会写入浏览器存储或返回页面。</p></aside>

      <form onSubmit={submit} className="card overflow-hidden">
        <div className="flex items-start gap-3 border-b p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><KeyRound size={18}/></span><div><h2 className="font-semibold">模型服务</h2><p className="mt-1 text-sm text-muted">选择日常分析和结果校验使用的模型。</p></div>{config?.api_key_configured && <span className="ml-auto hidden items-center gap-1 rounded-full bg-status-ok/10 px-3 py-1 text-xs font-medium text-status-ok sm:flex"><CheckCircle2 size={13}/>密钥已配置</span>}</div>
        {loading ? <div aria-label="读取模型设置" className="min-h-72 space-y-5 p-5"><div className="h-4 w-24 animate-pulse rounded-full bg-ink/[.07]"/><div className="grid gap-2 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-ink/[.05]"/>)}</div><div className="h-11 animate-pulse rounded-full bg-ink/[.05]"/><div className="grid gap-4 sm:grid-cols-2"><div className="h-11 animate-pulse rounded-full bg-ink/[.05]"/><div className="h-11 animate-pulse rounded-full bg-ink/[.05]"/></div></div> : config ? <div className="space-y-5 p-5">
          <fieldset><legend className="mb-2 text-sm font-medium">服务提供方</legend><div className="grid gap-2 sm:grid-cols-3">{(Object.keys(providerMeta) as ModelConfig["provider"][]).map((provider) => <label key={provider} className={`interactive cursor-pointer rounded-xl border p-3 ${config.provider === provider ? "border-brand/40 bg-brand/[.06]" : "hover:border-ink/20"}`}><input type="radio" name="provider" className="sr-only" checked={config.provider === provider} onChange={() => changeProvider(provider)}/><span className="flex items-center text-sm font-medium">{providerMeta[provider].label}{config.provider === provider && <Check size={14} className="ml-auto text-brand"/>}</span><span className="mt-1 block text-xs text-subtle">{provider === "custom" ? "支持 OpenAI 接口格式" : "使用官方接口"}</span></label>)}</div></fieldset>

          <label className="block"><span className="text-sm font-medium">服务地址</span><input value={config.base_url} onChange={(event) => setConfig({ ...config, base_url: event.target.value })} className="input mt-2 w-full" placeholder="https://api.example.com/v1" required/><span className="mt-1.5 block text-xs text-subtle">通常保留默认值；使用代理或私有服务时再修改。</span></label>

          <div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-medium">分析模型</span><input value={config.analysis_model} onChange={(event) => setConfig({ ...config, analysis_model: event.target.value })} className="input mt-2 w-full" placeholder="例如 deepseek-chat" required/><span className="mt-1.5 block text-xs text-subtle">用于规划步骤、生成代码和回答。</span></label><label><span className="text-sm font-medium">校验模型</span><input value={config.review_model} onChange={(event) => setConfig({ ...config, review_model: event.target.value })} className="input mt-2 w-full" placeholder="例如 deepseek-reasoner" required/><span className="mt-1.5 block text-xs text-subtle">用于检查引用、数字和分析结果。</span></label></div>

          <label className="block"><span className="flex items-center text-sm font-medium">API Key{config.api_key_configured && <span className="ml-2 text-xs font-normal text-status-ok">已保存 {config.api_key_hint}</span>}</span><div className="relative mt-2"><input type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="input w-full pr-11" autoComplete="off" placeholder={config.api_key_configured ? "留空则继续使用现有密钥" : "输入服务商提供的 API Key"}/><button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏密钥" : "显示密钥"} className="interactive absolute right-1.5 top-1.5 grid h-7 w-8 place-items-center rounded-md text-subtle hover:bg-ink/[.06]">{showKey ? <EyeOff size={15}/> : <Eye size={15}/>}</button></div><span className="mt-1.5 block text-xs text-subtle">出于安全考虑，已保存的密钥不能再次查看。</span></label>

          {testResult && <div className={`rounded-apple border p-4 text-sm ${testResult.ok ? "border-status-ok/20 bg-status-ok/[.06] text-status-ok" : "border-status-err/20 bg-status-err/[.06] text-status-err"}`}><div className="font-medium">{testResult.ok ? "连接测试通过" : "连接测试失败"}</div><p className="mt-1">{testResult.message}</p><p className="mt-2 text-xs opacity-70">{testResult.model} · {testResult.latency_ms} ms</p></div>}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-5"><button type="button" onClick={() => void save(true)} disabled={saving || testing} className="btn-secondary"><Wifi size={15}/>{testing ? "测试中…" : "保存并测试"}</button><button type="submit" disabled={saving || testing} className="btn-primary"><Save size={15}/>{saving ? "保存中…" : "保存设置"}</button></div>
        </div> : <div className="p-5"><UnavailablePanel
          title="模型设置暂不可用"
          message={configError || "没有读取到模型设置。"}
          action="重新读取模型设置"
          onRetry={() => void loadConfig()}
        /></div>}
      </form>
    </section>

    <section id="system-status" className="scroll-mt-20"><div className="mb-3"><h2 className="font-semibold">运行状态</h2><p className="mt-1 text-sm text-muted">页面、资料和分析能力是否可用，以及下一步该如何恢复。</p></div>{runtimeLoading ? <div className="grid gap-3 md:grid-cols-3"><StatusCard icon={Server} title="运行状态" state="checking"/><StatusCard icon={Database} title="数据与向量库" state="checking"/><StatusCard icon={ShieldCheck} title="可信运行环境" state="checking"/></div> : runtime ? <><div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${runtime.state === "ready" ? "border-status-ok/20 bg-status-ok/[.06] text-status-ok" : "border-status-warn/20 bg-status-warn/[.06] text-status-warn"}`}>{runtime.summary}</div><div className="grid gap-3 md:grid-cols-3">{runtime.components.map((item) => <RuntimeCard key={item.key} item={item}/>)}</div></> : <UnavailablePanel title="运行状态暂不可用" message={runtimeError || "没有读取到运行状态。"} action="重新检查运行状态" onRetry={() => void loadRuntime()}/>}</section>
  </div>;
}

function UnavailablePanel({ title, message, action, onRetry }: { title: string; message: string; action: string; onRetry: () => void }) {
  return <div role="alert" className="flex min-h-52 flex-col items-center justify-center rounded-apple border border-status-err/20 bg-status-err/[.04] px-6 py-8 text-center">
    <span className="grid h-11 w-11 place-items-center rounded-full bg-status-err/10 text-status-err"><AlertTriangle size={19}/></span>
    <h3 className="mt-4 font-semibold">{title}</h3>
    <p className="mt-2 max-w-lg text-sm leading-6 text-muted">{message}</p>
    <button type="button" onClick={onRetry} className="btn-secondary mt-5"><RefreshCw size={14}/>{action}</button>
  </div>;
}

function StatusCard({ icon: Icon, title, state }: { icon: typeof Server; title: string; state: "checking" | "online" | "offline" }) {
  return <article className="interactive-card card p-4"><div className="flex items-center gap-2 text-sm font-medium"><Icon size={16} className={state === "online" ? "text-status-ok" : "text-subtle"}/>{title}<span className={`ml-auto h-2 w-2 rounded-full ${state === "online" ? "bg-status-ok" : state === "offline" ? "bg-status-err" : "animate-pulse bg-status-warn"}`}/></div><p className="mt-3 text-sm text-muted">{state === "online" ? "运行正常" : state === "offline" ? "暂时无法连接" : "正在检查…"}</p></article>;
}

function RuntimeCard({ item }: { item: RuntimeStatus["components"][number] }) {
  const state = item.state === "ready" ? "online" : item.state === "offline" ? "offline" : "checking";
  return <article className="interactive-card card p-4"><div className="flex items-center gap-2 text-sm font-medium"><span className={`h-2 w-2 rounded-full ${state === "online" ? "bg-status-ok" : state === "offline" ? "bg-status-err" : "bg-status-warn"}`}/>{item.title}</div><p className="mt-3 text-sm leading-6 text-muted">{item.message}</p>{item.action && <p className="mt-3 text-xs font-medium text-brand">下一步：{item.action}</p>}</article>;
}
