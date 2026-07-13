const LEGACY_DRAFT = "reprolab-writing-draft";
const LEGACY_ARTIFACTS = "reprolab-writing-artifacts";

export function writingKeys(projectId: string) {
  return {
    draft: `${LEGACY_DRAFT}:${projectId}`,
    artifacts: `${LEGACY_ARTIFACTS}:${projectId}`,
  };
}

export function readWritingState(projectId: string) {
  const keys = writingKeys(projectId);
  const draft = localStorage.getItem(keys.draft) ?? localStorage.getItem(LEGACY_DRAFT);
  const artifacts = localStorage.getItem(keys.artifacts) ?? localStorage.getItem(LEGACY_ARTIFACTS);
  if (draft !== null && localStorage.getItem(keys.draft) === null) localStorage.setItem(keys.draft, draft);
  if (artifacts !== null && localStorage.getItem(keys.artifacts) === null) localStorage.setItem(keys.artifacts, artifacts);
  let artifactMap: Record<string, string> = {};
  try { artifactMap = artifacts ? JSON.parse(artifacts) : {}; } catch { artifactMap = {}; }
  return { draft, artifacts: artifactMap, keys };
}

export function addArtifactToWriting(projectId: string, artifact: { artifact_id: string; title?: string | null }) {
  const state = readWritingState(projectId);
  const code = artifact.artifact_id.slice(0, 4).toLowerCase();
  state.artifacts[code] = artifact.artifact_id;
  localStorage.setItem(state.keys.artifacts, JSON.stringify(state.artifacts));
  const base = state.draft || "# 研究结论\n";
  if (!base.includes(`⟦art_${code}⟧`)) localStorage.setItem(state.keys.draft, `${base.trim()}\n\n${artifact.title || "分析结果"} ⟦art_${code}⟧`);
}
