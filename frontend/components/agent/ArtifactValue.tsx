import type { TimelineArtifact } from "@/lib/agentTimeline";

export function artifactKindLabel(kind: string) {
  const labels: Record<string, string> = {
    number: "数值结果",
    coefficient: "模型系数",
    table: "分析表格",
    figure: "分析图形",
    text: "分析说明",
    conclusion: "分析结论",
  };
  return labels[kind] || "分析成果";
}

function payloadOf(artifact: TimelineArtifact) {
  const value = artifact.value_json;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (artifact.kind === "table" && "data" in value) return value.data;
  if (["number", "coefficient"].includes(artifact.kind) && "value" in value) return value.value;
  if (["text", "conclusion"].includes(artifact.kind) && "text" in value) return value.text;
  return value;
}

function readable(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.map(readable).join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ArtifactValue({ artifact }: { artifact: TimelineArtifact }) {
  const payload = payloadOf(artifact);
  if (artifact.kind === "table") {
    const structured = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as { columns?: unknown[]; data?: unknown[][] }
      : undefined;
    const columns = structured?.columns;
    const rows = structured?.data
      ? structured.data
      : Array.isArray(payload)
        ? payload.map((row) => Array.isArray(row) ? row : [row])
        : [];
    if (rows.length) return (
      <div className="max-h-80 overflow-auto">
        <table className="min-w-full divide-y text-xs">
          {columns?.length ? <thead className="sticky top-0 bg-elevated"><tr>{columns.map((column, index) => <th key={index} className="whitespace-nowrap px-3 py-2 text-left font-semibold">{readable(column)}</th>)}</tr></thead> : null}
          <tbody className="divide-y">{rows.slice(0, 100).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-3 py-2 text-muted">{readable(cell)}</td>)}</tr>)}</tbody>
        </table>
        {rows.length > 100 && <p className="border-t px-3 py-2 text-xs text-muted">当前展示前 100 行，共 {rows.length} 行。</p>}
      </div>
    );
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return (
    <dl className="grid gap-2 p-4 text-sm">
      {Object.entries(payload).map(([key, value]) => <div key={key} className="flex gap-3"><dt className="shrink-0 font-medium text-muted">{key}</dt><dd>{readable(value)}</dd></div>)}
    </dl>
  );
  return <p className={`p-4 ${["number", "coefficient"].includes(artifact.kind) ? "text-2xl font-semibold text-brand" : "text-sm leading-7"}`}>{readable(payload)}</p>;
}
