import type { WorkflowDraftState, WorkflowRunState } from "../../../shared/types";
import type { WorkflowRunStateUpdate } from "../../workflows/workflow-runtime";

export function updateWorkflowRunState(input: {
  workflow: WorkflowDraftState;
  run: WorkflowRunState;
  update: WorkflowRunStateUpdate;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now?: number;
}): { nextWorkflow: WorkflowDraftState; nextRun: WorkflowRunState } {
  const nextRun: WorkflowRunState = {
    ...input.run,
    status: input.update.status ?? input.run.status,
    progress: input.update.progress ?? input.run.progress,
    events:
      input.update.appendEvents && input.update.appendEvents.length > 0
        ? [...input.run.events, ...input.update.appendEvents]
        : input.run.events,
    contextDocument: input.update.contextDocument ?? input.run.contextDocument,
    ...((input.update.finalReport ?? input.run.finalReport) !== undefined
      ? { finalReport: input.update.finalReport ?? input.run.finalReport }
      : {}),
    lastError: input.update.lastError ?? input.run.lastError,
  };

  const nextWorkflow = input.cloneDraft({
    ...input.workflow,
    status: input.update.status ?? input.workflow.status,
    runProgress: input.update.progress ?? input.workflow.runProgress,
    runContextDocument: input.update.contextDocument ?? input.workflow.runContextDocument,
    ...((input.update.finalReport ?? input.workflow.finalReport) !== undefined
      ? { finalReport: input.update.finalReport ?? input.workflow.finalReport }
      : {}),
    error: input.update.lastError ?? input.workflow.error,
    updatedAt: input.now ?? Date.now(),
  });

  return { nextWorkflow, nextRun };
}
