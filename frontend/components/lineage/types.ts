export type LineageNode = { id: string; type: "dataset" | "run" | "artifact" | "claim" | "document"; label: string; meta: Record<string, any> };
export type LineageEdge = { from: string; to: string; relation: "reads" | "produces" | "supports" | "cites" };

