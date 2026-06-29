import { useCallback, useEffect, useState } from "react";
import type { MultiAgentChatApi } from "../../../../../preload";
import { DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE } from "../../../../../shared/types";
import type {
  AppSnapshot,
  CreateScheduledWorkflowScheduleRequest,
  ScheduledWorkflowSchedule,
  WorkflowDraftState,
} from "../../../../../shared/types";
import { useScheduledWorkflowRunner } from "../../workflow/hooks/useScheduledWorkflowRunner";
import {
  defaultScheduledWorkflowDraft,
  intervalSecondsForFrequency,
  normalizeScheduleDayOfMonth,
  normalizeScheduleTimeOfDay,
  normalizeScheduleWeekdays,
  type ScheduledWorkflowDraft,
} from "../schedule-utils";

type ScheduledWorkflowUpdate = Partial<
  Pick<ScheduledWorkflowSchedule, "enabled" | "title" | "intervalSeconds" | "frequency" | "timeOfDay" | "timezone" | "weekdays" | "dayOfMonth">
>;

interface UseScheduledWorkflowManagerOptions {
  chatApi: MultiAgentChatApi;
  snapshot: AppSnapshot;
  snapshotRef: React.MutableRefObject<AppSnapshot>;
  setSnapshot: (snapshot: AppSnapshot) => void;
  runWorkflowGraphInternal: (targetWorkflow?: WorkflowDraftState) => Promise<{ ok: boolean; workflowRunId?: string; error?: string }>;
  onEnterSchedules?: () => void;
}

export interface ScheduledWorkflowManager {
  scheduledWorkflowDraft: ScheduledWorkflowDraft;
  scheduledWorkflowMode: "detail" | "create";
  setScheduledWorkflowDraft: React.Dispatch<React.SetStateAction<ScheduledWorkflowDraft>>;
  connectScheduledRunner: () => Promise<void>;
  disconnectScheduledRunner: () => Promise<void>;
  refreshScheduledWorkflows: () => Promise<void>;
  selectScheduledWorkflowSchedule: (scheduleId: string) => Promise<void>;
  startCreatingScheduledWorkflow: () => void;
  createScheduledWorkflow: () => Promise<void>;
  updateScheduledWorkflow: (schedule: ScheduledWorkflowSchedule, update: ScheduledWorkflowUpdate) => Promise<void>;
  deleteScheduledWorkflow: (scheduleId: string) => Promise<void>;
  triggerScheduledWorkflow: (scheduleId: string) => Promise<void>;
}

function createScheduledWorkflowRequest(draft: ScheduledWorkflowDraft, workflowTitle: string): CreateScheduledWorkflowScheduleRequest {
  return {
    workflowId: draft.workflowId,
    title: draft.title.trim() || workflowTitle,
    enabled: draft.enabled,
    intervalSeconds: intervalSecondsForFrequency(draft.frequency),
    frequency: draft.frequency,
    timeOfDay: normalizeScheduleTimeOfDay(draft.timeOfDay),
    timezone: draft.timezone || DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
    ...(draft.frequency === "weekly" ? { weekdays: normalizeScheduleWeekdays(draft.weekdays) } : {}),
    ...(draft.frequency === "monthly" ? { dayOfMonth: normalizeScheduleDayOfMonth(draft.dayOfMonth) } : {}),
  };
}

export function useScheduledWorkflowManager({
  chatApi,
  snapshot,
  snapshotRef,
  setSnapshot,
  runWorkflowGraphInternal,
  onEnterSchedules,
}: UseScheduledWorkflowManagerOptions): ScheduledWorkflowManager {
  const [scheduledWorkflowDraft, setScheduledWorkflowDraft] = useState<ScheduledWorkflowDraft>(() =>
    defaultScheduledWorkflowDraft(snapshot.workflowStore.workflows, snapshot.workflowStore.activeWorkflowId),
  );
  const [scheduledWorkflowMode, setScheduledWorkflowMode] = useState<"detail" | "create">("detail");
  const { handleScheduledWorkflowEvent } = useScheduledWorkflowRunner({
    chatApi,
    snapshotRef,
    setSnapshot,
    runWorkflowGraphInternal,
  });

  useEffect(() => {
    setScheduledWorkflowDraft((current) => {
      if (current.workflowId && snapshot.workflowStore.workflows.some((workflow) => workflow.workflowId === current.workflowId)) return current;
      return defaultScheduledWorkflowDraft(snapshot.workflowStore.workflows, snapshot.workflowStore.activeWorkflowId);
    });
  }, [snapshot.workflowStore.activeWorkflowId, snapshot.workflowStore.workflows]);

  useEffect(() => {
    return chatApi.onScheduledWorkflowEvent((event) => {
      void handleScheduledWorkflowEvent(event);
    });
  }, [chatApi, handleScheduledWorkflowEvent]);

  const connectScheduledRunner = useCallback(async (): Promise<void> => {
    const next = await chatApi.connectScheduledWorkflowRunner();
    setSnapshot(next);
  }, [chatApi, setSnapshot]);

  const disconnectScheduledRunner = useCallback(async (): Promise<void> => {
    const next = await chatApi.disconnectScheduledWorkflowRunner();
    setSnapshot(next);
  }, [chatApi, setSnapshot]);

  const refreshScheduledWorkflows = useCallback(async (): Promise<void> => {
    const next = await chatApi.refreshScheduledWorkflowSchedules();
    setSnapshot(next);
  }, [chatApi, setSnapshot]);

  const selectScheduledWorkflowSchedule = useCallback(async (scheduleId: string): Promise<void> => {
    setScheduledWorkflowMode("detail");
    const next = await chatApi.selectScheduledWorkflowSchedule(scheduleId);
    setSnapshot(next);
  }, [chatApi, setSnapshot]);

  const startCreatingScheduledWorkflow = useCallback((): void => {
    onEnterSchedules?.();
    setScheduledWorkflowMode("create");
    setScheduledWorkflowDraft(defaultScheduledWorkflowDraft(snapshot.workflowStore.workflows, snapshot.workflowStore.activeWorkflowId));
  }, [onEnterSchedules, snapshot.workflowStore.activeWorkflowId, snapshot.workflowStore.workflows]);

  const createScheduledWorkflow = useCallback(async (): Promise<void> => {
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === scheduledWorkflowDraft.workflowId);
    if (!workflow) return;
    const next = await chatApi.createScheduledWorkflowSchedule(createScheduledWorkflowRequest(scheduledWorkflowDraft, workflow.title));
    setScheduledWorkflowMode("detail");
    setSnapshot(next);
  }, [chatApi, scheduledWorkflowDraft, setSnapshot, snapshot.workflowStore.workflows]);

  const updateScheduledWorkflow = useCallback(async (schedule: ScheduledWorkflowSchedule, update: ScheduledWorkflowUpdate): Promise<void> => {
    const next = await chatApi.updateScheduledWorkflowSchedule(schedule.scheduleId, update);
    setSnapshot(next);
  }, [chatApi, setSnapshot]);

  const deleteScheduledWorkflow = useCallback(async (scheduleId: string): Promise<void> => {
    const next = await chatApi.deleteScheduledWorkflowSchedule(scheduleId);
    setSnapshot(next);
  }, [chatApi, setSnapshot]);

  const triggerScheduledWorkflow = useCallback(async (scheduleId: string): Promise<void> => {
    await chatApi.triggerScheduledWorkflowSchedule(scheduleId);
  }, [chatApi]);

  return {
    scheduledWorkflowDraft,
    scheduledWorkflowMode,
    setScheduledWorkflowDraft,
    connectScheduledRunner,
    disconnectScheduledRunner,
    refreshScheduledWorkflows,
    selectScheduledWorkflowSchedule,
    startCreatingScheduledWorkflow,
    createScheduledWorkflow,
    updateScheduledWorkflow,
    deleteScheduledWorkflow,
    triggerScheduledWorkflow,
  };
}
