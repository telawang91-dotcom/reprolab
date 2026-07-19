"use client";
import dagre from "@dagrejs/dagre";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, Edge, MiniMap, Node, NodeMouseHandler, ReactFlowProvider, useEdgesState, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import { LineageNode, type LineageNodeData } from "./LineageNode";
import { NodeDetailPanel } from "./NodeDetailPanel";
import type { LineageEdge, LineageNode as SourceNode } from "./types";

const nodeTypes = { lineageNode: LineageNode };
const nodeColors: Record<string, string> = { dataset: "#4F46E5", run: "#2563EB", artifact: "#059669", claim: "#D97706", document: "#64748B" };
const relationLabels: Record<string, string> = { reads: "读取", produces: "生成", supports: "支持", cites: "引用" };

export function layoutGraph(sourceNodes: SourceNode[], sourceEdges: LineageEdge[]): { nodes: Node<LineageNodeData>[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 55, marginx: 40, marginy: 40 });
  sourceNodes.forEach((node) => graph.setNode(node.id, { width: 190, height: 88 }));
  sourceEdges.forEach((edge) => graph.setEdge(edge.from, edge.to)); dagre.layout(graph);
  return {
    nodes: sourceNodes.map((node) => { const point = graph.node(node.id); return { id: node.id, type: "lineageNode", position: { x: point.x - 95, y: point.y - 44 }, data: { label: node.label, type: node.type, meta: node.meta } }; }),
    edges: sourceEdges.map((edge, index) => ({ id: `edge-${index}-${edge.from}-${edge.to}`, source: edge.from, target: edge.to, type: "smoothstep", label: relationLabels[edge.relation] ?? edge.relation, labelStyle: { fontSize: 10, fill: "#64748B" }, style: { stroke: "#94A3B8", strokeWidth: 1.5 } }))
  };
}

export function upstreamSequence(startId: string, edges: LineageEdge[]): { nodes: string[]; edges: string[] } {
  const queue = [startId]; const seen = new Set<string>(); const nodeOrder: string[] = []; const edgeOrder: string[] = [];
  while (queue.length) { const current = queue.shift()!; if (seen.has(current)) continue; seen.add(current); nodeOrder.push(current);
    edges.forEach((edge, index) => { if (edge.to === current || (edge.from === current && edge.relation === "cites")) { edgeOrder.push(`edge-${index}-${edge.from}-${edge.to}`); const next = edge.to === current ? edge.from : edge.to; if (!seen.has(next)) queue.push(next); } }); }
  return { nodes: nodeOrder, edges: edgeOrder };
}

function GraphInner({ sourceNodes, sourceEdges }: { sourceNodes: SourceNode[]; sourceEdges: LineageEdge[] }) {
  const initial = useMemo(() => layoutGraph(sourceNodes, sourceEdges), [sourceNodes, sourceEdges]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes); const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selected, setSelected] = useState<SourceNode>(); const timers = useRef<number[]>([]);
  useEffect(() => { setNodes(initial.nodes); setEdges(initial.edges); }, [initial, setEdges, setNodes]);
  const reset = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; setNodes((items) => items.map((node) => ({ ...node, data: { ...node.data, active: false, dimmed: false } }))); setEdges((items) => items.map((edge) => ({ ...edge, animated: false, style: { ...edge.style, stroke: "#94A3B8", strokeWidth: 1.5 } }))); }, [setEdges, setNodes]);
  const highlight = useCallback((node: SourceNode) => { reset(); const sequence = upstreamSequence(node.id, sourceEdges); const chain = new Set(sequence.nodes); setNodes((items) => items.map((item) => ({ ...item, data: { ...item.data, dimmed: !chain.has(item.id) } }))); sequence.nodes.forEach((id, index) => timers.current.push(window.setTimeout(() => setNodes((items) => items.map((item) => item.id === id ? { ...item, data: { ...item.data, active: true } } : item)), index * 120))); sequence.edges.forEach((id, index) => timers.current.push(window.setTimeout(() => setEdges((items) => items.map((edge) => edge.id === id ? { ...edge, animated: true, style: { ...edge.style, stroke: "#2563EB", strokeWidth: 2.5 } } : edge)), (index + 1) * 120))); }, [reset, setEdges, setNodes, sourceEdges]);
  const onNodeClick: NodeMouseHandler = useCallback((_, flowNode) => { const node = sourceNodes.find((item) => item.id === flowNode.id); if (!node) return; setSelected(node); highlight(node); }, [highlight, sourceNodes]);
  return <div className="relative h-full w-full"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} onPaneClick={() => { setSelected(undefined); reset(); }} fitView minZoom={0.2} maxZoom={2}><Background color="#CBD5E1" gap={24} size={1}/><MiniMap pannable zoomable nodeColor={(node) => nodeColors[String(node.data.type)] ?? "#94A3B8"}/><Controls showInteractive={false}/></ReactFlow>{selected && <NodeDetailPanel node={selected} onClose={() => setSelected(undefined)}/>}</div>;
}

export function LineageGraph(props: { sourceNodes: SourceNode[]; sourceEdges: LineageEdge[] }) { return <ReactFlowProvider><GraphInner {...props}/></ReactFlowProvider>; }
