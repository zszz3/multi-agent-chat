import type {
  CreateWorkflowRequest,
  PatchWorkflowDraftRequest,
  RuntimeConversation,
  UpdateWorkflowRequest,
  WorkflowDraftState,
  WorkflowGraph,
} from "../../../shared/types";
import { createWorkflowGraphFromObjective, parseWorkflowGraphUpsert } from "../../../shared/workflow-graph";

export function applyWorkflowDraftPatch(input: {
  current: WorkflowDraftState;
  patch: PatchWorkflowDraftRequest;
  now?: number;
  normalizeConfiguredAgentId: (configuredAgentId: string | undefined) => string;
  normalizeModelId: (configuredAgentId: string | undefined, modelId: string | undefined) => string;
  cloneGraph: (graph: WorkflowGraph) => WorkflowGraph;
  cloneConversation: (conversation: RuntimeConversation) => RuntimeConversation;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
}): WorkflowDraftState {
  const { current, patch } = input;
  const now = input.now ?? Date.now();
  const {
    finalReport: _currentFinalReport,
    runtimeConversation: _currentRuntimeConversation,
    ...currentWithoutOptionalRuntimeFields
  } = current;
  const nextConfiguredAgentId =
    patch.configuredAgentId !== undefined
      ? input.normalizeConfiguredAgentId(patch.configuredAgentId)
      : current.configuredAgentId;
  const nextModelId =
    patch.configuredAgentId !== undefined || patch.modelId !== undefined
      ? input.normalizeModelId(nextConfiguredAgentId, patch.modelId ?? current.modelId)
      : current.modelId;
  const nextGraph = patch.graph ? input.cloneGraph(patch.graph) : current.graph;
  const next = input.cloneDraft({
    ...currentWithoutOptionalRuntimeFields,
    title: patch.title ?? current.title,
    status: patch.status ?? current.status,
    revision: current.revision + 1,
    configuredAgentId: nextConfiguredAgentId,
    modelId: nextModelId,
    objective: patch.objective ?? current.objective,
    ...(patch.workDir === null
      ? {}
      : patch.workDir !== undefined
        ? { workDir: patch.workDir }
        : current.workDir
          ? { workDir: current.workDir }
          : {}),
    graph: nextGraph,
    graphReady: patch.graphReady ?? current.graphReady,
    messages: patch.messages ?? current.messages,
    reply: patch.reply ?? current.reply,
    error: patch.error === null ? undefined : patch.error ?? current.error,
    runProgress: patch.resetRunState ? [] : patch.runProgress ?? current.runProgress,
    runContextDocument: patch.resetRunState ? "" : patch.runContextDocument ?? current.runContextDocument,
    contextDocument: patch.contextDocument ?? current.contextDocument,
    ...(patch.finalReport === null
      ? {}
      : patch.finalReport !== undefined
        ? { finalReport: patch.finalReport }
        : patch.resetRunState
          ? {}
          : current.finalReport !== undefined
            ? { finalReport: current.finalReport }
            : {}),
    runIds: patch.resetRunState ? [] : [...current.runIds],
    ...(patch.runtimeConversation === null
      ? {}
      : patch.runtimeConversation !== undefined
        ? { runtimeConversation: input.cloneConversation(patch.runtimeConversation) }
        : current.runtimeConversation !== undefined
          ? { runtimeConversation: input.cloneConversation(current.runtimeConversation) }
          : {}),
    createdAt: current.createdAt,
    updatedAt: now,
  });
  if (patch.resetRunState) next.status = "draft";
  return next;
}

export function createWorkflowDraftState(input: {
  workflowId: string;
  request: CreateWorkflowRequest;
  configuredAgentId: string;
  modelId: string;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): WorkflowDraftState {
  const now = input.now ?? Date.now();
  return input.cloneDraft({
    workflowId: input.workflowId,
    title: input.request.title.trim() || input.request.graph.title,
    status: "draft",
    revision: 1,
    configuredAgentId: input.configuredAgentId,
    modelId: input.modelId,
    objective: input.request.objective.trim() || input.request.graph.objective,
    ...(input.request.workDir?.trim() ? { workDir: input.request.workDir.trim() } : {}),
    graph: input.request.graph,
    graphReady: input.request.graphReady ?? true,
    messages: input.request.messages ?? [],
    reply: input.request.reply ?? "",
    error: input.request.error,
    runProgress: input.request.runProgress ?? [],
    runContextDocument: input.request.runContextDocument ?? "",
    contextDocument: input.request.contextDocument ?? "",
    ...(input.request.finalReport !== undefined ? { finalReport: input.request.finalReport } : {}),
    runIds: input.request.runIds ?? [],
    ...(input.request.runtimeConversation ? { runtimeConversation: input.request.runtimeConversation } : {}),
    createdAt: input.request.createdAt ?? now,
    updatedAt: input.request.updatedAt ?? now,
  });
}

export function updateWorkflowDraftState(input: {
  current: WorkflowDraftState;
  request: UpdateWorkflowRequest;
  graph: WorkflowGraph;
  configuredAgentId: string;
  modelId: string;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): WorkflowDraftState {
  return input.cloneDraft({
    ...input.current,
    title: input.request.title ?? input.current.title,
    objective: input.request.objective ?? input.current.objective,
    graph: input.graph,
    configuredAgentId: input.configuredAgentId,
    modelId: input.modelId,
    graphReady: input.request.graphReady ?? input.current.graphReady,
    messages: input.request.messages ?? input.current.messages,
    reply: input.request.reply ?? input.current.reply,
    error: input.request.error ?? input.current.error,
    runProgress: input.request.runProgress ?? input.current.runProgress,
    runContextDocument: input.request.runContextDocument ?? input.current.runContextDocument,
    contextDocument: input.request.contextDocument ?? input.current.contextDocument,
    ...((input.request.finalReport ?? input.current.finalReport) !== undefined
      ? { finalReport: input.request.finalReport ?? input.current.finalReport }
      : {}),
    ...(input.request.runtimeConversation !== undefined
      ? { runtimeConversation: input.request.runtimeConversation }
      : input.current.runtimeConversation
        ? { runtimeConversation: input.current.runtimeConversation }
        : {}),
    revision: input.current.revision + 1,
    updatedAt: input.now ?? Date.now(),
  });
}

export function replaceWorkflowDraftMessage(
  messages: WorkflowDraftState["messages"],
  messageId: string,
  content: string,
): WorkflowDraftState["messages"] {
  return messages.map((message) => (message.id === messageId ? { ...message, content } : message));
}

export function completeWorkflowDraftRequest(input: {
  workflow: WorkflowDraftState;
  activeRequest: { assistantMessageId: string; content: string };
  content: string;
  runtimeConversation: RuntimeConversation | undefined;
  thinkingMessage: string;
  cloneGraph: (graph: WorkflowGraph) => WorkflowGraph;
  cloneConversation: (conversation: RuntimeConversation) => RuntimeConversation;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): WorkflowDraftState {
  const finalContent = (input.content.trim() || input.activeRequest.content.trim() || input.thinkingMessage).trim();
  const parsedGraph = parseWorkflowGraphUpsert(finalContent);
  const { finalReport: _workflowFinalReport, ...workflowWithoutFinalReport } = input.workflow;
  return input.cloneDraft({
    ...(parsedGraph ? workflowWithoutFinalReport : input.workflow),
    title: parsedGraph?.title ?? input.workflow.title,
    status: input.workflow.status === "running" ? input.workflow.status : "draft",
    revision: input.workflow.revision + 1,
    objective: parsedGraph?.objective ?? input.workflow.objective,
    graph: parsedGraph ? input.cloneGraph(parsedGraph) : input.workflow.graph,
    graphReady: parsedGraph ? true : input.workflow.graphReady,
    messages: replaceWorkflowDraftMessage(input.workflow.messages, input.activeRequest.assistantMessageId, finalContent),
    reply: "",
    error: undefined,
    runProgress: parsedGraph ? [] : input.workflow.runProgress,
    runContextDocument: parsedGraph ? "" : input.workflow.runContextDocument,
    contextDocument: input.workflow.contextDocument,
    runIds: parsedGraph ? [] : input.workflow.runIds,
    ...(parsedGraph ? {} : input.workflow.finalReport !== undefined ? { finalReport: input.workflow.finalReport } : {}),
    ...(input.runtimeConversation !== undefined
      ? { runtimeConversation: input.cloneConversation(input.runtimeConversation) }
      : input.workflow.runtimeConversation !== undefined
        ? { runtimeConversation: input.cloneConversation(input.workflow.runtimeConversation) }
        : {}),
    createdAt: input.workflow.createdAt,
    updatedAt: input.now ?? Date.now(),
  });
}

export function failWorkflowDraftRequest(input: {
  workflow: WorkflowDraftState;
  activeRequest: { assistantMessageId: string };
  error: string;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): WorkflowDraftState {
  return input.cloneDraft({
    ...input.workflow,
    revision: input.workflow.revision + 1,
    messages: replaceWorkflowDraftMessage(
      input.workflow.messages,
      input.activeRequest.assistantMessageId,
      `Workflow agent error: ${input.error}`,
    ),
    error: input.error,
    updatedAt: input.now ?? Date.now(),
  });
}

export function resetWorkflowDraftSessionState(input: {
  workflow: WorkflowDraftState;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): WorkflowDraftState {
  const graph = createWorkflowGraphFromObjective("");
  const {
    finalReport: _currentFinalReport,
    runtimeConversation: _currentRuntimeConversation,
    ...workflowWithoutFinalReportOrConversation
  } = input.workflow;
  return input.cloneDraft({
    ...workflowWithoutFinalReportOrConversation,
    title: graph.title,
    status: "draft",
    revision: input.workflow.revision + 1,
    objective: "",
    graph,
    graphReady: false,
    messages: [],
    reply: "",
    error: undefined,
    runProgress: [],
    runContextDocument: "",
    contextDocument: "",
    runIds: [],
    updatedAt: input.now ?? Date.now(),
  });
}

export function beginWorkflowDraftReply(input: {
  workflow: WorkflowDraftState;
  reply: string;
  thinkingMessage: string;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): {
  next: WorkflowDraftState;
  request: { requestId: string; assistantMessageId: string; content: string };
  starting: boolean;
} {
  const starting = input.workflow.messages.length === 0;
  const now = input.now ?? Date.now();
  const requestId = `workflow-${now}-${Math.random().toString(36).slice(2)}`;
  const assistantMessageId = `grill-assistant-${now}`;
  const { finalReport: _workflowFinalReport, ...workflowWithoutFinalReport } = input.workflow;
  return {
    next: input.cloneDraft({
      ...(starting ? workflowWithoutFinalReport : input.workflow),
      title: input.workflow.title || input.workflow.graph.title || "Untitled workflow",
      status: input.workflow.status === "running" ? input.workflow.status : "draft",
      revision: input.workflow.revision + 1,
      objective: starting ? input.reply : input.workflow.objective,
      graphReady: starting ? false : input.workflow.graphReady,
      messages: [
        ...input.workflow.messages,
        { id: `grill-user-${now}`, role: "user", content: input.reply },
        { id: assistantMessageId, role: "assistant", content: input.thinkingMessage },
      ],
      reply: "",
      error: undefined,
      ...(starting
        ? {
            runProgress: [],
            runContextDocument: "",
            runIds: [],
          }
        : {}),
      updatedAt: now,
    }),
    request: {
      requestId,
      assistantMessageId,
      content: "",
    },
    starting,
  };
}

export function abandonWorkflowDraftReplyState(input: {
  workflow: WorkflowDraftState;
  activeRequest: { assistantMessageId: string; content: string };
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): WorkflowDraftState {
  const stoppedContent = input.activeRequest.content.trim() || "Stopped: workflow agent did not return a complete response yet.";
  return input.cloneDraft({
    ...input.workflow,
    revision: input.workflow.revision + 1,
    messages: replaceWorkflowDraftMessage(input.workflow.messages, input.activeRequest.assistantMessageId, stoppedContent),
    error: undefined,
    updatedAt: input.now ?? Date.now(),
  });
}
