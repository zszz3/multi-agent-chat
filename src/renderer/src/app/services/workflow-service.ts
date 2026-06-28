import type {
  AppSnapshot,
  FinishWorkflowRunRequest,
  StartWorkflowRunRequest,
  WorkflowAgentEvent,
  WorkflowAgentRequest,
  WorkflowAgentResponse,
  WorkflowDraftState,
} from "../../../../shared/types";
import { multiAgentChatService } from "./multi-agent-chat-service";

export interface WorkflowService {
  askAgent: (request: WorkflowAgentRequest) => Promise<WorkflowAgentResponse>;
  onAgentEvent: (listener: (event: WorkflowAgentEvent) => void) => () => void;
  updateDraft: (draft?: WorkflowDraftState) => Promise<AppSnapshot>;
  selectWorkflow: (workflowId: string) => Promise<AppSnapshot>;
  renameWorkflow: (workflowId: string, title: string) => Promise<AppSnapshot>;
  deleteWorkflow: (workflowId: string) => Promise<AppSnapshot>;
  startRun: (request: StartWorkflowRunRequest) => Promise<AppSnapshot>;
  finishRun: (request: FinishWorkflowRunRequest) => Promise<AppSnapshot>;
}

export function workflowService(): WorkflowService {
  const api = multiAgentChatService();
  return {
    askAgent: (request) => api.askWorkflowAgent(request),
    onAgentEvent: (listener) => api.onWorkflowAgentEvent(listener),
    updateDraft: (draft) => api.updateWorkflowDraft(draft),
    selectWorkflow: (workflowId) => api.selectWorkflow(workflowId),
    renameWorkflow: (workflowId, title) => api.renameWorkflow(workflowId, title),
    deleteWorkflow: (workflowId) => api.deleteWorkflow(workflowId),
    startRun: (request) => api.startWorkflowRun(request),
    finishRun: (request) => api.finishWorkflowRun(request),
  };
}
