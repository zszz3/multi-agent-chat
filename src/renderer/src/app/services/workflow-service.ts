import type {
  AnswerWorkflowGateRequest,
  AppSnapshot,
  CreateWorkflowDraftRequest,
  PatchWorkflowDraftRequest,
  PauseWorkflowNodeRequest,
  RunWorkflowGraphRequest,
  SendWorkflowDraftReplyRequest,
  StartWorkflowNodeRequest,
  WorkflowOperationResult,
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
  runGraph: (request: RunWorkflowGraphRequest) => Promise<WorkflowOperationResult>;
  pauseNode: (request: PauseWorkflowNodeRequest) => Promise<WorkflowOperationResult>;
  startNode: (request: StartWorkflowNodeRequest) => Promise<WorkflowOperationResult>;
  answerGate: (request: AnswerWorkflowGateRequest) => Promise<WorkflowOperationResult>;
  listOutputs: (workflowId: string) => Promise<Array<{ name: string; path: string }>>;
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
    runGraph: (request) => api.runWorkflowGraph(request),
    pauseNode: (request) => api.pauseWorkflowNode(request),
    startNode: (request) => api.startWorkflowNode(request),
    answerGate: (request) => api.answerWorkflowGate(request),
    listOutputs: (workflowId) => api.listWorkflowOutputs(workflowId),
  };
}
