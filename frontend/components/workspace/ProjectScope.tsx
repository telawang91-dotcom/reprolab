"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  api,
  clearActiveProjectId,
  selectedProjectId,
  setActiveProjectId,
  type ProjectItem,
} from "@/lib/api";

type ProjectScopeValue = {
  projects: ProjectItem[];
  active?: ProjectItem;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  select: (project: ProjectItem) => void;
};

const ProjectScopeContext = createContext<ProjectScopeValue | null>(null);

export function ProjectScopeProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [active, setActive] = useState<ProjectItem>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items = await api.projects(true);
      const stored = selectedProjectId();
      const chosen = items.find((item) => item.id === stored);
      if (!chosen && stored) clearActiveProjectId();
      setProjects(items);
      setActive(chosen);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取研究项目");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const select = useCallback((project: ProjectItem) => {
    if (project.id === active?.id) return;
    setActiveProjectId(project.id);
    window.location.reload();
  }, [active?.id]);

  const value = useMemo(() => ({ projects, active, loading, error, refresh, select }), [active, error, loading, projects, refresh, select]);
  return <ProjectScopeContext.Provider value={value}>{children}</ProjectScopeContext.Provider>;
}

export function useProjectScope() {
  const value = useContext(ProjectScopeContext);
  if (!value) throw new Error("useProjectScope 必须在 ProjectScopeProvider 内使用");
  return value;
}
