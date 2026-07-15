"use client";

import { ChevronDown, Database, Filter, Loader2, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, type DatasetFilter, type DatasetQueryResult, type DocumentDetail } from "@/lib/api";


const operators: { value: DatasetFilter["op"]; label: string }[] = [
  { value: "contains", label: "包含" },
  { value: "eq", label: "等于" },
  { value: "ne", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "大于等于" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "小于等于" },
  { value: "is_null", label: "为空" },
  { value: "not_null", label: "不为空" },
];

export function DatasetInspector({ datasetId, schema }: { datasetId: string; schema: NonNullable<DocumentDetail["schema_json"]> }) {
  const sheets = schema.sheets || [];
  const [sheet, setSheet] = useState(schema.default_sheet || sheets[0]?.name || "");
  const availableColumns = useMemo(
    () => sheets.find((item) => item.name === sheet)?.columns || schema.columns || [],
    [schema.columns, sheet, sheets],
  );
  const [search, setSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterOp, setFilterOp] = useState<DatasetFilter["op"]>("contains");
  const [filterValue, setFilterValue] = useState("");
  const [result, setResult] = useState<DatasetQueryResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (filterColumn && !availableColumns.some((item) => item.name === filterColumn)) setFilterColumn("");
  }, [availableColumns, filterColumn]);

  async function runQuery() {
    setLoading(true);
    setError("");
    const unary = filterOp === "is_null" || filterOp === "not_null";
    const filters: DatasetFilter[] = filterColumn && (unary || filterValue.trim())
      ? [{ column: filterColumn, op: filterOp, ...(unary ? {} : { value: filterValue.trim() }) }]
      : [];
    try {
      const response = await api.queryDatasets([{
        dataset_id: datasetId,
        sheet: sheet || null,
        search: search.trim() || null,
        filters,
        limit: 50,
      }]);
      setResult(response.results[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "数据查询失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void runQuery(); }, [datasetId, sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  return <section className="mt-6 overflow-hidden rounded-apple border bg-canvas">
    <div className="flex flex-wrap items-center gap-2 border-b bg-surface px-4 py-3">
      <span className="grid h-8 w-8 place-items-center rounded-appleSm bg-brand/10 text-brand"><Database size={15} /></span>
      <div className="mr-auto"><strong className="block text-sm">结构化数据查询</strong><span className="block text-[11px] text-muted">只读 · 固定运算符 · 项目隔离</span></div>
      {sheets.length > 1 && <label className="relative"><span className="sr-only">工作表</span><select value={sheet} onChange={(event) => setSheet(event.target.value)} className="input h-9 appearance-none py-0 pl-3 pr-8 text-xs">{sheets.map((item) => <option key={item.name}>{item.name}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-3 top-3 text-subtle" /></label>}
    </div>
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        <label className="flex h-10 min-w-48 flex-1 items-center gap-2 rounded-full border bg-surface px-3 focus-within:border-brand"><Search size={14} className="text-subtle"/><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runQuery()} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="在当前数据表中搜索" /></label>
        <select aria-label="筛选字段" value={filterColumn} onChange={(event) => setFilterColumn(event.target.value)} className="input h-10 min-w-28 py-0 text-xs"><option value="">筛选字段</option>{availableColumns.map((item) => <option key={item.name}>{item.name}</option>)}</select>
        <select aria-label="筛选条件" value={filterOp} onChange={(event) => setFilterOp(event.target.value as DatasetFilter["op"])} className="input h-10 py-0 text-xs">{operators.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        {!["is_null", "not_null"].includes(filterOp) && <input aria-label="筛选值" value={filterValue} onChange={(event) => setFilterValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runQuery()} className="input h-10 min-w-24 flex-1 py-0 text-xs" placeholder="筛选值" />}
        <button onClick={() => void runQuery()} disabled={loading} className="btn-primary h-10 px-4">{loading ? <Loader2 size={14} className="animate-spin"/> : <Filter size={14}/>}查询</button>
      </div>
      {error && <div role="alert" className="status-error">{error}</div>}
      {loading && !result ? <div className="h-32 animate-pulse rounded-apple bg-ink/[.05]"/> : result && <>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted"><ShieldCheck size={12} className="text-status-ok"/><span>{result.matched_rows} 行匹配 · 当前返回 {result.returned_rows} 行</span><span className="ml-auto font-mono">sha256:{result.storage_hash.slice(0, 12)}…</span></div>
        <div className="max-h-72 overflow-auto rounded-apple border bg-surface">
          <table className="min-w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-canvas"><tr>{result.columns.map((column) => <th key={column.name} className="whitespace-nowrap border-b px-3 py-2 font-semibold"><span>{column.name}</span><span className="ml-1 font-normal text-subtle">{column.dtype}</span></th>)}</tr></thead><tbody className="divide-y">{result.rows.map((row, index) => <tr key={index} className="hover:bg-ink/[.025]">{result.columns.map((column) => <td key={column.name} className="max-w-64 whitespace-nowrap px-3 py-2 font-mono text-[11px]">{formatCell(row[column.name])}</td>)}</tr>)}</tbody></table>
          {!result.rows.length && <div className="grid h-24 place-items-center text-xs text-muted">没有符合条件的记录</div>}
        </div>
      </>}
    </div>
  </section>;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
