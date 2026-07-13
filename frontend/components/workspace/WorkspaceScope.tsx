"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  api,
  selectedProjectId,
  type CollectionItem,
  type DocumentItem,
} from "@/lib/api";

type WorkspaceScopeValue = {
  collections: CollectionItem[];
  documents: DocumentItem[];
  activeId: string;
  activeCollection?: CollectionItem;
  unfiledCount: number;
  loading: boolean;
  error: string;
  managerOpen: boolean;
  openManager: () => void;
  closeManager: () => void;
  selectCollection: (id: string) => void;
  refresh: (preferredId?: string) => Promise<void>;
};

const WorkspaceScopeContext = createContext<WorkspaceScopeValue | null>(null);

function storageKey() {
  const projectId = selectedProjectId();
  return projectId ? `reprolab.activeCollection.${projectId}` : "";
}

export function WorkspaceScopeProvider({ children }: { children: React.ReactNode }) {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);

  const selectCollection = useCallback((id: string) => {
    setActiveId(id);
    const key = storageKey();
    if (!key) return;
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  }, []);

  const refresh = useCallback(async (preferredId?: string) => {
    if (!selectedProjectId()) {
      setCollections([]);
      setDocuments([]);
      setActiveId("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextCollections, nextDocuments] = await Promise.all([
        api.collections(),
        api.documents(),
      ]);
      setCollections(nextCollections);
      setDocuments(nextDocuments);
      const key = storageKey();
      const stored = key ? localStorage.getItem(key) : "";
      const candidate = preferredId || stored || activeId;
      const nextId = nextCollections.some((item) => item.id === candidate)
        ? candidate
        : nextCollections[0]?.id || "";
      setActiveId(nextId);
      if (key) {
        if (nextId) localStorage.setItem(key, nextId);
        else localStorage.removeItem(key);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取研究文件夹");
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    void refresh();
    if (new URLSearchParams(window.location.search).get("manage") === "1") setManagerOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<WorkspaceScopeValue>(() => ({
    collections,
    documents,
    activeId,
    activeCollection: collections.find((item) => item.id === activeId),
    unfiledCount: documents.filter((document) => !document.collection_id).length,
    loading,
    error,
    managerOpen,
    openManager: () => setManagerOpen(true),
    closeManager: () => setManagerOpen(false),
    selectCollection,
    refresh,
  }), [activeId, collections, documents, error, loading, managerOpen, refresh, selectCollection]);

  return <WorkspaceScopeContext.Provider value={value}>{children}</WorkspaceScopeContext.Provider>;
}

export function useWorkspaceScope() {
  const value = useContext(WorkspaceScopeContext);
  if (!value) throw new Error("useWorkspaceScope 必须在 WorkspaceScopeProvider 内使用");
  return value;
}
