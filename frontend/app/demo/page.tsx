"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Database,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  setActiveProjectId,
  type RuntimeStatus,
} from "@/lib/api";

type DemoState = "checking" | "ready" | "preparing" | "failed";

export default function DemoPage() {
  const [runtime, setRuntime] = useState<RuntimeStatus>();
  const [state, setState] = useState<DemoState>("checking");
  const [error, setError] = useState("");

  const checkRuntime = useCallback(async () => {
    setState("checking");
    setError("");
    try {
      setRuntime(await api.runtimeStatus());
      setState("ready");
    } catch (reason) {
      setRuntime(undefined);
      setState("failed");
      setError(reason instanceof Error ? reason.message : "无法读取运行状态");
    }
  }, []);

  useEffect(() => {
    void checkRuntime();
  }, [checkRuntime]);

  const databaseReady = useMemo(
    () => runtime?.components.find((item) => item.key === "database")?.state === "ready",
    [runtime],
  );

  async function enterDemo() {
    if (!databaseReady || state === "preparing") return;
    setState("preparing");
    setError("");
    try {
      const project = await api.prepareDemoProject();
      setActiveProjectId(project.id);
      const collections = await api.collections();
      const collection = collections[0];
      if (!collection) throw new Error("演示研究文件夹尚未准备完成，请重试。");
      localStorage.setItem(`reprolab.activeCollection.${project.id}`, collection.id);
      window.location.assign("/analysis");
    } catch (reason) {
      setState("failed");
      setError(reason instanceof Error ? reason.message : "演示项目准备失败");
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <header className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-appleLg bg-brand/10 text-brand">
            <FlaskConical size={25} />
          </span>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[.14em] text-brand">
            隔离产品体验
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">
            用真实数据跑通一条可信研究链。
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-7 text-muted">
            系统将创建或修复一个独立的 Palmer Penguins 项目。资料、分析、产物和记忆都不会写入你的真实研究项目。
          </p>
        </header>

        <section className="mt-10 rounded-appleXl border bg-surface p-5 sm:p-7" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              state === "failed" ? "bg-status-err/10 text-status-err" : "bg-brand/10 text-brand"
            }`}>
              {state === "checking" || state === "preparing"
                ? <LoaderCircle className="animate-spin" size={17} />
                : state === "failed"
                  ? <CircleAlert size={17} />
                  : <ShieldCheck size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">
                {state === "checking" && "正在检查运行环境"}
                {state === "ready" && "运行环境检查完成"}
                {state === "preparing" && "正在准备隔离演示项目"}
                {state === "failed" && "暂时无法进入演示"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {state === "checking" && "正在确认数据库、模型和 Docker 沙箱的真实状态。"}
                {state === "preparing" && "正在写入公开示例数据并建立独立研究文件夹，请不要关闭页面。"}
                {state === "failed" && (error || "请检查服务状态后重试。")}
                {state === "ready" && runtime?.summary}
              </p>
            </div>
          </div>

          {runtime && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {runtime.components.map((component) => (
                <div key={component.key} className="rounded-apple border bg-canvas/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {component.state === "ready"
                      ? <CheckCircle2 className="text-status-ok" size={15} />
                      : <CircleAlert className="text-status-warn" size={15} />}
                    {component.title}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{component.message}</p>
                </div>
              ))}
            </div>
          )}

          {state === "failed" && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => void checkRuntime()} className="btn-primary">
                <RotateCcw size={15} />重新检查
              </button>
              <Link href="/settings#system-status" className="btn-secondary">查看解决方式</Link>
            </div>
          )}

          {state === "ready" && (
            <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Database size={14} />
                示例包含 9 行企鹅数据和一份明确标识的演示说明
              </div>
              <button
                type="button"
                onClick={() => void enterDemo()}
                disabled={!databaseReady}
                className="btn-primary sm:ml-auto disabled:cursor-not-allowed disabled:opacity-45"
              >
                使用示例数据体验<ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>

        <footer className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted">
          <Link href="/guide" className="hover:text-brand">先了解工作原理</Link>
          <Link href="/projects" className="hover:text-brand">使用自己的研究项目</Link>
        </footer>
      </div>
    </main>
  );
}
