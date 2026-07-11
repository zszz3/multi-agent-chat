import type {
  AgentId,
  CreateWorkflowRequest,
  PatchWorkflowDraftRequest,
  RuntimeConversation,
  UpdateWorkflowRequest,
  WorkflowDraftState,
  WorkflowGraph,
} from "../../../shared/types";
import { cloneWorkflowV2Plan } from "../../../shared/workflow-v2/planning";
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
  const resetRunState = Boolean(patch.resetRunState && current.status !== "running");
  const {
    finalReport: _currentFinalReport,
    runtimeConversation: _currentRuntimeConversation,
    workflowV2Plan: _currentWorkflowV2Plan,
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
  const routeChanged = nextConfiguredAgentId !== current.configuredAgentId || nextModelId !== current.modelId;
  const nextGraph = patch.graph ? input.cloneGraph(patch.graph) : current.graph;
  const nextStatus = current.status === "running" ? "running" : patch.status ?? current.status;
  const nextWorkflowV2Plan =
    patch.workflowV2Plan === null
      ? undefined
      : patch.workflowV2Plan !== undefined
        ? cloneWorkflowV2Plan(patch.workflowV2Plan)
        : patch.graph !== undefined || patch.objective !== undefined || resetRunState || routeChanged
          ? undefined
          : current.workflowV2Plan
            ? cloneWorkflowV2Plan(current.workflowV2Plan)
            : undefined;
  const next = input.cloneDraft({
    ...currentWithoutOptionalRuntimeFields,
    title: patch.title ?? current.title,
    status: nextStatus,
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
    runProgress: resetRunState ? [] : patch.runProgress ?? current.runProgress,
    runContextDocument: resetRunState ? "" : patch.runContextDocument ?? current.runContextDocument,
    contextDocument: patch.contextDocument ?? current.contextDocument,
    ...(nextWorkflowV2Plan ? { workflowV2Plan: nextWorkflowV2Plan } : {}),
    ...(patch.finalReport === null
      ? {}
      : patch.finalReport !== undefined
        ? { finalReport: patch.finalReport }
        : resetRunState
          ? {}
          : current.finalReport !== undefined
            ? { finalReport: current.finalReport }
            : {}),
    runIds: resetRunState ? [] : [...current.runIds],
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
  if (resetRunState) next.status = "draft";
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
    ...(input.request.definition ? { definition: structuredClone(input.request.definition) } : {}),
    ...(input.request.workDir?.trim() ? { workDir: input.request.workDir.trim() } : {}),
    graph: input.request.graph,
    graphReady: input.request.graphReady ?? true,
    messages: input.request.messages ?? [],
    reply: input.request.reply ?? "",
    error: input.request.error,
    runProgress: input.request.runProgress ?? [],
    runContextDocument: input.request.runContextDocument ?? "",
    contextDocument: input.request.contextDocument ?? "",
    ...(input.request.workflowV2Plan ? { workflowV2Plan: cloneWorkflowV2Plan(input.request.workflowV2Plan) } : {}),
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
  const {
    workflowV2Plan: _currentWorkflowV2Plan,
    ...currentWithoutWorkflowV2Plan
  } = input.current;
  const routeChanged = input.configuredAgentId !== input.current.configuredAgentId || input.modelId !== input.current.modelId;
  const nextWorkflowV2Plan =
    input.request.workflowV2Plan === null
      ? undefined
      : input.request.workflowV2Plan !== undefined
        ? cloneWorkflowV2Plan(input.request.workflowV2Plan)
        : input.request.graph !== undefined || input.request.objective !== undefined || routeChanged
          ? undefined
          : input.current.workflowV2Plan
            ? cloneWorkflowV2Plan(input.current.workflowV2Plan)
            : undefined;
  return input.cloneDraft({
    ...currentWithoutWorkflowV2Plan,
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
    ...(nextWorkflowV2Plan ? { workflowV2Plan: nextWorkflowV2Plan } : {}),
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
  const {
    finalReport: _workflowFinalReport,
    workflowV2Plan: _workflowV2Plan,
    ...workflowWithoutFinalReport
  } = input.workflow;
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
    ...(parsedGraph ? {} : input.workflow.workflowV2Plan ? { workflowV2Plan: cloneWorkflowV2Plan(input.workflow.workflowV2Plan) } : {}),
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
    workflowV2Plan: _currentWorkflowV2Plan,
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
