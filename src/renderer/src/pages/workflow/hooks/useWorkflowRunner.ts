import { useCallback } from "react";
import type { WorkflowDraftState } from "../../../../../shared/types";
import type { WorkflowService } from "../../../app/services/workflow-service";

export interface RunWorkflowGraphResult {
  ok: boolean;
  workflowRunId?: string;
  error?: string;
}

interface UseWorkflowRunnerOptions {
  workflows: WorkflowService;
  workflowId: string | undefined;
  workflowContextDocument: string;
}

export interface WorkflowRunnerController {
  runWorkflowGraph: () => Promise<void>;
  runWorkflowGraphInternal: (targetWorkflow?: WorkflowDraftState) => Promise<RunWorkflowGraphResult>;
}

export function useWorkflowRunner({
  workflows,
  workflowId,
  workflowContextDocument,
}: UseWorkflowRunnerOptions): WorkflowRunnerController {
  const runWorkflowGraphInternal = useCallback(async (targetWorkflow?: WorkflowDraftState): Promise<RunWorkflowGraphResult> => {
    const targetWorkflowId = targetWorkflow?.workflowId ?? workflowId;
    if (!targetWorkflowId) {
      return { ok: false, error: "Workflow was not found." };
    }

    const result = await workflows.runGraph({
      workflowId: targetWorkflowId,
      contextDocument: targetWorkflow?.contextDocument ?? workflowContextDocument,
    });
    return {
      ok: result.ok,
      ...(result.runId ? { workflowRunId: result.runId } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
  }, [workflowContextDocument, workflowId, workflows]);

  const runWorkflowGraph = useCallback(async (): Promise<void> => {
    await runWorkflowGraphInternal();
  }, [runWorkflowGraphInternal]);

  return {
    runWorkflowGraph,
    runWorkflowGraphInternal,
  };
}
