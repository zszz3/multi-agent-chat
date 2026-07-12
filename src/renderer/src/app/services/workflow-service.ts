import type {
  AppSnapshot,
  CreateWorkflowDraftRequest,
  PatchWorkflowDraftRequest,
  PauseWorkflowNodeRequest,
  RunWorkflowRequest,
  ListWorkflowOutputsRequest,
  SendWorkflowDraftReplyRequest,
  StartWorkflowNodeRequest,
  StopWorkflowRunRequest,
  WorkflowOperationResult,
  CompleteWorkflowNodeConversationRequest,
  InterruptWorkflowNodeConversationRequest,
  RejectWorkflowNodeCompletionRequest,
  SendWorkflowNodeMessageRequest,
} from "../../../../shared/types";
import { multiAgentChatService } from "./multi-agent-chat-service";

export interface WorkflowService {
  createDraft: (request?: CreateWorkflowDraftRequest) => Promise<AppSnapshot>;
  patchDraft: (request: PatchWorkflowDraftRequest) => Promise<AppSnapshot>;
  resetDraftSession: (workflowId: string) => Promise<AppSnapshot>;
  sendDraftReply: (request: SendWorkflowDraftReplyRequest) => Promise<AppSnapshot>;
  abandonDraftReply: (workflowId: string) => Promise<AppSnapshot>;
  selectWorkflow: (workflowId: string) => Promise<AppSnapshot>;
  renameWorkflow: (workflowId: string, title: string) => Promise<AppSnapshot>;
  deleteWorkflow: (workflowId: string) => Promise<AppSnapshot>;
  runWorkflow: (request: RunWorkflowRequest) => Promise<WorkflowOperationResult>;
  pauseNode: (request: PauseWorkflowNodeRequest) => Promise<WorkflowOperationResult>;
  stopRun: (request: StopWorkflowRunRequest) => Promise<WorkflowOperationResult>;
  startNode: (request: StartWorkflowNodeRequest) => Promise<WorkflowOperationResult>;
  sendNodeMessage: (request: SendWorkflowNodeMessageRequest) => Promise<AppSnapshot>;
  completeNodeConversation: (request: CompleteWorkflowNodeConversationRequest) => Promise<WorkflowOperationResult>;
  rejectNodeCompletion: (request: RejectWorkflowNodeCompletionRequest) => Promise<AppSnapshot>;
  interruptNodeConversation: (request: InterruptWorkflowNodeConversationRequest) => Promise<AppSnapshot>;
  listOutputs: (request: ListWorkflowOutputsRequest) => Promise<Array<{ name: string; path: string }>>;
}

export function workflowService(): WorkflowService {
  const api = multiAgentChatService();
  return {
    createDraft: (request) => api.createWorkflowDraft(request),
    patchDraft: (request) => api.patchWorkflowDraft(request),
    resetDraftSession: (workflowId) => api.resetWorkflowDraftSession(workflowId),
    sendDraftReply: (request) => api.sendWorkflowDraftReply(request),
    abandonDraftReply: (workflowId) => api.abandonWorkflowDraftReply(workflowId),
    selectWorkflow: (workflowId) => api.selectWorkflow(workflowId),
    renameWorkflow: (workflowId, title) => api.renameWorkflow(workflowId, title),
    deleteWorkflow: (workflowId) => api.deleteWorkflow(workflowId),
    runWorkflow: (request) => api.runWorkflow(request),
    pauseNode: (request) => api.pauseWorkflowNode(request),
    stopRun: (request) => api.stopWorkflowRun(request),
    startNode: (request) => api.startWorkflowNode(request),
    sendNodeMessage: (request) => api.sendWorkflowNodeMessage(request),
    completeNodeConversation: (request) => api.completeWorkflowNodeConversation(request),
    rejectNodeCompletion: (request) => api.rejectWorkflowNodeCompletion(request),
    interruptNodeConversation: (request) => api.interruptWorkflowNodeConversation(request),
    listOutputs: (request) => api.listWorkflowOutputs(request),
  };
}
