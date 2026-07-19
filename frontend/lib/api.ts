export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000/api/v1";
export const DEMO_PROJECT_ID = "00000000-0000-0000-0000-000000000101";
const ACTIVE_PROJECT_KEY = "reprolab-active-project";
const ACTIVITY_KEY = "reprolab-activities";
export type ActivityItem = {
  id: string;
  title: string;
  state: "running" | "success" | "error" | "cancelled";
  created_at: string;
  href: string;
};
export function readActivities(): ActivityItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeActivities(items: ActivityItem[]) {
  if (typeof window === "undefined") return;
  const next = items.slice(0, 8);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent("reprolab-activities", { detail: next }),
  );
}
export function beginActivity(title: string, href: string) {
  const item: ActivityItem = {
    id: crypto.randomUUID(),
    title,
    state: "running",
    created_at: new Date().toISOString(),
    href,
  };
  writeActivities([item, ...readActivities()]);
  return item.id;
}
export function finishActivity(
  id: string,
  state: "success" | "error" | "cancelled",
) {
  writeActivities(
    readActivities().map((item) =>
      item.id === id ? { ...item, state } : item,
    ),
  );
}

export function selectedProjectId(): string | null {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function activeProjectId(): string {
  const projectId = selectedProjectId();
  if (!projectId) {
    throw new Error("请先创建或选择一个研究项目，再添加真实资料。");
  }
  return projectId;
}

export function setActiveProjectId(projectId: string): void {
  if (typeof window !== "undefined")
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

export function clearActiveProjectId(): void {
  if (typeof window !== "undefined")
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
}

export type DocumentItem = {
  id: string;
  type: "paper" | "note" | "code" | "other";
  filename: string;
  title: string | null;
  year: number | null;
  created_at: string;
  collection_id: string | null;
  metadata: Record<string, unknown> | null;
};
export type DocumentDetail = DocumentItem & {
  project_id: string;
  storage_hash: string;
  authors: string[] | null;
  doi: string | null;
  source_url: string | null;
  chunks_count: number;
  dataset_id: string | null;
  schema_json: {
    columns?: { name: string; dtype: string }[];
    row_count?: number;
    column_count?: number;
    default_sheet?: string;
    sheets?: { name: string; columns: { name: string; dtype: string }[]; row_count: number; column_count: number }[];
  } | null;
};
export type DatasetCatalogItem = {
  id: string;
  name: string;
  storage_hash: string;
  collection_id: string | null;
  schema_json: DocumentDetail["schema_json"];
  created_at: string;
};
export type DatasetFilter = {
  column: string;
  op: "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte" | "is_null" | "not_null";
  value?: string | number | boolean | null;
};
export type DatasetQuerySpec = {
  dataset_id: string;
  sheet?: string | null;
  columns?: string[];
  filters?: DatasetFilter[];
  search?: string | null;
  sort?: { column: string; direction: "asc" | "desc" } | null;
  offset?: number;
  limit?: number;
};
export type DatasetQueryResult = {
  dataset_id: string;
  name: string;
  storage_hash: string;
  sheet: string | null;
  columns: { name: string; dtype: string }[];
  rows: Record<string, unknown>[];
  matched_rows: number;
  returned_rows: number;
  receipt: Record<string, unknown>;
};
export type ConversationSummary = {
  id: string;
  collection_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
};
export type ConversationReplay = {
  id: string;
  collection_id: string | null;
  title: string | null;
  events: ChatEvent[];
};
export type SearchHit = {
  chunk_id: string;
  document_id: string;
  content: string;
  section: string | null;
  position: number | null;
  score: number;
};
export type Citation = {
  document_id: string;
  chunk_id: string;
  anchor: string;
};
export type CollectionItem = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  document_count: number;
  created_at: string;
};
export type BatchStatus = {
  batch_id: string;
  project_id: string;
  collection_id: string | null;
  status: "queued" | "processing" | "success" | "partial" | "error";
  total: number;
  completed: number;
  failed: number;
  items: {
    filename: string;
    status: "queued" | "processing" | "success" | "error";
    document_id: string | null;
    dataset_id: string | null;
    duplicate: boolean;
    parse_status: "indexed" | "structured" | "stored" | "needs_attention" | null;
    parser: string | null;
    message: string | null;
    error: string | null;
  }[];
};
export type Lineage = {
  nodes: {
    id: string;
    type: string;
    label: string;
    meta: Record<string, unknown>;
  }[];
  edges: { from: string; to: string; relation: string }[];
};
export type ReproduceResult = {
  status: "match" | "drift";
  comparisons: {
    artifact_id: string;
    kind: string;
    old: unknown;
    new: unknown;
    within_tol: boolean;
    diff?: unknown;
  }[];
  new_run_id: string;
};
export type AttributionResult = {
  target_artifact_id: string;
  baseline: unknown;
  drifted: unknown;
  attributions: {
    dimension: string;
    contribution: number;
    direction: "up" | "down";
    detail: string;
  }[];
};
export type VerifyItem = {
  check: "citation" | "number" | "figure";
  target_anchor: string | null;
  verdict: "pass" | "fail";
  severity: "warn" | "error";
  reason: string;
  locate: string;
  label?: "entailment" | "neutral" | "contradiction" | null;
  support_score?: number | null;
  evidence_span?: string | null;
};
export type VerifyResult = {
  verdict: "pass" | "fail";
  items: VerifyItem[];
  claim_status?: "verified" | "flagged" | null;
  repaired_text?: string | null;
  iterations?: { round: number; fails: number; repair_action: string }[] | null;
};
export type MemoryItem = {
  id: string;
  layer: "episodic" | "semantic" | "skill";
  content: string;
  tags: string[];
  importance: number;
  written_at: string;
  recallable: boolean;
  source: "manual" | "conversation" | "reflection" | "agent";
};
export type SuggestionItem = {
  id: string;
  type: "hypothesis" | "literature" | "next_step";
  content: string;
  evidence: { kind: "document" | "artifact"; id: string; anchor: string }[];
};
export type SkillItem = {
  id: string;
  project_id: string | null;
  name: string;
  discipline: string | null;
  template: string;
  meta: Record<string, unknown> | null;
  intent: string;
  input_roles: Record<string, Record<string, unknown>>;
  version: number;
  origin: "local" | "builtin" | "imported" | "hub";
  package_hash: string | null;
  created_at: string;
};
export type SkillHubItem = {
  id: string;
  name: string;
  intent: string;
  discipline: string;
  version: number;
  author: string;
  input_roles: { name: string; description: string; dtype?: string; required?: boolean }[];
  tools: string[];
  outputs: string[];
  workflow: string[];
  estimated_from_scratch_tokens: number;
  package_hash: string;
};
export type SkillApplyResult = {
  skill_id: string;
  fallback_used: boolean;
  mapping: Record<string, string>;
  mapping_reason: string;
  run_id: string | null;
  status: "success" | "error";
  code: string | null;
  artifacts: Record<string, any>[];
  conversation_id: string | null;
  events: ChatEvent[];
  token_usage: {
    mapping_tokens: number;
    estimated_from_scratch_tokens: number;
    saved_tokens: number;
  };
};
export type ModelConfig = {
  provider: "deepseek" | "hunyuan" | "custom";
  base_url: string;
  analysis_model: string;
  review_model: string;
  api_key_configured: boolean;
  api_key_hint: string | null;
};
export type ModelTestResult = {
  ok: boolean;
  message: string;
  model: string;
  latency_ms: number;
};
export type RuntimeComponent = {
  key: "database" | "model" | "sandbox";
  title: string;
  state: "ready" | "action_required" | "offline";
  message: string;
  action: string | null;
};
export type RuntimeStatus = {
  state: "ready" | "degraded";
  summary: string;
  components: RuntimeComponent[];
};
export type ProjectItem = {
  id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
};
export type TimelineItem = {
  kind: "document" | "run" | "claim" | "conversation";
  title: string;
  detail: string;
  created_at: string;
  href: string | null;
  trusted: boolean;
};
export type ReviewSummary = {
  project_id: string;
  project_name: string;
  counts: {
    documents: number;
    datasets: number;
    successful_runs: number;
    failed_runs: number;
    artifacts: number;
    saved_artifacts: number;
    verified_claims: number;
    flagged_claims: number;
  };
  risks: string[];
  next_actions: string[];
};
export type QualityMetric = {
  key: string;
  title: string;
  value: number;
  total: number | null;
  ratio: number | null;
  state: "ready" | "warn" | "block";
  evidence: string;
};
export type QualityReport = {
  project_id: string;
  generated_at: string;
  ready_for_demo: boolean;
  metrics: QualityMetric[];
  blockers: string[];
  next_actions: string[];
};
export type ArtifactSummary = {
  id: string;
  run_id: string | null;
  kind: "number" | "coefficient" | "table" | "figure" | "text" | "conclusion";
  title: string | null;
  value: unknown;
  content_hash: string | null;
  saved_at: string | null;
  created_at: string;
  source_complete: boolean;
  run_status: string | null;
};
export type ArtifactListResponse = {
  items: ArtifactSummary[];
  total_count: number;
  saved_count: number;
  candidate_count: number;
};
export type ArtifactLibraryState = {
  artifact_id: string;
  saved: boolean;
  saved_at: string | null;
};
export type EvidenceExcerpt = {
  section: string | null;
  position: number | null;
  content: string;
};
export type RunReport = {
  run_id: string;
  status: string;
  created_at: string;
  code_hash: string;
  input_hash: string;
  seed: number | null;
  datasets: {
    id: string;
    name: string;
    storage_hash: string;
    schema: Record<string, unknown> | null;
  }[];
  environment: {
    python_version: string | null;
    env_hash: string | null;
    packages: string[];
  };
  artifacts: {
    id: string;
    kind: string;
    title: string | null;
    value: unknown;
  }[];
  reproduction_note: string;
};
export type RunCompare = {
  baseline_run_id: string;
  candidate_run_id: string;
  code_changed: boolean;
  input_changed: boolean;
  environment_changed: boolean;
  artifact_changes: {
    key: string;
    baseline: unknown;
    candidate: unknown;
    changed: boolean;
  }[];
};

type RequestOptions = RequestInit & { timeoutMs?: number };

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const sourceSignal = fetchInit.signal;
  let timedOut = false;
  const abortFromSource = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) abortFromSource();
  else sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchInit,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error("请求等待时间过长，已安全停止。请检查后端运行状态或网络连接后重试。");
    }
    if (sourceSignal?.aborted) throw error;
    throw new Error(
      "无法连接 ReproLab 服务。请确认后端已启动，再在设置中查看运行状态。",
    );
  } finally {
    clearTimeout(timeout);
    sourceSignal?.removeEventListener("abort", abortFromSource);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error?.message ??
        payload?.detail ??
        `请求失败 (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  projects: (includeArchived = false) =>
    request<ProjectItem[]>(`/projects?include_archived=${includeArchived}`),
  createProject: (name: string, description?: string) =>
    request<ProjectItem>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null }),
    }),
  prepareDemo: () => request<ProjectItem>("/projects/demo", { method: "POST", timeoutMs: 120_000 }),
  updateProject: (
    id: string,
    payload: { name?: string; description?: string | null },
  ) =>
    request<ProjectItem>(`/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  archiveProject: (id: string) =>
    request<ProjectItem>(`/projects/${id}/archive`, { method: "POST" }),
  restoreProject: (id: string) =>
    request<ProjectItem>(`/projects/${id}/restore`, { method: "POST" }),
  documents: (type?: string, collectionId?: string) =>
    request<DocumentItem[]>(
      `/documents?project_id=${activeProjectId()}${type ? `&type=${type}` : ""}${collectionId ? `&collection_id=${collectionId}` : ""}`,
    ),
  document: (id: string) =>
    request<DocumentDetail>(`/documents/${id}?project_id=${activeProjectId()}`),
  datasets: (collectionId?: string) =>
    request<DatasetCatalogItem[]>(
      `/datasets?project_id=${activeProjectId()}${collectionId ? `&collection_id=${collectionId}` : ""}`,
    ),
  queryDatasets: (queries: DatasetQuerySpec[]) =>
    request<{ results: DatasetQueryResult[] }>("/datasets/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: activeProjectId(), queries }),
    }),
  deleteDocument: (id: string) =>
    request(`/documents/${id}?project_id=${activeProjectId()}`, {
      method: "DELETE",
    }),
  updateDocument: (id: string, payload: { title?: string | null; collection_id?: string | null }) =>
    request<DocumentItem>(`/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: activeProjectId(), ...payload }),
    }),
  organizeDocuments: (documentIds: string[], collectionId: string | null) =>
    request<{ updated: number; collection_id: string | null }>("/documents/organize", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: activeProjectId(), document_ids: documentIds, collection_id: collectionId }),
    }),
  upload: async (file: File, collectionId?: string) => {
    const activity = beginActivity(`导入 ${file.name}`, "/knowledge");
    const body = new FormData();
    body.append("file", file);
    body.append("project_id", activeProjectId());
    if (collectionId) body.append("collection_id", collectionId);
    try {
      const result = await request<{
        id: string;
        chunks_count?: number;
        dataset_id?: string;
      }>("/documents", { method: "POST", body, timeoutMs: 300_000 });
      finishActivity(activity, "success");
      return result;
    } catch (error) {
      finishActivity(activity, "error");
      throw error;
    }
  },
  batchUpload: async (files: File[], collectionId?: string) => {
    const body = new FormData();
    files.forEach((file) =>
      body.append("files", file, file.webkitRelativePath || file.name),
    );
    body.append("project_id", activeProjectId());
    if (collectionId) body.append("collection_id", collectionId);
    return request<BatchStatus>("/documents/batch", { method: "POST", body, timeoutMs: 600_000 });
  },
  batchStatus: (batchId: string) =>
    request<BatchStatus>(
      `/documents/batch/${batchId}?project_id=${activeProjectId()}`,
    ),
  collections: () =>
    request<CollectionItem[]>(`/collections?project_id=${activeProjectId()}`),
  createCollection: (name: string, description?: string) =>
    request<CollectionItem>("/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        name,
        description: description || null,
      }),
    }),
  updateCollection: (
    id: string,
    payload: { name?: string; description?: string | null },
  ) =>
    request<CollectionItem>(`/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteCollection: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/collections/${id}`, {
      method: "DELETE",
    }),
  search: (
    query: string,
    mode: string,
    filters: Record<string, unknown>,
    collectionId?: string,
  ) =>
    request<{ hits: SearchHit[] }>("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        query,
        mode,
        filters,
        k: 8,
        collection_id: collectionId || null,
      }),
    }),
  qa: (query: string, collectionId?: string) =>
    request<{ answer: string; citations: Citation[] }>("/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        query,
        collection_id: collectionId || null,
      }),
    }),
  lineage: (artifactId: string) =>
    request<Lineage>(
      `/artifacts/${artifactId}/lineage?project_id=${activeProjectId()}`,
    ),
  artifactContentUrl: (artifactId: string) =>
    `${API_BASE.replace(/\/api\/v1$/, "")}/api/v1/artifacts/${artifactId}/content?project_id=${activeProjectId()}`,
  reproduce: (runId: string, datasetOverrides: Record<string, string> = {}) =>
    request<ReproduceResult>(`/runs/${runId}/reproduce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_overrides: datasetOverrides }),
    }),
  attributeDrift: (
    runId: string,
    datasetOverrides: Record<string, string>,
    targetArtifactId?: string,
  ) =>
    request<AttributionResult>(`/runs/${runId}/attribute-drift`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_overrides: datasetOverrides,
        target_artifact_id: targetArtifactId,
        granularity: "column",
        top_k: 5,
      }),
    }),
  verify: (
    text: string,
    checks: ("citation" | "number" | "figure")[] = [
      "citation",
      "number",
      "figure",
    ],
    repair = false,
  ) =>
    request<VerifyResult>("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        text,
        checks,
        repair,
      }),
    }),
  postConclusion: (claimText: string, anchors: string[]) =>
    request<{ document_id: string }>("/conclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        claim_text: claimText,
        anchors,
        status: "verified",
      }),
    }),
  memories: (layer?: string, query?: string) =>
    request<MemoryItem[]>(
      `/memories?project_id=${activeProjectId()}${layer ? `&layer=${layer}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}&k=20`,
    ),
  createMemory: (layer: MemoryItem["layer"], content: string, tags: string[]) =>
    request<MemoryItem>("/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        layer,
        content,
        tags,
      }),
    }),
  deleteMemory: (memoryId: string) =>
    request<{ id: string; deleted: boolean }>(`/memories/${memoryId}?project_id=${activeProjectId()}`, {
      method: "DELETE",
    }),
  suggestions: () =>
    request<SuggestionItem[]>(`/suggestions?project_id=${activeProjectId()}`),
  refreshSuggestions: () =>
    request<{ generated: number; items: SuggestionItem[] }>(
      "/suggestions/refresh",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: activeProjectId() }),
      },
    ),
  skills: (discipline?: string) =>
    request<SkillItem[]>(
      `/skills?project_id=${activeProjectId()}${discipline ? `&discipline=${encodeURIComponent(discipline)}` : ""}`,
    ),
  createSkill: (payload: Omit<SkillItem, "id" | "created_at">) =>
    request<SkillItem>("/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  harvestSkill: (
    artifactId: string,
    name: string,
    intent: string,
    discipline = "general",
  ) =>
    request<SkillItem>("/skills/from-artifact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifact_id: artifactId,
        name,
        intent,
        discipline,
      }),
    }),
  applySkill: (
    skillId: string,
    datasetIds: string[],
    conversationId?: string,
  ) =>
    request<SkillApplyResult>(`/skills/${skillId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        dataset_ids: datasetIds,
        conversation_id: conversationId,
      }),
    }),
  exportSkill: (skillId: string) =>
    request<Record<string, unknown>>(`/skills/${skillId}/export`),
  importSkill: (skillPackage: Record<string, unknown>) =>
    request<SkillItem>("/skills/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: activeProjectId(),
        package: skillPackage,
      }),
    }),
  skillHub: () => request<SkillHubItem[]>("/skills/hub"),
  importHubSkill: (hubId: string) =>
    request<SkillItem>(`/skills/hub/${hubId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: activeProjectId() }),
    }),
  modelConfig: () => request<ModelConfig>("/settings/model"),
  runtimeStatus: () => request<RuntimeStatus>("/settings/runtime"),
  timeline: () =>
    request<{ events: TimelineItem[] }>(
      `/projects/${activeProjectId()}/timeline`,
    ),
  review: () => request<ReviewSummary>(`/projects/${activeProjectId()}/review`),
  qualityReport: () =>
    request<QualityReport>(`/projects/${activeProjectId()}/quality-report`),
  artifacts: (view: "saved" | "candidates" | "all" = "saved", limit = 50) =>
    request<ArtifactListResponse>(
      `/projects/${activeProjectId()}/artifacts?view=${view}&limit=${limit}`,
    ),
  artifactLibraryState: (artifactId: string) =>
    request<ArtifactLibraryState>(`/artifacts/${artifactId}/library?project_id=${activeProjectId()}`),
  setArtifactLibraryState: (artifactId: string, saved: boolean) =>
    request<ArtifactLibraryState>(`/artifacts/${artifactId}/library`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: activeProjectId(), saved }),
    }),
  runReport: (runId: string) =>
    request<RunReport>(`/runs/${runId}/report?project_id=${activeProjectId()}`),
  downloadRunBundle: async (runId: string) => {
    const response = await fetch(
      `${API_BASE}/runs/${runId}/bundle?project_id=${activeProjectId()}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message ?? `复现包导出失败 (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reprolab-run-${runId.slice(0, 8)}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  },
  compareRuns: (runId: string, otherRunId: string) =>
    request<RunCompare>(
      `/runs/${runId}/compare?project_id=${activeProjectId()}&other_run_id=${otherRunId}`,
    ),
  documentEvidence: (documentId: string) =>
    request<{ document_id: string; excerpts: EvidenceExcerpt[] }>(
      `/documents/${documentId}/evidence?project_id=${activeProjectId()}`,
    ),
  saveModelConfig: (
    payload: Omit<ModelConfig, "api_key_configured" | "api_key_hint"> & {
      api_key?: string;
    },
  ) =>
    request<ModelConfig>("/settings/model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  testModel: () =>
    request<ModelTestResult>("/settings/model/test", { method: "POST", timeoutMs: 90_000 }),
  conversations: (collectionId?: string) =>
    request<ConversationSummary[]>(`/conversations?project_id=${activeProjectId()}${collectionId ? `&collection_id=${collectionId}` : ""}`),
  conversation: (id: string) =>
    request<ConversationReplay>(`/conversations/${id}?project_id=${activeProjectId()}`),
  deleteConversation: (id: string) =>
    request<void>(`/conversations/${id}?project_id=${activeProjectId()}`, { method: "DELETE" }),
};

export type ChatEvent = {
  event: "context" | "plan" | "thinking" | "code" | "run" | "artifact" | "message" | "error" | "done";
  data: Record<string, any>;
};

export async function streamChat(
  payload: {
    conversation_id?: string;
    collection_id?: string;
    mode?: "analysis" | "workspace";
    message: string;
    dataset_ids: string[];
    skill_id?: string;
  },
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
) {
  const activity = beginActivity("科研分析", "/analysis");
  let completed = false;
  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ project_id: activeProjectId(), ...payload }),
    });
    if (!response.ok || !response.body) {
      const error = await response.json().catch(() => null);
      throw new Error(
        error?.error?.message ??
          error?.detail ??
          `请求失败 (${response.status})`,
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const emitFrame = (frame: string) => {
      let name = "";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!name || !data) return;
      const event: ChatEvent = {
        event: name as ChatEvent["event"],
        data: JSON.parse(data),
      };
      if (event.event === "done") completed = true;
      onEvent(event);
      if (event.event === "error") {
        throw new Error(
          typeof event.data.message === "string"
            ? event.data.message
            : "分析执行失败，请稍后重试。",
        );
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      frames.forEach(emitFrame);
    }
    buffer += decoder.decode();
    if (buffer.trim()) emitFrame(buffer);
    if (!completed) {
      throw new Error("分析连接在完成前中断。已生成的中间状态仍保留，请重试或查看服务运行状态。");
    }
    finishActivity(activity, "success");
  } catch (error) {
    finishActivity(activity, (error as Error).name === "AbortError" ? "cancelled" : "error");
    throw error;
  }
}
