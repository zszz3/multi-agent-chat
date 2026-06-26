import { createContext, useCallback, useContext, useEffect, useMemo, type ReactElement } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge as ReactFlowEdge,
  type Node as ReactFlowNode,
  type NodeProps as ReactFlowNodeProps,
} from "@xyflow/react";
import type { WorkflowGraph, WorkflowGraphNode, WorkflowRunProgressItem } from "../../../../shared/types";
import { workflowCanvasLayout, type WorkflowCanvasLayoutVariant } from "./workflow-canvas-layout";

type WorkflowFlowNodeData = {
  graphNode: WorkflowGraphNode;
  layerSize: number;
};

type WorkflowFlowNode = ReactFlowNode<WorkflowFlowNodeData, "workflowNode">;
type WorkflowFlowEdge = ReactFlowEdge<Record<string, never>, "smoothstep">;

const workflowFlowNodeTypes = {
  workflowNode: WorkflowFlowNodeCard,
};

// Render callback + run progress are injected through context so they can change
// every render without forcing the laid-out node array (and thus dragged
// positions) to be rebuilt.
const WorkflowCanvasNodeContext = createContext<{
  renderNodeCard: (node: WorkflowGraphNode) => ReactElement;
  runProgressByNodeId: Map<string, WorkflowRunProgressItem>;
}>({
  renderNodeCard: () => <span />,
  runProgressByNodeId: new Map<string, WorkflowRunProgressItem>(),
});

function WorkflowFlowNodeCard({ data }: ReactFlowNodeProps<WorkflowFlowNode>) {
  const { graphNode, layerSize } = data;
  const { renderNodeCard, runProgressByNodeId } = useContext(WorkflowCanvasNodeContext);
  const runProgress = runProgressByNodeId.get(graphNode.id);
  return (
    <div
      className={`workflow-canvas-node is-${graphNode.kind} ${runProgress ? `run-${runProgress.status}` : ""}`}
      data-layer-size={layerSize}
    >
      <Handle type="target" position={Position.Left} className="workflow-canvas-handle" isConnectable={false} />
      {renderNodeCard(graphNode)}
      <Handle type="source" position={Position.Right} className="workflow-canvas-handle" isConnectable={false} />
    </div>
  );
}

function workflowLayoutFlowNodes(graph: WorkflowGraph, variant: WorkflowCanvasLayoutVariant): WorkflowFlowNode[] {
  const layout = workflowCanvasLayout(graph, variant);
  return layout.nodes.map((layoutNode) => ({
    id: layoutNode.node.id,
    type: "workflowNode",
    position: { x: layoutNode.x, y: layoutNode.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      graphNode: layoutNode.node,
      layerSize: layoutNode.layerSize,
    },
    style: {
      width: layoutNode.width,
      minHeight: layoutNode.height,
    },
  }));
}

function workflowFlowEdges(
  graph: WorkflowGraph,
  variant: WorkflowCanvasLayoutVariant,
  runProgressByNodeId: Map<string, WorkflowRunProgressItem>,
): WorkflowFlowEdge[] {
  const layout = workflowCanvasLayout(graph, variant);
  return layout.edges.map(({ edge }) => ({
    id: edge.id,
    type: "smoothstep",
    source: edge.fromNodeId,
    target: edge.toNodeId,
    animated: Boolean(runProgressByNodeId.get(edge.fromNodeId)?.status === "running" || runProgressByNodeId.get(edge.toNodeId)?.status === "running"),
    selectable: false,
    data: {},
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
    style: {
      strokeWidth: 2,
    },
  }));
}

function workflowMiniMapNodeColor(node: WorkflowFlowNode, runProgress?: WorkflowRunProgressItem): string {
  const graphNode = node.data.graphNode;
  if (runProgress?.status === "failed") return "var(--danger)";
  if (runProgress?.status === "completed") return "var(--ok)";
  if (runProgress?.status === "running") return "var(--accent)";
  if (graphNode.kind === "start") return "var(--ok)";
  if (graphNode.kind === "end") return "var(--muted)";
  return "var(--accent)";
}

export function WorkflowCanvasBoard({
  graph,
  expanded = false,
  runProgressByNodeId = new Map<string, WorkflowRunProgressItem>(),
  onExpand,
  onNodePositionChange,
  renderNodeCard,
  className = "",
}: {
  graph: WorkflowGraph;
  expanded?: boolean;
  runProgressByNodeId?: Map<string, WorkflowRunProgressItem>;
  onExpand?: () => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  renderNodeCard: (node: WorkflowGraphNode) => ReactElement;
  className?: string;
}) {
  const variant: WorkflowCanvasLayoutVariant = expanded ? "expanded" : "preview";
  const layoutNodes = useMemo(() => workflowLayoutFlowNodes(graph, variant), [graph, variant]);
  const edges = useMemo(() => workflowFlowEdges(graph, variant, runProgressByNodeId), [graph, variant, runProgressByNodeId]);
  // Controlled node state so dragged positions survive re-renders; positions are
  // only reset when the structural layout (graph / variant) changes.
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>(layoutNodes);
  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  const nodeContextValue = useMemo(() => ({ renderNodeCard, runProgressByNodeId }), [renderNodeCard, runProgressByNodeId]);
  const miniMapNodeColor = useCallback(
    (node: WorkflowFlowNode) => workflowMiniMapNodeColor(node, runProgressByNodeId.get(node.id)),
    [runProgressByNodeId],
  );

  const fitViewOptions = useMemo(
    () => ({
      padding: expanded ? 0.16 : 0.12,
      // Preview keeps nodes at a readable size: when the flow gets long, fitView
      // is clamped at minZoom instead of shrinking everything to fit, and the
      // canvas overflows so it can be panned (Dify-style) rather than squished.
      minZoom: expanded ? 0.24 : 0.82,
      maxZoom: expanded ? 1.05 : 1,
    }),
    [expanded],
  );

  return (
    <div
      className={`workflow-canvas-board workflow-graph-board ${className} ${expanded ? "is-expanded" : ""}`}
      aria-label="Workflow graph board"
      onDoubleClick={() => onExpand?.()}
    >
      <div className="workflow-canvas-viewport">
        <WorkflowCanvasNodeContext.Provider value={nodeContextValue}>
          <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
            className="workflow-react-flow-board"
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_event, node) => onNodePositionChange?.(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })}
            nodeTypes={workflowFlowNodeTypes}
            fitView
            fitViewOptions={fitViewOptions}
            minZoom={expanded ? 0.18 : 0.32}
            maxZoom={expanded ? 1.35 : 1.28}
            panOnDrag
            panOnScroll
            zoomOnScroll={expanded}
            zoomOnPinch
            zoomOnDoubleClick={false}
            nodesConnectable={false}
            nodesDraggable={Boolean(onNodePositionChange)}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            preventScrolling={expanded}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
              },
            }}
          >
            <Background gap={18} size={1.25} color="var(--workflow-canvas-dot)" />
            <Controls className="workflow-canvas-controls" position="bottom-left" fitViewOptions={fitViewOptions} showInteractive={false} />
            <MiniMap
              className="workflow-canvas-minimap"
              position="bottom-right"
              pannable
              zoomable
              nodeColor={miniMapNodeColor}
              nodeBorderRadius={8}
              bgColor="var(--panel)"
              maskColor="color-mix(in srgb, var(--panel) 42%, transparent)"
            />
          </ReactFlow>
        </WorkflowCanvasNodeContext.Provider>
      </div>
    </div>
  );
}
