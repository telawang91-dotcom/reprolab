"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reduceAgentTimeline, terminalConversationMessage, type TimelineArtifact } from "@/lib/agentTimeline";
import { api, streamChat, type ChatEvent, type CollectionItem, type DocumentDetail, type Lineage, type SkillItem } from "@/lib/api";

export type AnalysisEvent = ChatEvent & { id: string };

type SessionOptions = {
  mode?: "analysis" | "workspace";
  autoSelectAll?: boolean;
  refreshKey?: string | number;
};

export function useAnalysisSession(collectionId?: string, replayId?: string, options: SessionOptions = {}) {
  const mode = options.mode ?? "analysis";
  const autoSelectAll = options.autoSelectAll ?? false;
  const refreshKey = options.refreshKey;
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [datasets, setDatasets] = useState<DocumentDetail[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<AnalysisEvent[]>([]);
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
  const loadedReplayRef = useRef<string>();

  useEffect(() => {
    let live = true;
    abortRef.current?.abort();
    loadedReplayRef.current = undefined;
    setDatasets([]); setSelected([]); setEvents([]); setLiveEvents([]); setConversation(undefined);
    setActiveArtifact(undefined); setLineage(undefined); setSkillResult(undefined); setError("");
    void (async () => {
      try {
        const scopes = await api.collections();
        if (!live) return;
        setCollections(scopes);
        if (!collectionId) return;
        if (!scopes.some((item) => item.id === collectionId)) {
          setError("当前文件夹不存在或已被删除，请重新选择研究文件夹。");
          return;
        }
        const docs = await api.documents(mode === "workspace" ? undefined : "other", collectionId);
        const details = await Promise.all(docs.map((doc) => api.document(doc.id)));
        if (!live) return;
        const available = details.filter((doc) => doc.dataset_id);
        setDatasets(available);
        if (autoSelectAll) setSelected(available.flatMap((item) => item.dataset_id ? [item.dataset_id] : []));
        else if (available.length === 1 && available[0].dataset_id) setSelected([available[0].dataset_id]);
      } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : "数据集加载失败"); }
    })();
    return () => { live = false; abortRef.current?.abort(); };
  }, [autoSelectAll, collectionId, mode, refreshKey]);

  useEffect(() => {
    const replayKey = replayId ? `${collectionId ?? ""}:${replayId}` : undefined;
    if (replayKey && loadedReplayRef.current === replayKey) return;
    let live = true;
    abortRef.current?.abort();
    setEvents([]); setLiveEvents([]); setConversation(undefined); setMessage(""); setError("");
    setActiveArtifact(undefined); setLineage(undefined); setSkillResult(undefined); setRunning(false);
    if (!replayId) {
      loadedReplayRef.current = undefined;
      return () => { live = false; };
    }
    void api.conversation(replayId)
      .then((replay) => {
        if (!live) return;
        setEvents(replay.events.map((event) => ({ ...event, id: crypto.randomUUID() })));
        setConversation(replay.id);
        loadedReplayRef.current = replayKey;
      })
      .catch((reason) => {
        if (live) setError(reason instanceof Error ? reason.message : "会话加载失败");
      });
    return () => { live = false; };
  }, [collectionId, replayId]);

  const timeline = useMemo(() => reduceAgentTimeline(events), [events]);
  const liveTimeline = useMemo(() => reduceAgentTimeline(liveEvents), [liveEvents]);
  const artifacts = useMemo(() => timeline.steps.flatMap((step) => step.attempts.flatMap((attempt) => attempt.artifacts)), [timeline]);
  const selectedDatasets = useMemo(() => datasets.filter((item) => item.dataset_id && selected.includes(item.dataset_id)), [datasets, selected]);

  const send = useCallback(async (text = message) => {
    if (!text.trim() || running || (mode === "analysis" && !selected.length)) return;
    setMessage(""); setError(""); setRunning(true);
    const userEvent: AnalysisEvent = { id: crypto.randomUUID(), event: "message", data: { text: text.trim(), citations: [], user: true } };
    setLiveEvents([userEvent]);
    setEvents((items) => [...items, userEvent]);
    const controller = new AbortController(); abortRef.current = controller;
    let receivedAnswer = false;
    try {
      await streamChat({ conversation_id: conversation, collection_id: collectionId, mode, message: text.trim(), dataset_ids: selected, skill_id: skill?.id }, (incoming) => {
        const event = { ...incoming, id: crypto.randomUUID() };
        setEvents((items) => [...items, event]);
        setLiveEvents((items) => [...items, event]);
        if (incoming.event === "message" && !incoming.data.user && typeof incoming.data.text === "string" && incoming.data.text.trim()) receivedAnswer = true;
        if (incoming.event === "artifact") setActiveArtifact(incoming.data as TimelineArtifact);
        if ((incoming.event === "done" || incoming.event === "error") && typeof incoming.data.conversation_id === "string") {
          setConversation(incoming.data.conversation_id);
          loadedReplayRef.current = `${collectionId ?? ""}:${incoming.data.conversation_id}`;
        }
      }, controller.signal);
      if (!receivedAnswer) {
        const fallback = { ...terminalConversationMessage("服务已结束处理，但没有返回可展示的回答。"), id: crypto.randomUUID() };
        setEvents((items) => [...items, fallback]);
        setLiveEvents((items) => [...items, fallback]);
        setMessage(text.trim());
      }
    } catch (reason) {
      setMessage(text.trim());
      const stopped = (reason as Error).name === "AbortError";
      if (!receivedAnswer) {
        const messageText = reason instanceof Error ? reason.message : "分析服务暂时不可用。";
        const fallback = { ...terminalConversationMessage(messageText, stopped), id: crypto.randomUUID() };
        setEvents((items) => [...items, fallback]);
        setLiveEvents((items) => [...items, fallback]);
      }
      if (!stopped) setError(reason instanceof Error ? `${reason.message} 研究问题已恢复，可直接重新运行。` : "分析失败，研究问题已恢复，可直接重新运行。");
    }
    finally { setRunning(false); abortRef.current = undefined; }
  }, [collectionId, conversation, message, mode, running, selected, skill]);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    loadedReplayRef.current = undefined;
    setEvents([]); setLiveEvents([]); setConversation(undefined); setMessage(""); setError("");
    setActiveArtifact(undefined); setLineage(undefined); setSkillResult(undefined); setRunning(false);
  }, []);

  const showLineage = async (artifactId: string) => {
    try { setLineage(await api.lineage(artifactId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "血缘加载失败"); }
  };
  const anchorClick = (anchor: string) => {
    const artifact = artifacts.find((item) => item.anchor?.toLowerCase() === anchor.toLowerCase());
    if (artifact) setActiveArtifact(artifact);
    return artifact;
  };
  const saveAsSkill = async (artifact: TimelineArtifact, name: string, intent: string, discipline: string) => {
    try {
      const created = await api.harvestSkill(artifact.artifact_id, name.trim(), intent.trim(), discipline);
      setSkill(created);
      setSkillRefresh((value) => value + 1);
      setSkillResult({ saved: 0, fallback: false, reason: `“${created.name}”已从真实运行沉淀，并自动设为当前技能。` });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "技能保存失败");
      throw reason;
    }
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
  return { collections, activeCollection, datasets, selected, toggleDataset, selectedDatasets, events, timeline, liveTimeline, artifacts, message, setMessage, running, error, setError, conversation, activeArtifact, setActiveArtifact, lineage, setLineage, skill, setSkill, skillRefresh, skillResult, send, newConversation, stop: () => abortRef.current?.abort(), showLineage, anchorClick, saveAsSkill, applySkill };
}
