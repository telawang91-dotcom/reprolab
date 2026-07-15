import type { ChatEvent } from "./api";

export type TimelineArtifact = {
  artifact_id: string;
  kind: string;
  title?: string | null;
  value_json?: unknown;
  figure_url?: string | null;
  anchor?: string;
};

export type TimelineRun = { run_id?: string; status: "success" | "error"; stdout?: string };
export type TimelineAttempt = {
  id: string;
  code?: string;
  lang?: string;
  reasoning: string[];
  run?: TimelineRun;
  artifacts: TimelineArtifact[];
  status: "working" | "success" | "error";
};
export type TimelineStep = {
  id: string;
  title: string;
  rationale?: string;
  implicit?: boolean;
  notes: string[];
  attempts: TimelineAttempt[];
  status: "pending" | "working" | "repairing" | "success";
};
export type AgentConclusion = { text: string; citations: string[] };
export type AgentToolReceipt = {
  name: string;
  label: string;
  status: "used" | "empty";
  detail: string;
  count: number;
  items?: { id: string; content: string; layer: string }[];
};
export type AgentContext = { id: string; tools: AgentToolReceipt[] };
export type AgentTimeline = { steps: TimelineStep[]; contexts: AgentContext[]; conclusion?: AgentConclusion; conclusions: AgentConclusion[]; activeStepId?: string };

const emptyTimeline = (): AgentTimeline => ({ steps: [], contexts: [], conclusions: [] });
const id = (prefix: string, index: number) => `${prefix}-${index + 1}`;
const text = (value: unknown) => typeof value === "string" ? value : "";

function implicitStep(state: AgentTimeline): TimelineStep {
  return { id: id("step", state.steps.length), title: `执行步骤 ${state.steps.length + 1}`, implicit: true, notes: [], attempts: [], status: "pending" };
}

function currentIndex(state: AgentTimeline, advance = false) {
  const active = state.activeStepId ? state.steps.findIndex((step) => step.id === state.activeStepId) : -1;
  if (active >= 0 && (!advance || state.steps[active].status !== "success")) return active;
  const working = state.steps.findIndex((step) => step.status === "working" || step.status === "repairing");
  if (working >= 0) return working;
  return state.steps.findIndex((step) => step.status === "pending");
}

function withCurrent(state: AgentTimeline, update: (step: TimelineStep) => TimelineStep, advance = false) {
  let steps = [...state.steps];
  let index = currentIndex(state, advance);
  if (index < 0) { steps.push(implicitStep(state)); index = steps.length - 1; }
  steps[index] = update(steps[index]);
  return { ...state, steps, activeStepId: steps[index].id };
}

export function reduceAgentTimeline(events: readonly ChatEvent[] | null | undefined): AgentTimeline {
  try {
    return (Array.isArray(events) ? events : []).reduce<AgentTimeline>((state, event) => {
      if (!event || typeof event !== "object" || !event.data || typeof event.data !== "object") return state;
      if (event.event === "context") {
        const raw: unknown[] = Array.isArray(event.data.tools) ? event.data.tools : [];
        const tools = raw.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          const name = text(record.name);
          const label = text(record.label);
          if (!name || !label) return [];
          const rawItems = Array.isArray(record.items) ? record.items : [];
          return [{
            name,
            label,
            status: record.status === "used" ? "used" as const : "empty" as const,
            detail: text(record.detail),
            count: typeof record.count === "number" ? record.count : 0,
            items: rawItems.flatMap((entry) => entry && typeof entry === "object" ? [{
              id: text((entry as Record<string, unknown>).id),
              content: text((entry as Record<string, unknown>).content),
              layer: text((entry as Record<string, unknown>).layer),
            }] : []),
          }];
        });
        return tools.length ? { ...state, contexts: [...state.contexts, { id: `context-${state.contexts.length + 1}`, tools }] } : state;
      }
      if (event.event === "plan") {
        const raw: unknown[] = Array.isArray(event.data.steps) ? event.data.steps : [];
        if (!raw.length) return state;
        const offset = state.steps.length;
        const next = raw.map((step, index) => { const record = step && typeof step === "object" ? step as Record<string, unknown> : undefined; return { id: id("step", offset + index), title: typeof step === "string" ? step : text(record?.title) || `步骤 ${offset + index + 1}`, rationale: text(record?.rationale) || undefined, notes: [], attempts: [], status: "pending" as const }; });
        return { ...state, activeStepId: next[0]?.id, steps: [...state.steps, ...next] };
      }
      if (event.event === "thinking") return withCurrent(state, (step) => {
        const note = text(event.data.text);
        const attempts = [...step.attempts];
        if (attempts.length) { const last = attempts.length - 1; attempts[last] = { ...attempts[last], reasoning: note ? [...attempts[last].reasoning, note] : attempts[last].reasoning }; }
        return { ...step, notes: attempts.length || !note ? step.notes : [...step.notes, note], attempts, status: step.status === "pending" ? "working" : step.status };
      });
      if (event.event === "code") return withCurrent(state, (step) => {
        const repairing = step.attempts.some((attempt) => attempt.status === "error");
        const attempt: TimelineAttempt = { id: `${step.id}-attempt-${step.attempts.length + 1}`, code: text(event.data.code), lang: text(event.data.lang) || "python", reasoning: [], artifacts: [], status: "working" };
        return { ...step, attempts: [...step.attempts, attempt], status: repairing ? "repairing" : "working" };
      }, true);
      if (event.event === "run") return withCurrent(state, (step) => {
        const attempts = [...step.attempts];
        if (!attempts.length) attempts.push({ id: `${step.id}-attempt-1`, reasoning: [], artifacts: [], status: "working" });
        const last = attempts.length - 1;
        const success = event.data.status === "success";
        attempts[last] = { ...attempts[last], run: { run_id: text(event.data.run_id) || undefined, status: success ? "success" : "error", stdout: text(event.data.stdout) || undefined }, status: success ? "success" : "error" };
        return { ...step, attempts, status: success ? "success" : "repairing" };
      });
      if (event.event === "artifact") return withCurrent(state, (step) => {
        const attempts = [...step.attempts];
        if (!attempts.length) attempts.push({ id: `${step.id}-attempt-1`, reasoning: [], artifacts: [], status: "working" });
        const last = attempts.length - 1;
        attempts[last] = { ...attempts[last], artifacts: [...attempts[last].artifacts, event.data as TimelineArtifact] };
        return { ...step, attempts };
      });
      if (event.event === "message" && !event.data.user) { const conclusion = { text: text(event.data.text), citations: Array.isArray(event.data.citations) ? (event.data.citations as unknown[]).filter((item): item is string => typeof item === "string") : [] }; return { ...state, conclusion, conclusions: [...state.conclusions, conclusion] }; }
      return state;
    }, emptyTimeline());
  } catch {
    return emptyTimeline();
  }
}
