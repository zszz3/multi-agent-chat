import { randomUUID } from "node:crypto";
import type {
  ChatEvent,
  ChatMessage,
  WorkflowArtifactReference,
  WorkflowEvent,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowRunProgressItem,
  WorkflowStatus,
} from "../../../shared/types";
import {
  asArray,
  asNumber,
  asOptionalString,
  asRecord,
  isAgentId,
  isApprovalDecision,
  isChatEventType,
  isInteractionRequestState,
  isMessageRole,
  isWorkflowGraphNodeKind,
  isWorkflowRunNodeStatus,
} from "../persisted/agent-hub-persistence";
import { createAssistantMessage } from "../chat/agent-hub-ui";

export function restoreWorkflowStatus(value: unknown): WorkflowStatus {
  return value === "running" || value === "completed" || value === "failed" || value === "stopped" ? value : "draft";
}

export function restoreWorkflowDraftStatus(value: unknown): WorkflowStatus {
  const status = restoreWorkflowStatus(value);
  return status === "running" ? "failed" : status;
}

export function restoreWorkflowRunStatus(value: unknown): WorkflowStatus {
  const status = restoreWorkflowStatus(value);
  return status === "running" ? "failed" : status;
}

export function restoreWorkflowGraph(raw: unknown): WorkflowGraph | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const title = asOptionalString(record.title);
  const objective = asOptionalString(record.objective);
  if (!title || !objective) return undefined;
  const nodes = asArray(record.nodes)
    .map((node) => restoreWorkflowGraphNode(node))
    .filter((node): node is WorkflowGraphNode => Boolean(node));
  const edges = asArray(record.edges)
    .map((edge) => restoreWorkflowGraphEdge(edge))
    .filter((edge): edge is WorkflowGraphEdge => Boolean(edge));
  if (nodes.length === 0) return undefined;
  return { title, objective, nodes, edges };
}

export function restoreWorkflowGraphNode(raw: unknown): WorkflowGraphNode | undefined {
  const record = asRecord(raw);
  if (!record || !isWorkflowGraphNodeKind(record.kind)) return undefined;
  const id = asOptionalString(record.id);
  const title = asOptionalString(record.title);
  const prompt = asOptionalString(record.prompt);
  if (!id || title === undefined || prompt === undefined) return undefined;
  const node: WorkflowGraphNode = { id, kind: record.kind, title, prompt };
  const position = asRecord(record.position);
  if (position && typeof position.x === "number" && typeof position.y === "number" && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    node.position = { x: position.x, y: position.y };
  }
  const configuredAgentId = asOptionalString(record.configuredAgentId);
  if (configuredAgentId) node.configuredAgentId = configuredAgentId;
  const modelId = asOptionalString(record.modelId);
  if (modelId) node.modelId = modelId;
  return node;
}

export function restoreWorkflowGraphEdge(raw: unknown): WorkflowGraphEdge | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const fromNodeId = asOptionalString(record.fromNodeId);
  const toNodeId = asOptionalString(record.toNodeId);
  if (!fromNodeId || !toNodeId) return undefined;
  return {
    id: asOptionalString(record.id) || `${fromNodeId}->${toNodeId}`,
    fromNodeId,
    toNodeId,
  };
}

export function restoreWorkflowRunProgressItem(raw: unknown): WorkflowRunProgressItem | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const nodeId = asOptionalString(record.nodeId);
  const title = asOptionalString(record.title);
  if (!nodeId || !title || !isWorkflowRunNodeStatus(record.status)) return undefined;
  const status = record.status === "running" || record.status === "queued" ? "failed" : record.status;
  const item: WorkflowRunProgressItem = {
    nodeId,
    title,
    status,
  };
  const detail = asOptionalString(record.detail) ?? (status === "failed" && record.status !== "failed" ? "Interrupted before app restart" : undefined);
  if (detail) item.detail = detail;
  const taskId = asOptionalString(record.taskId);
  if (taskId) item.taskId = taskId;
  return item;
}

export function restoreWorkflowArtifactReference(raw: unknown): WorkflowArtifactReference | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const kind = record.kind;
  if (kind !== "text" && kind !== "file" && kind !== "url") return undefined;
  const title = asOptionalString(record.title);
  if (!title) return undefined;
  const ref: WorkflowArtifactReference = { kind, title };
  const content = asOptionalString(record.content);
  if (content) ref.content = content;
  const filePath = asOptionalString(record.path);
  if (filePath) ref.path = filePath;
  const url = asOptionalString(record.url);
  if (url) ref.url = url;
  return ref;
}

export function restoreWorkflowEvent(raw: unknown): WorkflowEvent | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const nodeId = asOptionalString(record.nodeId);
  const type = record.type;
  const validType =
    type === "node_ready" ||
    type === "node_started" ||
    type === "node_paused" ||
    type === "node_output" ||
    type === "node_judged" ||
    type === "node_failed" ||
    type === "node_completed";
  if (!nodeId || !validType) return undefined;
  const event: WorkflowEvent = { type, nodeId, at: asNumber(record.at, Date.now()) };
  if (typeof record.attempt === "number") event.attempt = record.attempt;
  const taskId = asOptionalString(record.taskId);
  if (taskId) event.taskId = taskId;
  const detail = asOptionalString(record.detail);
  if (detail) event.detail = detail;
  if (typeof record.pass === "boolean") event.pass = record.pass;
  const summary = asOptionalString(record.summary);
  if (summary) event.summary = summary;
  const artifactRefs = asArray(record.artifactRefs)
    .map((ref) => restoreWorkflowArtifactReference(ref))
    .filter((ref): ref is WorkflowArtifactReference => Boolean(ref));
  if (artifactRefs.length > 0) event.artifactRefs = artifactRefs;
  const error = asOptionalString(record.error);
  if (error) event.error = error;
  return event;
}

export function restoreEvent(raw: unknown): ChatEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isChatEventType(record.type) || typeof record.content !== "string") return null;
  const event: ChatEvent = {
    id: asOptionalString(record.id) ?? randomUUID(),
    type: record.type,
    content: record.content,
    timestamp: asNumber(record.timestamp, Date.now()),
  };
  if (isAgentId(record.agentId)) event.agentId = record.agentId;
  const name = asOptionalString(record.name);
  if (name) event.name = name;
  if (isAgentId(record.fromAgentId)) event.fromAgentId = record.fromAgentId;
  if (isAgentId(record.toAgentId)) event.toAgentId = record.toAgentId;
  const requestId = asOptionalString(record.requestId);
  if (requestId) event.requestId = requestId;
  if (isInteractionRequestState(record.requestState)) event.requestState = record.requestState;
  if (isApprovalDecision(record.decision)) event.decision = record.decision;
  const metadata = asRecord(record.metadata);
  if (metadata) event.metadata = metadata;
  return event;
}

export function restoreMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isMessageRole(record.role) || typeof record.content !== "string") return null;
  const message: ChatMessage = {
    id: asOptionalString(record.id) ?? randomUUID(),
    role: record.role,
    content: record.content,
    timestamp: asNumber(record.timestamp, Date.now()),
  };
  if (record.local === true) message.local = true;
  if (Array.isArray(record.events)) {
    const events = record.events.map((event) => restoreEvent(event)).filter((event): event is ChatEvent => Boolean(event));
    if (events.length > 0) message.events = events;
  }
  return message;
}

export function normalizeRestoredMessages(messages: ChatMessage[]): ChatMessage[] {
  const normalized: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role !== "meta") {
      normalized.push(message);
      continue;
    }

    const event: ChatEvent = {
      id: message.id,
      type: "meta",
      content: message.content,
      timestamp: message.timestamp,
    };
    let target = [...normalized].reverse().find((item) => item.role === "assistant");
    if (!target) {
      target = createAssistantMessage();
      target.timestamp = message.timestamp;
      normalized.push(target);
    }
    target.events = [...(target.events ?? []), event];
  }
  return normalized;
}
