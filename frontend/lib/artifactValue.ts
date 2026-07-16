export function unwrapArtifactValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  for (const key of ["value", "data", "figure_data", "text"] as const) {
    if (key in record) return record[key];
  }
  return value;
}
