"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reduceAgentTimeline, type TimelineArtifact } from "@/lib/agentTimeline";
import { api, streamChat, type ChatEvent, type CollectionItem, type DocumentDetail, type Lineage, type SkillItem } from "@/lib/api";

export type AnalysisEvent = ChatEvent & { id: string };

export function useAnalysisSession(collectionId?: string, replayId?: string) {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [datasets, setDatasets] = useState<DocumentDetail[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [conversation, setConversation] = useState<string>();
  const [activeArtifact, setActiveArtifact] = useState<TimelineArtifact>();
  const [lineage, setLineage] = useState<Lineage>();
  const [skill, setSkill] = useState<SkillItem>();
  const [skillRefresh, setSkillRefresh] = useState(0);
  const [skillResult, setSkillResult] = useState<{ saved: number; fallback: boolean; reason: string }>();
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    let live = true;
    abortRef.current?.abort();
    setDatasets([]); setSelected([]); setEvents([]); setConversation(undefined);
    setActiveArtifact(undefined); setLineage(undefined); setSkillResult(undefined); setError("");
    void (async () => {
      try {
        const scopes = await api.collections();
        if (!live) return;
        setCollections(scopes);
        if (replayId) {
          const replay = await api.conversation(replayId);
          if (!live) return;
          setEvents(replay.events.map((event) => ({ ...event, id: crypto.randomUUID() })));
          setConversation(replay.id);
        }
        if (!collectionId) return;
        if (!scopes.some((item) => item.id === collectionId)) {
          setError("当前文件夹不存在或已被删除，请重新选择研究文件夹。");
          return;
        }
        const docs = await api.documents("other", collectionId);
        const details = await Promise.all(docs.map((doc) => api.document(doc.id)));
        if (!live) return;
        const available = details.filter((doc) => doc.dataset_id);
        setDatasets(available);
        if (available.length === 1 && available[0].dataset_id) setSelected([available[0].dataset_id]);
      } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : "数据集加载失败"); }
    })();
    return () => { live = false; abortRef.current?.abort(); };
  }, [collectionId, replayId]);

  const timeline = useMemo(() => reduceAgentTimeline(events), [events]);
  const artifacts = useMemo(() => timeline.steps.flatMap((step) => step.attempts.flatMap((attempt) => attempt.artifacts)), [timeline]);
  const selectedDatasets = useMemo(() => datasets.filter((item) => item.dataset_id && selected.includes(item.dataset_id)), [datasets, selected]);

  const send = useCallback(async (text = message) => {
    if (!text.trim() || running || !selected.length) return;
    setMessage(""); setError(""); setRunning(true);
    setEvents((items) => [...items, { id: crypto.randomUUID(), event: "message", data: { text: text.trim(), citations: [], user: true } }]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await streamChat({ conversation_id: conversation, message: text.trim(), dataset_ids: selected, skill_id: skill?.id }, (incoming) => {
        setEvents((items) => [...items, { ...incoming, id: crypto.randomUUID() }]);
        if (incoming.event === "artifact") setActiveArtifact(incoming.data as TimelineArtifact);
        if (incoming.event === "done") setConversation(incoming.data.conversation_id);
      }, controller.signal);
    } catch (reason) { if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "分析失败"); }
    finally { setRunning(false); abortRef.current = undefined; }
  }, [conversation, message, running, selected, skill]);

  const showLineage = async (artifactId: string) => {
    try { setLineage(await api.lineage(artifactId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "血缘加载失败"); }
  };
  const anchorClick = (anchor: string) => {
    const artifact = artifacts.find((item) => item.anchor?.toLowerCase() === anchor.toLowerCase());
    if (artifact) { setActiveArtifact(artifact); void showLineage(artifact.artifact_id); }
  };
  const saveAsSkill = async (artifact: TimelineArtifact) => {
    const name = window.prompt("技能名称", `${artifact.kind} 分析技能`);
    if (!name?.trim()) return;
    const intent = window.prompt("这个技能解决什么问题？", "分组分布对比+检验");
    if (!intent?.trim()) return;
    try { const created = await api.harvestSkill(artifact.artifact_id, name.trim(), intent.trim()); setSkill(created); setSkillRefresh((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "技能保存失败"); }
  };
  const applySkill = async (item: SkillItem) => {
    if (!selected.length) { setError("请先选择要应用技能的新数据集"); return; }
    setRunning(true); setError(""); setSkillResult(undefined); setSkill(item);
    try {
      const result = await api.applySkill(item.id, selected, conversation);
      const incoming: AnalysisEvent[] = result.fallback_used
        ? result.events.map((event) => ({ ...event, id: crypto.randomUUID() }))
        : [
            ...(result.code ? [{ id: crypto.randomUUID(), event: "code" as const, data: { code: result.code, lang: "python", reused: true } }] : []),
            { id: crypto.randomUUID(), event: "run" as const, data: { run_id: result.run_id, status: result.status, stdout: "技能模板已在新数据上重新执行" } },
            ...result.artifacts.map((artifact) => ({ id: crypto.randomUUID(), event: "artifact" as const, data: artifact })),
          ];
      setEvents((current) => [...current, ...incoming]);
      const latest = [...incoming].reverse().find((event) => event.event === "artifact");
      if (latest) setActiveArtifact(latest.data as TimelineArtifact);
      if (result.conversation_id) setConversation(result.conversation_id);
      setSkillResult({ saved: result.token_usage.saved_tokens, fallback: result.fallback_used, reason: result.mapping_reason });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "技能复用失败"); }
    finally { setRunning(false); }
  };
  const toggleDataset = (datasetId: string) => setSelected((items) => items.includes(datasetId) ? items.filter((item) => item !== datasetId) : [...items, datasetId]);

  const activeCollection = collections.find((item) => item.id === collectionId);
  return { collections, activeCollection, datasets, selected, toggleDataset, selectedDatasets, events, timeline, artifacts, message, setMessage, running, error, setError, conversation, activeArtifact, setActiveArtifact, lineage, setLineage, skill, setSkill, skillRefresh, skillResult, send, stop: () => abortRef.current?.abort(), showLineage, anchorClick, saveAsSkill, applySkill };
}
