export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
export const DEMO_PROJECT_ID = "00000000-0000-0000-0000-000000000101";

export type DocumentItem = {
  id: string; type: "paper" | "note" | "code" | "other"; filename: string;
  title: string | null; year: number | null; created_at: string;
};
export type DocumentDetail = DocumentItem & {
  project_id: string; storage_hash: string; authors: string[] | null; doi: string | null;
  source_url: string | null; metadata: Record<string, unknown> | null; chunks_count: number;
  dataset_id: string | null; schema_json: { columns?: { name: string; dtype: string }[]; row_count?: number; column_count?: number } | null;
};
export type SearchHit = { chunk_id: string; document_id: string; content: string; section: string | null; position: number | null; score: number };
export type Citation = { document_id: string; chunk_id: string; anchor: string };
export type Lineage = { nodes: { id: string; type: string; label: string; meta: Record<string, unknown> }[]; edges: { from: string; to: string; relation: string }[] };
export type ReproduceResult = {
  status: "match" | "drift";
  comparisons: { artifact_id: string; kind: string; old: unknown; new: unknown; within_tol: boolean; diff?: unknown }[];
  new_run_id: string;
};
export type AttributionResult = { target_artifact_id: string; baseline: unknown; drifted: unknown; attributions: { dimension: string; contribution: number; direction: "up" | "down"; detail: string }[] };
export type VerifyItem = { check: "citation" | "number" | "figure"; target_anchor: string | null; verdict: "pass" | "fail"; severity: "warn" | "error"; reason: string; locate: string; label?: "entailment" | "neutral" | "contradiction" | null; support_score?: number | null; evidence_span?: string | null };
export type VerifyResult = { verdict: "pass" | "fail"; items: VerifyItem[]; claim_status?: "verified" | "flagged" | null; repaired_text?: string | null; iterations?: { round: number; fails: number; repair_action: string }[] | null };
export type MemoryItem = { id: string; layer: "episodic" | "semantic" | "skill"; content: string; tags: string[]; importance: number; written_at: string };
export type SuggestionItem = { id: string; type: "hypothesis" | "literature" | "next_step"; content: string; evidence: { kind: "document" | "artifact"; id: string; anchor: string }[] };
export type SkillItem = { id: string; project_id: string | null; name: string; discipline: string | null; template: string; meta: Record<string, unknown> | null; created_at: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? payload?.detail ?? `请求失败 (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  documents: (type?: string) => request<DocumentItem[]>(`/documents?project_id=${DEMO_PROJECT_ID}${type ? `&type=${type}` : ""}`),
  document: (id: string) => request<DocumentDetail>(`/documents/${id}`),
  deleteDocument: (id: string) => request(`/documents/${id}`, { method: "DELETE" }),
  upload: async (file: File) => {
    const body = new FormData(); body.append("file", file); body.append("project_id", DEMO_PROJECT_ID);
    return request<{ id: string; chunks_count?: number; dataset_id?: string }>("/documents", { method: "POST", body });
  },
  search: (query: string, mode: string, filters: Record<string, unknown>) => request<{ hits: SearchHit[] }>("/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: DEMO_PROJECT_ID, query, mode, filters, k: 8 })
  }),
  qa: (query: string) => request<{ answer: string; citations: Citation[] }>("/qa", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: DEMO_PROJECT_ID, query })
  }),
  lineage: (artifactId: string) => request<Lineage>(`/artifacts/${artifactId}/lineage`),
  reproduce: (runId: string, datasetOverrides: Record<string, string> = {}) => request<ReproduceResult>(`/runs/${runId}/reproduce`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_overrides: datasetOverrides })
  }),
  attributeDrift: (runId: string, datasetOverrides: Record<string, string>, targetArtifactId?: string) => request<AttributionResult>(`/runs/${runId}/attribute-drift`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_overrides: datasetOverrides, target_artifact_id: targetArtifactId, granularity: "column", top_k: 5 })
  }),
  verify: (text: string, checks: ("citation" | "number" | "figure")[] = ["citation", "number", "figure"], repair = false) => request<VerifyResult>("/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: DEMO_PROJECT_ID, text, checks, repair })
  }),
  postConclusion: (claimText: string, anchors: string[]) => request<{ document_id: string }>("/conclusions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: DEMO_PROJECT_ID, claim_text: claimText, anchors, status: "verified" })
  }),
  memories: (layer?: string, query?: string) => request<MemoryItem[]>(
    `/memories?project_id=${DEMO_PROJECT_ID}${layer ? `&layer=${layer}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}&k=20`
  ),
  createMemory: (layer: MemoryItem["layer"], content: string, tags: string[]) => request<MemoryItem>("/memories", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: DEMO_PROJECT_ID, layer, content, tags })
  }),
  suggestions: () => request<SuggestionItem[]>(`/suggestions?project_id=${DEMO_PROJECT_ID}`),
  refreshSuggestions: () => request<{ generated: number; items: SuggestionItem[] }>("/suggestions/refresh", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: DEMO_PROJECT_ID })
  }),
  skills: (discipline?: string) => request<SkillItem[]>(`/skills?project_id=${DEMO_PROJECT_ID}${discipline ? `&discipline=${encodeURIComponent(discipline)}` : ""}`),
  createSkill: (payload: Omit<SkillItem, "id" | "created_at">) => request<SkillItem>("/skills", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  })
};

export type ChatEvent = { event: "plan" | "thinking" | "code" | "run" | "artifact" | "message" | "done"; data: Record<string, any> };

export async function streamChat(
  payload: { conversation_id?: string; message: string; dataset_ids: string[]; skill_id?: string },
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal
) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ project_id: DEMO_PROJECT_ID, ...payload })
  });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? error?.detail ?? `请求失败 (${response.status})`);
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
    for (const frame of frames) {
      let name = ""; let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (name && data) onEvent({ event: name as ChatEvent["event"], data: JSON.parse(data) });
    }
  }
}
