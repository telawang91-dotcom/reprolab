const DRAFT_PREFIX = "reprolab-writing-draft";
const ARTIFACT_PREFIX = "reprolab-writing-artifacts";

export const writingTemplate = `# 研究报告

## 研究问题
说明本报告要回答的核心问题。

## 数据与方法
概括数据范围、处理规则和分析方法。

## 关键发现
从“可引用成果”中插入已保存的图、表或数字，再解释它对研究问题意味着什么。

## 局限与下一步
说明证据边界、潜在偏倚和下一步验证计划。`;

export function writingKeys(projectId: string) {
  return {
    draft: `${DRAFT_PREFIX}:${projectId}`,
    artifacts: `${ARTIFACT_PREFIX}:${projectId}`,
  };
}

export function normalizeWritingDraft(draft: string | null) {
  if (!draft?.trim()) return writingTemplate;
  const legacyPlaceholder = draft.includes("在此撰写带可追溯锚点的结论")
    || draft.includes("行内公式示例")
    || draft.includes("\\beta = 0.083");
  if (!legacyPlaceholder) return draft;
  const anchors = Array.from(draft.matchAll(/⟦art_[0-9a-fA-F]{4}⟧/g), (match) => match[0]);
  return anchors.length
    ? `${writingTemplate}\n\n### 待整理的已有成果\n${[...new Set(anchors)].map((anchor) => `- ${anchor}`).join("\n")}`
    : writingTemplate;
}

export function readWritingState(projectId: string) {
  const keys = writingKeys(projectId);
  // Writing is project-scoped. Never fall back to old global keys: doing so
  // leaks example text and evidence mappings into unrelated research folders.
  const storedDraft = localStorage.getItem(keys.draft);
  const draft = normalizeWritingDraft(storedDraft);
  if (draft !== storedDraft) localStorage.setItem(keys.draft, draft);
  const rawArtifacts = localStorage.getItem(keys.artifacts);
  let artifacts: Record<string, string> = {};
  try { artifacts = rawArtifacts ? JSON.parse(rawArtifacts) : {}; } catch { artifacts = {}; }
  return { draft, artifacts, keys };
}

export function rememberWritingArtifact(projectId: string, artifact: { artifact_id: string; title?: string | null }) {
  const state = readWritingState(projectId);
  const code = artifact.artifact_id.slice(0, 4).toLowerCase();
  state.artifacts[code] = artifact.artifact_id;
  localStorage.setItem(state.keys.artifacts, JSON.stringify(state.artifacts));
  return { ...state, code, anchor: `⟦art_${code}⟧` };
}

export function addArtifactToWriting(projectId: string, artifact: { artifact_id: string; title?: string | null }) {
  return addArtifactsToWriting(projectId, [artifact]);
}

export function addArtifactsToWriting(projectId: string, artifacts: { artifact_id: string; title?: string | null }[]) {
  const state = readWritingState(projectId);
  let draft = state.draft;
  let added = 0;
  for (const artifact of artifacts) {
    const code = artifact.artifact_id.slice(0, 4).toLowerCase();
    const anchor = `⟦art_${code}⟧`;
    state.artifacts[code] = artifact.artifact_id;
    if (draft.includes(anchor)) continue;
    const line = `${artifact.title || "分析成果"} ${anchor}`;
    const heading = "## 关键发现";
    const insertion = `${heading}\n${line}`;
    draft = draft.includes(heading)
      ? draft.replace(heading, insertion)
      : `${draft.trim()}\n\n${insertion}`;
    added += 1;
  }
  localStorage.setItem(state.keys.artifacts, JSON.stringify(state.artifacts));
  localStorage.setItem(state.keys.draft, draft);
  return { draft, added };
}
