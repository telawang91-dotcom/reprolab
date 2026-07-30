"use client";

import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ArtifactsTab } from "./ArtifactsTab";
import { RecordsTab } from "./RecordsTab";
import { WritingTab } from "./WritingTab";

export type ResultsTab = "artifacts" | "writing" | "records";
const tabs = [
  { value: "artifacts" as const, label: "已保存成果" },
  { value: "writing" as const, label: "报告草稿" },
  { value: "records" as const, label: "记录与质量" },
];

export function ResultsHub({ initialTab }: { initialTab: ResultsTab }) {
  const router = useRouter();
  const setTab = (tab: ResultsTab) => router.replace(`/results?tab=${tab}`, { scroll: false });
  return (
    <div className="results-hub page-shell max-w-[1440px] space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-brand">Research outputs</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">研究成果</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">这里只展示你主动保存的结果和报告草稿；Agent 的中间步骤留在对应对话的技术详情中。</p></div><SegmentedControl value={initialTab} segments={tabs} onChange={setTab} label="成果视图" /></header>
      {initialTab === "artifacts" && <ArtifactsTab />}
      {initialTab === "writing" && <WritingTab />}
      {initialTab === "records" && <RecordsTab />}
    </div>
  );
}
