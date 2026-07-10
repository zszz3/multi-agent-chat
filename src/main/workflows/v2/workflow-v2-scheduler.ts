import type {
  WorkflowV2NodeExecutionState,
  WorkflowV2RunNodeState,
  WorkflowV2RunState,
} from "../../../shared/workflow-v2/state";

export interface WorkflowV2NodeStateTransition {
  nodeId: string;
  status: Extract<WorkflowV2NodeExecutionState, "running" | "completed" | "failed">;
  now?: number;
  error?: string;
}

export function listWorkflowV2RunnableNodeIds(runState: WorkflowV2RunState): string[] {
  if (runState.status !== "running") return [];

  const runningNodes = orderedNodes(runState).filter((node) => node.status === "running");
  const availableSlots = runState.maxParallelNodes - runningNodes.length;
  if (availableSlots <= 0) return [];

  const reservedLocks = new Set(runningNodes.flatMap((node) => node.resourceLocks));
  const runnable: string[] = [];

  for (const node of orderedNodes(runState)) {
    if (node.status !== "ready") continue;
    if (node.resourceLocks.some((lock) => reservedLocks.has(lock))) continue;
    runnable.push(node.nodeId);
    for (const lock of node.resourceLocks) reservedLocks.add(lock);
    if (runnable.length >= availableSlots) break;
  }

  return runnable;
}

export function transitionWorkflowV2NodeState(
  runState: WorkflowV2RunState,
  transition: WorkflowV2NodeStateTransition,
): WorkflowV2RunState {
  const target = runState.nodes[transition.nodeId];
  if (!target) throw new Error(`Workflow V2 run node ${transition.nodeId} was not found.`);

  const nextNodes = cloneNodes(runState.nodes);
  const nextTarget = nextNodes[transition.nodeId]!;
  const now = transition.now ?? Date.now();

  if (transition.status === "running") {
    nextTarget.status = "running";
    nextTarget.attempt += 1;
    nextTarget.startedAt = now;
    delete nextTarget.finishedAt;
    delete nextTarget.lastError;
  } else if (transition.status === "completed") {
    nextTarget.status = "completed";
    nextTarget.finishedAt = now;
    nextTarget.blockedBy = [];
    delete nextTarget.lastError;
  } else {
    nextTarget.status = "failed";
    nextTarget.finishedAt = now;
    nextTarget.lastError = transition.error ?? "Workflow V2 node failed.";
  }

  for (const nodeId of runState.nodeOrder) {
    if (nodeId === transition.nodeId) continue;
    const node = nextNodes[nodeId]!;
    if (node.status === "running" || node.status === "completed" || node.status === "failed") continue;

    const blockedBy = node.dependsOn.filter((dependencyNodeId) => nextNodes[dependencyNodeId]!.status !== "completed");
    node.blockedBy = blockedBy;
    node.status = blockedBy.length === 0 ? "ready" : "blocked";
  }

  return {
    ...runState,
    status: deriveWorkflowV2RunStatus(nextNodes),
    nodes: nextNodes,
  };
}

function deriveWorkflowV2RunStatus(nodes: Record<string, WorkflowV2RunNodeState>): WorkflowV2RunState["status"] {
  const nodeStates = Object.values(nodes).map((node) => node.status);
  if (nodeStates.some((status) => status === "failed")) return "failed";
  if (nodeStates.every((status) => status === "completed")) return "completed";
  return "running";
}

function orderedNodes(runState: WorkflowV2RunState): WorkflowV2RunNodeState[] {
  return runState.nodeOrder.map((nodeId) => runState.nodes[nodeId]!).filter(Boolean);
}

function cloneNodes(nodes: Record<string, WorkflowV2RunNodeState>): Record<string, WorkflowV2RunNodeState> {
  return Object.fromEntries(
    Object.entries(nodes).map(([nodeId, node]) => [
      nodeId,
      {
        ...node,
        dependsOn: [...node.dependsOn],
        dependents: [...node.dependents],
        blockedBy: [...node.blockedBy],
        resourceLocks: [...node.resourceLocks],
      } satisfies WorkflowV2RunNodeState,
    ]),
  );
}
