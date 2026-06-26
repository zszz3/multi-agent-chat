import { workflowGraphDisplayLayers } from "../../../../shared/workflow-graph";
import type { WorkflowGraph, WorkflowGraphNode } from "../../../../shared/types";

export interface WorkflowCanvasNodeLayout {
  node: WorkflowGraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
  layerIndex: number;
  layerSize: number;
}

export interface WorkflowCanvasEdgeLayout {
  edge: WorkflowGraph["edges"][number];
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface WorkflowCanvasLayout {
  nodes: WorkflowCanvasNodeLayout[];
  edges: WorkflowCanvasEdgeLayout[];
  width: number;
  height: number;
}

export type WorkflowCanvasLayoutVariant = "preview" | "expanded";

const WORKFLOW_CANVAS_DIMENSIONS: Record<
  WorkflowCanvasLayoutVariant,
  {
    nodeWidth: number;
    nodeHeight: number;
    terminalWidth: number;
    terminalHeight: number;
    layerGap: number;
    nodeGap: number;
    rowGap: number;
    padding: number;
    maxColumns: number;
  }
> = {
  preview: {
    nodeWidth: 192,
    nodeHeight: 72,
    terminalWidth: 112,
    terminalHeight: 48,
    layerGap: 46,
    nodeGap: 16,
    rowGap: 78,
    padding: 28,
    maxColumns: 4,
  },
  expanded: {
    nodeWidth: 188,
    nodeHeight: 112,
    terminalWidth: 112,
    terminalHeight: 64,
    layerGap: 120,
    nodeGap: 30,
    rowGap: 128,
    padding: 88,
    maxColumns: 5,
  },
};

export function workflowCanvasLayout(graph: WorkflowGraph, variant: WorkflowCanvasLayoutVariant = "preview"): WorkflowCanvasLayout {
  const dimensions = WORKFLOW_CANVAS_DIMENSIONS[variant];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const layers = workflowGraphDisplayLayers(graph)
    .map((layer) => layer.map((nodeId) => nodeById.get(nodeId)).filter((node): node is WorkflowGraphNode => Boolean(node)))
    .filter((layer) => layer.length > 0);
  // Wrap the layer sequence into rows so long flows stay close to the visible
  // area instead of stretching into one very wide line. Each DAG layer keeps its
  // own column; rows fill left-to-right and the count is balanced so the board
  // ends up roughly square.
  const layerCount = layers.length;
  const rowCount = Math.max(1, Math.ceil(layerCount / dimensions.maxColumns));
  const columnsPerRow = Math.max(1, Math.ceil(layerCount / rowCount));
  const layerHeight = (layer: WorkflowGraphNode[]): number => {
    const heights = layer.map((node) => (node.kind === "agent" ? dimensions.nodeHeight : dimensions.terminalHeight));
    return heights.reduce((sum, height) => sum + height, 0) + Math.max(0, layer.length - 1) * dimensions.nodeGap;
  };

  const rows: WorkflowGraphNode[][][] = [];
  for (let index = 0; index < layerCount; index += columnsPerRow) {
    rows.push(layers.slice(index, index + columnsPerRow));
  }

  const positionedNodes = new Map<string, WorkflowCanvasNodeLayout>();
  let maxX = dimensions.padding;
  let maxY = dimensions.padding;
  let rowTop = dimensions.padding;

  rows.forEach((row, rowIndex) => {
    const rowHeight = Math.max(dimensions.nodeHeight, ...row.map(layerHeight));
    row.forEach((layer, columnIndex) => {
      const x = dimensions.padding + columnIndex * (dimensions.nodeWidth + dimensions.layerGap);
      let y = rowTop + Math.max(0, (rowHeight - layerHeight(layer)) / 2);
      layer.forEach((node) => {
        const width = node.kind === "agent" ? dimensions.nodeWidth : dimensions.terminalWidth;
        const height = node.kind === "agent" ? dimensions.nodeHeight : dimensions.terminalHeight;
        // Honor an explicit position (set by agents via MCP or by user drags);
        // fall back to the auto wrapping slot.
        const nodeX = node.position?.x ?? x;
        const nodeY = node.position?.y ?? y;
        positionedNodes.set(node.id, { node, x: nodeX, y: nodeY, width, height, layerIndex: rowIndex * columnsPerRow + columnIndex, layerSize: layer.length });
        maxX = Math.max(maxX, nodeX + width + dimensions.padding);
        maxY = Math.max(maxY, nodeY + height + dimensions.padding);
        y += height + dimensions.nodeGap;
      });
    });
    rowTop += rowHeight + dimensions.rowGap;
  });

  const edges = graph.edges
    .map((edge) => {
      const fromNode = positionedNodes.get(edge.fromNodeId);
      const toNode = positionedNodes.get(edge.toNodeId);
      if (!fromNode || !toNode) return undefined;
      return {
        edge,
        from: { x: fromNode.x + fromNode.width, y: fromNode.y + fromNode.height / 2 },
        to: { x: toNode.x, y: toNode.y + toNode.height / 2 },
      };
    })
    .filter((item): item is WorkflowCanvasEdgeLayout => Boolean(item));

  return {
    nodes: [...positionedNodes.values()],
    edges,
    width: Math.max(maxX, dimensions.padding * 2 + dimensions.nodeWidth),
    height: Math.max(maxY, dimensions.padding * 2 + dimensions.nodeHeight),
  };
}
