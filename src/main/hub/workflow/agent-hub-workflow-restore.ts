import { randomUUID } from "node:crypto";
import { DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE } from "../../../shared/types";
import type {
  RuntimeConversation,
  ScheduledWorkflowRun,
  ScheduledWorkflowRunnerConfig,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowStoreState,
  WorkflowDraftState,
  WorkflowEvent,
  WorkflowRunProgressItem,
  WorkflowRunState,
  WorkflowV2Plan,
  WorkflowStoreState,
} from "../../../shared/types";
import {
  asArray,
  asNumber,
  asOptionalString,
  asRecord,
  isScheduledWorkflowRunStatus,
  isWorkflowDraftMessageRole,
  normalizeScheduledWorkflowDayOfMonth,
  normalizeScheduledWorkflowFrequency,
  normalizeScheduledWorkflowTimeOfDay,
  normalizeScheduledWorkflowWeekdays,
} from "../persisted/agent-hub-persistence";
import {
  restoreWorkflowDraftStatus,
  restoreWorkflowEvent,
  restoreWorkflowGraph,
  restoreWorkflowRunProgressItem,
  restoreWorkflowRunStatus,
} from "../state/agent-hub-restore";
import { cloneWorkflowV2Plan } from "../../../shared/workflow-v2/planning";

function restoreWorkflowV2Plan(raw: unknown): WorkflowV2Plan | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  if (!asOptionalString(record.workflowId) || !asOptionalString(record.objective) || typeof record.graphVersion !== "number") {
    return undefined;
  }
  try {
    return cloneWorkflowV2Plan(record as unknown as WorkflowV2Plan);
  } catch {
    return undefined;
  }
}

export function restoreScheduledWorkflowRunnerConfig(
  raw: unknown,
  cloneRunnerConfig: (config: ScheduledWorkflowRunnerConfig) => ScheduledWorkflowRunnerConfig,
): ScheduledWorkflowRunnerConfig | undefined {
  const configRecord = asRecord(raw);
  if (!configRecord) return undefined;
  return cloneRunnerConfig({
    baseUrl: asOptionalString(configRecord.baseUrl) ?? "",
    ...(asOptionalString(configRecord.tenantId) !== undefined ? { tenantId: asOptionalString(configRecord.tenantId) } : {}),
    ...(asOptionalString(configRecord.userId) !== undefined ? { userId: asOptionalString(configRecord.userId) } : {}),
    ...(asOptionalString(configRecord.deviceName) !== undefined ? { deviceName: asOptionalString(configRecord.deviceName) } : {}),
    ...(asOptionalString(configRecord.deviceId) !== undefined ? { deviceId: asOptionalString(configRecord.deviceId) } : {}),
    ...(asOptionalString(configRecord.runnerToken) !== undefined ? { runnerToken: asOptionalString(configRecord.runnerToken) } : {}),
  });
}

export function restoreScheduledWorkflowSchedule(
  raw: unknown,
  deps: {
    hasWorkflow: (workflowId: string) => boolean;
    workflowTitle: (workflowId: string) => string | undefined;
    cloneScheduledWorkflowSchedule: (schedule: ScheduledWorkflowSchedule) => ScheduledWorkflowSchedule;
  },
): ScheduledWorkflowSchedule | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const scheduleId = asOptionalString(record.scheduleId);
  const workflowId = asOptionalString(record.workflowId);
  if (!scheduleId || !workflowId || !deps.hasWorkflow(workflowId)) return undefined;
  return deps.cloneScheduledWorkflowSchedule({
    scheduleId,
    workflowId,
    title: asOptionalString(record.title) ?? deps.workflowTitle(workflowId) ?? "Scheduled workflow",
    enabled: record.enabled !== false,
    intervalSeconds: Math.max(60, Math.floor(asNumber(record.intervalSeconds, 3600))),
    frequency: normalizeScheduledWorkflowFrequency(record.frequency ?? record.scheduleType),
    timeOfDay: normalizeScheduledWorkflowTimeOfDay(record.timeOfDay),
    timezone: asOptionalString(record.timezone)?.trim() || DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
    ...(normalizeScheduledWorkflowWeekdays(record.weekdays) !== undefined ? { weekdays: normalizeScheduledWorkflowWeekdays(record.weekdays) } : {}),
    ...(normalizeScheduledWorkflowDayOfMonth(record.dayOfMonth) !== undefined ? { dayOfMonth: normalizeScheduledWorkflowDayOfMonth(record.dayOfMonth) } : {}),
    ...(typeof record.nextRunAt === "number" ? { nextRunAt: record.nextRunAt } : {}),
    ...(typeof record.lastRunAt === "number" ? { lastRunAt: record.lastRunAt } : {}),
    source: record.source === "local" ? "local" : "cloud",
    createdAt: asNumber(record.createdAt, Date.now()),
    updatedAt: asNumber(record.updatedAt, Date.now()),
  });
}

export function restoreScheduledWorkflowRun(
  raw: unknown,
  deps: {
    hasWorkflow: (workflowId: string) => boolean;
    scheduledWorkflowTitle: (scheduleId: string) => string | undefined;
    cloneScheduledWorkflowRun: (run: ScheduledWorkflowRun) => ScheduledWorkflowRun;
  },
): ScheduledWorkflowRun | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const runId = asOptionalString(record.runId);
  const scheduleId = asOptionalString(record.scheduleId);
  const workflowId = asOptionalString(record.workflowId);
  if (!runId || !scheduleId || !workflowId || !deps.hasWorkflow(workflowId)) return undefined;
  const status = isScheduledWorkflowRunStatus(record.status) ? record.status : "failed";
  return deps.cloneScheduledWorkflowRun({
    runId,
    scheduleId,
    workflowId,
    ...(asOptionalString(record.eventId) !== undefined ? { eventId: asOptionalString(record.eventId) } : {}),
    ...(asOptionalString(record.workflowRunId) !== undefined ? { workflowRunId: asOptionalString(record.workflowRunId) } : {}),
    title: asOptionalString(record.title) ?? deps.scheduledWorkflowTitle(scheduleId) ?? "Scheduled workflow",
    status: status === "running" || status === "queued" ? "failed" : status,
    startedAt: asNumber(record.startedAt, Date.now()),
    finishedAt: typeof record.finishedAt === "number" ? record.finishedAt : undefined,
    ...((asOptionalString(record.message) ?? (status === "running" || status === "queued" ? "Interrupted before app restart" : undefined)) !== undefined
      ? { message: asOptionalString(record.message) ?? "Interrupted before app restart" }
      : {}),
  });
}

export function restoreWorkflowDraft(
  raw: unknown,
  deps: {
    restoreRuntimeConversation: (rawConversation: unknown) => RuntimeConversation | undefined;
    cloneWorkflowDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  },
): WorkflowDraftState | undefined {
  const record = asRecord(raw);
  if (!record || "agentSessionId" in record) return undefined;
  const graph = restoreWorkflowGraph(record.graph);
  if (!graph) return undefined;
  const finalReport = asOptionalString(record.finalReport);
  const restoredRuntimeConversation =
    record.runtimeConversation === undefined ? undefined : deps.restoreRuntimeConversation(record.runtimeConversation);
  if (record.runtimeConversation !== undefined && !restoredRuntimeConversation) return undefined;
  const restoredWorkflowV2Plan =
    record.workflowV2Plan === undefined ? undefined : restoreWorkflowV2Plan(record.workflowV2Plan);
  if (record.workflowV2Plan !== undefined && !restoredWorkflowV2Plan) return undefined;
  return deps.cloneWorkflowDraft({
    workflowId: asOptionalString(record.workflowId) ?? `wf_${randomUUID()}`,
    title: asOptionalString(record.title) ?? graph.title,
    status: restoreWorkflowDraftStatus(record.status),
    revision: Math.max(1, Math.floor(asNumber(record.revision, 1))),
    configuredAgentId: asOptionalString(record.configuredAgentId) ?? "",
    modelId: asOptionalString(record.modelId) ?? "",
    objective: asOptionalString(record.objective) ?? graph.objective,
    ...(asOptionalString(record.workDir) ? { workDir: asOptionalString(record.workDir) as string } : {}),
    graph,
    graphReady: record.graphReady === true,
    messages: asArray(record.messages)
      .map((message) => {
        const messageRecord = asRecord(message);
        if (!messageRecord || !isWorkflowDraftMessageRole(messageRecord.role)) return undefined;
        return {
          id: asOptionalString(messageRecord.id) ?? randomUUID(),
          role: messageRecord.role,
          content: asOptionalString(messageRecord.content) ?? "",
        };
      })
      .filter((message): message is WorkflowDraftState["messages"][number] => Boolean(message)),
    reply: asOptionalString(record.reply) ?? "",
    error: asOptionalString(record.error),
    runProgress: asArray(record.runProgress)
      .map((item) => restoreWorkflowRunProgressItem(item))
      .filter((item): item is WorkflowRunProgressItem => Boolean(item)),
    runContextDocument: asOptionalString(record.runContextDocument) ?? "",
    contextDocument: asOptionalString(record.contextDocument) ?? "",
    ...(restoredWorkflowV2Plan ? { workflowV2Plan: restoredWorkflowV2Plan } : {}),
    ...(finalReport !== undefined ? { finalReport } : {}),
    runIds: asArray(record.runIds).map((item) => asOptionalString(item)).filter((item): item is string => Boolean(item)),
    ...(restoredRuntimeConversation ? { runtimeConversation: restoredRuntimeConversation } : {}),
    createdAt: asNumber(record.createdAt, asNumber(record.updatedAt, Date.now())),
    updatedAt: asNumber(record.updatedAt, Date.now()),
  });
}

export function restoreWorkflowRun(raw: unknown): WorkflowRunState | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const runId = asOptionalString(record.runId);
  const workflowId = asOptionalString(record.workflowId);
  const graphSnapshot = restoreWorkflowGraph(record.graphSnapshot);
  if (!runId || !workflowId || !graphSnapshot) return undefined;
  const finalReport = asOptionalString(record.finalReport);
  const restoredWorkflowV2Plan =
    record.workflowV2Plan === undefined ? undefined : restoreWorkflowV2Plan(record.workflowV2Plan);
  if (record.workflowV2Plan !== undefined && !restoredWorkflowV2Plan) return undefined;
  return {
    runId,
    workflowId,
    status: restoreWorkflowRunStatus(record.status),
    graphSnapshot,
    ...(restoredWorkflowV2Plan ? { workflowV2Plan: restoredWorkflowV2Plan } : {}),
    progress: asArray(record.progress)
      .map((item) => restoreWorkflowRunProgressItem(item))
      .filter((item): item is WorkflowRunProgressItem => Boolean(item)),
    events: asArray(record.events)
      .map((event) => restoreWorkflowEvent(event))
      .filter((event): event is WorkflowEvent => Boolean(event)),
    contextDocument: asOptionalString(record.contextDocument) ?? "",
    ...(finalReport !== undefined ? { finalReport } : {}),
    startedAt: asNumber(record.startedAt, Date.now()),
    finishedAt: typeof record.finishedAt === "number" ? record.finishedAt : undefined,
    lastError: asOptionalString(record.lastError),
  };
}

export function restoreWorkflowStoreCollections(
  rawStore: unknown,
  deps: {
    restoreWorkflowDraft: (raw: unknown) => WorkflowDraftState | undefined;
    restoreWorkflowRun: (raw: unknown) => WorkflowRunState | undefined;
  },
): WorkflowStoreState | undefined {
  if (rawStore === undefined) {
    return {
      activeWorkflowId: undefined,
      workflows: [],
      runs: [],
    };
  }
  const storeRecord = asRecord(rawStore);
  if (!storeRecord) return undefined;

  const workflows: WorkflowDraftState[] = [];
  for (const item of asArray(storeRecord.workflows)) {
    const workflow = deps.restoreWorkflowDraft(item);
    if (!workflow) return undefined;
    workflows.push(workflow);
  }

  const runs: WorkflowRunState[] = [];
  for (const item of asArray(storeRecord.runs)) {
    const run = deps.restoreWorkflowRun(item);
    if (!run) return undefined;
    runs.push(run);
  }

  const activeWorkflowId = asOptionalString(storeRecord.activeWorkflowId);
  return {
    activeWorkflowId:
      activeWorkflowId && workflows.some((workflow) => workflow.workflowId === activeWorkflowId)
        ? activeWorkflowId
        : [...workflows].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.workflowId,
    workflows,
    runs,
  };
}

export function restoreScheduledWorkflowStoreCollections(
  rawStore: unknown,
  deps: {
    restoreRunnerConfig: (raw: unknown) => ScheduledWorkflowRunnerConfig | undefined;
    restoreSchedule: (raw: unknown) => ScheduledWorkflowSchedule | undefined;
    restoreRun: (raw: unknown) => ScheduledWorkflowRun | undefined;
  },
): ScheduledWorkflowStoreState {
  const storeRecord = asRecord(rawStore);
  const schedules: ScheduledWorkflowSchedule[] = [];
  const runs: ScheduledWorkflowRun[] = [];

  if (storeRecord) {
    for (const item of asArray(storeRecord.schedules)) {
      const schedule = deps.restoreSchedule(item);
      if (schedule) schedules.push(schedule);
    }
    for (const item of asArray(storeRecord.runs)) {
      const run = deps.restoreRun(item);
      if (run) runs.push(run);
    }
  }

  const activeScheduleId = asOptionalString(storeRecord?.activeScheduleId);
  return {
    activeScheduleId:
      activeScheduleId && schedules.some((schedule) => schedule.scheduleId === activeScheduleId)
        ? activeScheduleId
        : [...schedules].sort((left, right) => right.createdAt - left.createdAt)[0]?.scheduleId,
    runnerConfig: deps.restoreRunnerConfig(storeRecord?.runnerConfig) ?? { baseUrl: "" },
    runnerStatus: { connected: false, connecting: false },
    schedules,
    runs,
  };
}
