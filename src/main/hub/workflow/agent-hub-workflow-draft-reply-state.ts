import type {
  AgentId,
  WorkflowAgentRequest,
  WorkflowDraftState,
} from "../../../shared/types";
import { buildWorkflowAgentPrompt } from "../../../shared/workflow-agent";
import { replaceWorkflowDraftMessage } from "./agent-hub-workflow-draft";

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

export function createWorkflowDraftAgentRequest(input: {
  started: {
    next: WorkflowDraftState;
    request: { requestId: string; assistantMessageId: string; content: string };
    starting: boolean;
  };
  reply: string;
  defaultRuntimeId: AgentId;
  resolveRuntimeId: (configuredAgentId: string, modelId: string) => AgentId | undefined;
  defaultWorkDir: string;
}): WorkflowAgentRequest {
  return {
    requestId: input.started.request.requestId,
    prompt: input.started.starting ? buildWorkflowAgentPrompt({ objective: input.reply }) : input.reply,
    configuredAgentId: input.started.next.configuredAgentId,
    runtimeId:
      input.resolveRuntimeId(input.started.next.configuredAgentId, input.started.next.modelId) ?? input.defaultRuntimeId,
    executionMode: "oneshot",
    continuationPolicy: "fresh",
    runtimeConfig: { model: input.started.next.modelId },
    workDir: input.started.next.workDir || input.defaultWorkDir,
  };
}
