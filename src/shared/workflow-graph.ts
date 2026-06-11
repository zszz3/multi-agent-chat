import { DEFAULT_MODEL_ID, defaultChannelForAgent } from "./models";
import type { AgentChannel, AgentId, WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode, WorkflowGraphNodeKind, WorkflowGraphValidation } from "./types";
import { buildWorkflowAgentPrompt } from "./workflow-agent";

const DEFAULT_AGENT: AgentId = "codex";

function edgeId(fromNodeId: string, toNodeId: string): string {
  return `${fromNodeId}->${toNodeId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isAgentId(value: unknown): value is AgentId {
  return value === "codex" || value === "claude";
}

function isWorkflowNodeKind(value: unknown): value is WorkflowGraphNodeKind {
  return value === "start" || value === "agent" || value === "end";
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function readStringLiteral(source: string, startIndex: number): { value: string; nextIndex: number } | undefined {
  const quote = source[startIndex];
  if (quote !== `"` && quote !== "'" && quote !== "`") return undefined;
  let value = "";
  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === "\\") {
      const escaped = source[index + 1];
      if (!escaped) return undefined;
      if (escaped === "n") value += "\n";
      else if (escaped === "r") value += "\r";
      else if (escaped === "t") value += "\t";
      else if (escaped === "b") value += "\b";
      else if (escaped === "f") value += "\f";
      else value += escaped;
      index += 1;
      continue;
    }
    if (char === quote) return { value, nextIndex: index + 1 };
    value += char;
  }
  return undefined;
}

function extractBalancedObject(source: string, startIndex: number): string | undefined {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === `"` || char === "'" || char === "`") {
      const literal = readStringLiteral(source, index);
      if (!literal) return undefined;
      index = literal.nextIndex - 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }
  return undefined;
}

function extractWorkflowGraphObject(source: string): string | undefined {
  const markerIndex = source.indexOf("workflowGraph.upsert");
  if (markerIndex < 0) return undefined;
  const openParenIndex = source.indexOf("(", markerIndex);
  if (openParenIndex < 0) return undefined;
  const openBraceIndex = source.indexOf("{", openParenIndex);
  if (openBraceIndex < 0) return undefined;
  return extractBalancedObject(source, openBraceIndex);
}

function objectLiteralToJson(source: string): string {
  let output = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    if (char === `"` || char === "'" || char === "`") {
      const literal = readStringLiteral(source, index);
      if (!literal) throw new Error("Unterminated string literal");
      output += JSON.stringify(literal.value);
      index = literal.nextIndex - 1;
      continue;
    }
    if (isIdentifierStart(char)) {
      let endIndex = index + 1;
      while (endIndex < source.length && isIdentifierPart(source[endIndex]!)) endIndex += 1;
      let afterIdentifier = endIndex;
      while (/\s/.test(source[afterIdentifier] ?? "")) afterIdentifier += 1;
      const identifier = source.slice(index, endIndex);
      output += source[afterIdentifier] === ":" ? JSON.stringify(identifier) : identifier;
      index = endIndex - 1;
      continue;
    }
    if (char === ",") {
      let afterComma = index + 1;
      while (/\s/.test(source[afterComma] ?? "")) afterComma += 1;
      if (source[afterComma] === "}" || source[afterComma] === "]") continue;
    }
    output += char;
  }
  return output;
}

function normalizeWorkflowGraph(value: unknown): WorkflowGraph | undefined {
  const record = isRecord(value) ? value : undefined;
  if (!record) return undefined;
  const title = asString(record.title);
  const objective = asString(record.objective);
  if (!title || !objective || !Array.isArray(record.nodes) || !Array.isArray(record.edges)) return undefined;

  const nodes: WorkflowGraphNode[] = [];
  for (const nodeValue of record.nodes) {
    const nodeRecord = isRecord(nodeValue) ? nodeValue : undefined;
    if (!nodeRecord) return undefined;
    const id = asString(nodeRecord.id);
    const kind = nodeRecord.kind;
    const nodeTitle = asString(nodeRecord.title);
    const prompt = asString(nodeRecord.prompt);
    if (!id || !isWorkflowNodeKind(kind) || nodeTitle === undefined || prompt === undefined) return undefined;
    const node: WorkflowGraphNode = { id, kind, title: nodeTitle, prompt };
    if (isAgentId(nodeRecord.agentId)) node.agentId = nodeRecord.agentId;
    const channelId = asString(nodeRecord.channelId);
    if (channelId !== undefined) node.channelId = channelId;
    const modelId = asString(nodeRecord.modelId);
    if (modelId !== undefined) node.modelId = modelId;
    nodes.push(node);
  }

  const edges: WorkflowGraphEdge[] = [];
  for (const edgeValue of record.edges) {
    const edgeRecord = isRecord(edgeValue) ? edgeValue : undefined;
    if (!edgeRecord) return undefined;
    const fromNodeId = asString(edgeRecord.fromNodeId);
    const toNodeId = asString(edgeRecord.toNodeId);
    if (!fromNodeId || !toNodeId) return undefined;
    edges.push({
      id: asString(edgeRecord.id) || edgeId(fromNodeId, toNodeId),
      fromNodeId,
      toNodeId,
    });
  }

  return { title, objective, nodes, edges };
}

export function parseWorkflowGraphUpsert(content: string): WorkflowGraph | undefined {
  const objectText = extractWorkflowGraphObject(content);
  if (!objectText) return undefined;
  try {
    return normalizeWorkflowGraph(JSON.parse(objectLiteralToJson(objectText)));
  } catch {
    return undefined;
  }
}

export function createWorkflowGraphFromObjective(objective: string, channels: AgentChannel[] = []): WorkflowGraph {
  const text = objective.trim() || "Untitled workflow";
  const channelId = defaultChannelForAgent(DEFAULT_AGENT, channels);
  const baseAgent = {
    agentId: DEFAULT_AGENT,
    channelId,
    modelId: DEFAULT_MODEL_ID,
  };

  return {
    title: text,
    objective: text,
    nodes: [
      { id: "start", kind: "start", title: "Start", prompt: "" },
      {
        id: "plan",
        kind: "agent",
        title: "Clarify & Plan",
        prompt: buildWorkflowAgentPrompt({ objective: text }),
        ...baseAgent,
      },
      {
        id: "work",
        kind: "agent",
        title: "Execute",
        prompt: `Use the plan to produce the main artifact for: ${text}`,
        ...baseAgent,
      },
      {
        id: "review",
        kind: "agent",
        title: "Review",
        prompt: `Review the artifact, call out gaps, and decide whether it is ready for: ${text}`,
        ...baseAgent,
      },
      { id: "end", kind: "end", title: "Done", prompt: "" },
    ],
    edges: [
      { id: edgeId("start", "plan"), fromNodeId: "start", toNodeId: "plan" },
      { id: edgeId("plan", "work"), fromNodeId: "plan", toNodeId: "work" },
      { id: edgeId("work", "review"), fromNodeId: "work", toNodeId: "review" },
      { id: edgeId("review", "end"), fromNodeId: "review", toNodeId: "end" },
    ],
  };
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowGraphValidation {
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) duplicateNodeIds.add(node.id);
    nodeIds.add(node.id);
  }
  if (duplicateNodeIds.size > 0) errors.push(`Workflow graph has duplicate node ids: ${Array.from(duplicateNodeIds).join(", ")}.`);

  const startNodeIds = graph.nodes.filter((node) => node.kind === "start").map((node) => node.id);
  if (startNodeIds.length !== 1) errors.push("Workflow graph must have exactly one start node.");

  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      errors.push(`Workflow edge ${edge.id} references a missing node.`);
      continue;
    }
    adjacency.get(edge.fromNodeId)!.push(edge.toNodeId);
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const queue = graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const topologicalNodeIds: string[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]!;
    topologicalNodeIds.push(nodeId);
    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      const nextIndegree = (indegree.get(nextNodeId) ?? 0) - 1;
      indegree.set(nextNodeId, nextIndegree);
      if (nextIndegree === 0) queue.push(nextNodeId);
    }
  }
  if (topologicalNodeIds.length !== graph.nodes.length) errors.push("Workflow graph must be acyclic.");

  if (startNodeIds.length === 1) {
    const reachable = new Set<string>();
    const stack = [startNodeIds[0]!];
    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      stack.push(...(adjacency.get(nodeId) ?? []));
    }
    const unreachableNodeIds = graph.nodes.map((node) => node.id).filter((nodeId) => !reachable.has(nodeId));
    if (unreachableNodeIds.length > 0) {
      errors.push(`Workflow graph has unreachable nodes: ${unreachableNodeIds.join(", ")}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    startNodeIds,
    executableNodeIds: topologicalNodeIds.filter((nodeId) => graph.nodes.find((node) => node.id === nodeId)?.kind === "agent"),
    topologicalNodeIds,
  };
}

export function workflowGraphExecutionLevels(graph: WorkflowGraph): string[][] {
  const validation = validateWorkflowGraph(graph);
  if (!validation.valid) return [];

  const executableNodeIds = validation.executableNodeIds;
  const executableNodeIdSet = new Set(executableNodeIds);
  const parentExecutableNodeIdsByNodeId = new Map<string, Set<string>>();
  for (const nodeId of executableNodeIds) parentExecutableNodeIdsByNodeId.set(nodeId, new Set());

  for (const edge of graph.edges) {
    if (!executableNodeIdSet.has(edge.toNodeId) || !executableNodeIdSet.has(edge.fromNodeId)) continue;
    parentExecutableNodeIdsByNodeId.get(edge.toNodeId)?.add(edge.fromNodeId);
  }

  const remaining = new Set(executableNodeIds);
  const completed = new Set<string>();
  const levels: string[][] = [];

  while (remaining.size > 0) {
    const readyNodeIds = executableNodeIds.filter((nodeId) => {
      if (!remaining.has(nodeId)) return false;
      return Array.from(parentExecutableNodeIdsByNodeId.get(nodeId) ?? []).every((parentNodeId) => completed.has(parentNodeId));
    });
    if (readyNodeIds.length === 0) return [];

    levels.push(readyNodeIds);
    for (const nodeId of readyNodeIds) {
      remaining.delete(nodeId);
      completed.add(nodeId);
    }
  }

  return levels;
}

export function workflowGraphDisplayLayers(graph: WorkflowGraph): string[][] {
  const validation = validateWorkflowGraph(graph);
  if (!validation.valid) return graph.nodes.map((node) => [node.id]);

  const included = new Set<string>();
  const layers: string[][] = [];
  for (const startNodeId of validation.startNodeIds) {
    included.add(startNodeId);
    layers.push([startNodeId]);
  }

  for (const level of workflowGraphExecutionLevels(graph)) {
    for (const nodeId of level) included.add(nodeId);
    layers.push(level);
  }

  const terminalNodeIds = validation.topologicalNodeIds.filter((nodeId) => !included.has(nodeId));
  if (terminalNodeIds.length > 0) layers.push(terminalNodeIds);

  return layers.filter((layer) => layer.length > 0);
}
