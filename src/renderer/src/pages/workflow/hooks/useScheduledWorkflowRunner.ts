import { useCallback } from "react";
import type { AppSnapshot, ScheduledWorkflowDueEvent, WorkflowDraftState } from "../../../../../shared/types";
import { scheduledWorkflowEventTarget } from "../../../app/shell";
import type { MultiAgentChatApi } from "../../../../../preload";

interface RunWorkflowGraphResult {
  ok: boolean;
  workflowRunId?: string;
  error?: string;
}

interface UseScheduledWorkflowRunnerOptions {
  chatApi: Pick<
    MultiAgentChatApi,
    "ackScheduledWorkflowEvent" | "recordScheduledWorkflowRun" | "finishScheduledWorkflowRun"
  >;
  snapshotRef: React.MutableRefObject<AppSnapshot>;
  setSnapshot: (snapshot: AppSnapshot) => void;
  runWorkflowGraphInternal: (targetWorkflow?: WorkflowDraftState) => Promise<RunWorkflowGraphResult>;
}

export interface ScheduledWorkflowRunnerController {
  handleScheduledWorkflowEvent: (event: ScheduledWorkflowDueEvent) => Promise<void>;
}

export function useScheduledWorkflowRunner({
  chatApi,
  snapshotRef,
  setSnapshot,
  runWorkflowGraphInternal,
}: UseScheduledWorkflowRunnerOptions): ScheduledWorkflowRunnerController {
  const handleScheduledWorkflowEvent = useCallback(async (event: ScheduledWorkflowDueEvent): Promise<void> => {
    const target = scheduledWorkflowEventTarget(event);
    if (!target) {
      await chatApi.ackScheduledWorkflowEvent(event.eventId, {
        status: "failed",
        message: "Scheduled event payload is missing scheduleId or workflowId.",
      });
      return;
    }
    const currentSnapshot = snapshotRef.current;
    const workflow = currentSnapshot.workflowStore.workflows.find((item) => item.workflowId === target.workflowId);
    const runId = `scheduled_run_${event.eventId}`;
    if (!workflow) {
      const failedSnapshot = await chatApi.recordScheduledWorkflowRun({
        runId,
        scheduleId: target.scheduleId,
        workflowId: target.workflowId,
        eventId: event.eventId,
        title: event.title,
        status: "failed",
        startedAt: Date.now(),
        finishedAt: Date.now(),
        message: `Workflow ${target.workflowId} was not found locally.`,
      });
      setSnapshot(failedSnapshot);
      await chatApi.ackScheduledWorkflowEvent(event.eventId, {
        status: "failed",
        message: `Workflow ${target.workflowId} was not found locally.`,
      });
      return;
    }

    const runningSnapshot = await chatApi.recordScheduledWorkflowRun({
      runId,
      scheduleId: target.scheduleId,
      workflowId: workflow.workflowId,
      eventId: event.eventId,
      title: event.title || workflow.title,
      status: "running",
      startedAt: Date.now(),
      finishedAt: undefined,
      message: event.message || "Runner started workflow.",
    });
    setSnapshot(runningSnapshot);

    const result = await runWorkflowGraphInternal(workflow);
    const finalStatus = result.ok ? "completed" : "failed";
    const message = result.ok ? "Workflow completed." : result.error || "Workflow failed.";
    const finishedSnapshot = await chatApi.finishScheduledWorkflowRun(runId, {
      status: finalStatus,
      ...(result.workflowRunId !== undefined ? { workflowRunId: result.workflowRunId } : {}),
      message,
      finishedAt: Date.now(),
    });
    setSnapshot(finishedSnapshot);
    await chatApi.ackScheduledWorkflowEvent(event.eventId, {
      status: finalStatus,
      ...(result.workflowRunId !== undefined ? { workflowRunId: result.workflowRunId } : {}),
      message,
    });
  }, [chatApi, runWorkflowGraphInternal, setSnapshot, snapshotRef]);

  return {
    handleScheduledWorkflowEvent,
  };
}
