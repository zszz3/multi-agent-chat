import { randomUUID } from "node:crypto";
import { DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE } from "../../../shared/types";
import type {
  RuntimeConversation,
  ScheduledWorkflowRun,
  ScheduledWorkflowRunnerConfig,
  ScheduledWorkflowRunnerStatus,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowStoreState,
  WorkflowDraftState,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowRunState,
  WorkflowStatus,
  WorkflowStoreState,
} from "../../../shared/types";
import { cloneRuntimeBindingSnapshot } from "../runtime/runtime-binding";
import {
  isScheduledWorkflowRunStatus,
  normalizeScheduledWorkflowDayOfMonth,
  normalizeScheduledWorkflowFrequency,
  normalizeScheduledWorkflowTimeOfDay,
  normalizeScheduledWorkflowWeekdays,
} from "../persisted/agent-hub-persistence";

export function cloneWorkflowGraphNode(node: WorkflowGraphNode): WorkflowGraphNode {
  const cloned: WorkflowGraphNode = {
    id: node.id,
    kind: node.kind,
    title: node.title,
    prompt: node.prompt,
  };
  if (
    node.position &&
    typeof node.position.x === "number" &&
    typeof node.position.y === "number" &&
    Number.isFinite(node.position.x) &&
    Number.isFinite(node.position.y)
  ) {
    cloned.position = { x: node.position.x, y: node.position.y };
  }
  if (typeof node.configuredAgentId === "string" && node.configuredAgentId) cloned.configuredAgentId = node.configuredAgentId;
  if (typeof node.modelId === "string" && node.modelId) cloned.modelId = node.modelId;
  return cloned;
}

export function cloneWorkflowGraphEdge(edge: WorkflowGraphEdge): WorkflowGraphEdge {
  return {
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
  };
}

export function cloneWorkflowGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    title: graph.title,
    objective: graph.objective,
    nodes: graph.nodes.map((node) => cloneWorkflowGraphNode(node)),
    edges: graph.edges.map((edge) => cloneWorkflowGraphEdge(edge)),
  };
}

export function normalizeWorkflowStatus(status: WorkflowStatus): WorkflowStatus {
  return status === "running" || status === "completed" || status === "failed" || status === "stopped" ? status : "draft";
}

export function cloneWorkflowRun(run: WorkflowRunState): WorkflowRunState {
  return {
    runId: run.runId,
    workflowId: run.workflowId,
    status: run.status,
    graphSnapshot: cloneWorkflowGraph(run.graphSnapshot),
    progress: run.progress.map((item) => ({
      nodeId: item.nodeId,
      title: item.title,
      status: item.status,
      ...(item.detail !== undefined ? { detail: item.detail } : {}),
      ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
    })),
    events: run.events.map((event) => ({ ...event })),
    contextDocument: run.contextDocument,
    ...(run.finalReport !== undefined ? { finalReport: run.finalReport } : {}),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    lastError: run.lastError,
  };
}

export function cloneScheduledWorkflowRunnerConfig(config: ScheduledWorkflowRunnerConfig): ScheduledWorkflowRunnerConfig {
  return {
    baseUrl: config.baseUrl?.trim() ?? "",
    ...(config.tenantId !== undefined ? { tenantId: config.tenantId } : {}),
    ...(config.userId !== undefined ? { userId: config.userId } : {}),
    ...(config.deviceName !== undefined ? { deviceName: config.deviceName } : {}),
    ...(config.deviceId !== undefined ? { deviceId: config.deviceId } : {}),
    ...(config.runnerToken !== undefined ? { runnerToken: config.runnerToken } : {}),
  };
}

export function cloneScheduledWorkflowSchedule(input: {
  schedule: ScheduledWorkflowSchedule;
  workflowTitle?: string;
  now?: number;
}): ScheduledWorkflowSchedule {
  const { schedule, workflowTitle, now = Date.now() } = input;
  return {
    scheduleId: schedule.scheduleId || `sched_${randomUUID()}`,
    workflowId: schedule.workflowId,
    title: schedule.title || workflowTitle || "Scheduled workflow",
    enabled: schedule.enabled !== false,
    intervalSeconds: Math.max(60, Math.floor(schedule.intervalSeconds || 3600)),
    frequency: normalizeScheduledWorkflowFrequency(schedule.frequency),
    timeOfDay: normalizeScheduledWorkflowTimeOfDay(schedule.timeOfDay),
    timezone: schedule.timezone?.trim() || DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
    ...(normalizeScheduledWorkflowWeekdays(schedule.weekdays) !== undefined ? { weekdays: normalizeScheduledWorkflowWeekdays(schedule.weekdays) } : {}),
    ...(normalizeScheduledWorkflowDayOfMonth(schedule.dayOfMonth) !== undefined ? { dayOfMonth: normalizeScheduledWorkflowDayOfMonth(schedule.dayOfMonth) } : {}),
    ...(schedule.nextRunAt !== undefined ? { nextRunAt: schedule.nextRunAt } : {}),
    ...(schedule.lastRunAt !== undefined ? { lastRunAt: schedule.lastRunAt } : {}),
    source: schedule.source === "local" ? "local" : "cloud",
    createdAt: Number.isFinite(schedule.createdAt) ? schedule.createdAt : now,
    updatedAt: Number.isFinite(schedule.updatedAt) ? schedule.updatedAt : now,
  };
}

export function cloneScheduledWorkflowRun(input: {
  run: ScheduledWorkflowRun;
  scheduleTitle?: string;
  now?: number;
}): ScheduledWorkflowRun {
  const { run, scheduleTitle, now = Date.now() } = input;
  return {
    runId: run.runId || `scheduled_run_${randomUUID()}`,
    scheduleId: run.scheduleId,
    workflowId: run.workflowId,
    ...(run.eventId !== undefined ? { eventId: run.eventId } : {}),
    ...(run.workflowRunId !== undefined ? { workflowRunId: run.workflowRunId } : {}),
    title: run.title || scheduleTitle || "Scheduled workflow",
    status: isScheduledWorkflowRunStatus(run.status) ? run.status : "failed",
    startedAt: Number.isFinite(run.startedAt) ? run.startedAt : now,
    finishedAt: run.finishedAt,
    ...(run.message !== undefined ? { message: run.message } : {}),
  };
}

export function cloneWorkflowDraft(input: {
  draft: WorkflowDraftState;
  normalizeConfiguredAgentId: (configuredAgentId: string | undefined) => string;
  normalizeModelId: (configuredAgentId: string | undefined, modelId: string | undefined) => string;
  cloneConversation: (conversation: RuntimeConversation) => RuntimeConversation;
  now?: number;
}): WorkflowDraftState {
  const { draft, normalizeConfiguredAgentId, normalizeModelId, cloneConversation, now = Date.now() } = input;
  return {
    workflowId: draft.workflowId || `wf_${randomUUID()}`,
    title: draft.title || draft.graph.title || draft.objective || "Untitled workflow",
    status: normalizeWorkflowStatus(draft.status),
    revision: Number.isFinite(draft.revision) && draft.revision > 0 ? Math.floor(draft.revision) : 1,
    configuredAgentId: draft.runtimeBinding?.configuredAgent.id ?? normalizeConfiguredAgentId(draft.configuredAgentId),
    modelId: draft.runtimeBinding?.modelId ?? normalizeModelId(draft.configuredAgentId, draft.modelId),
    objective: draft.objective,
    ...(draft.workDir ? { workDir: draft.workDir } : {}),
    graph: cloneWorkflowGraph(draft.graph),
    graphReady: draft.graphReady,
    messages: draft.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
    reply: draft.reply,
    error: draft.error,
    runProgress: draft.runProgress.map((item) => ({
      nodeId: item.nodeId,
      title: item.title,
      status: item.status,
      ...(item.detail !== undefined ? { detail: item.detail } : {}),
      ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
    })),
    runContextDocument: draft.runContextDocument,
    contextDocument: draft.contextDocument,
    ...(draft.finalReport !== undefined ? { finalReport: draft.finalReport } : {}),
    runIds: draft.runIds.map((runId) => runId),
    ...(draft.runtimeConversation ? { runtimeConversation: cloneConversation(draft.runtimeConversation) } : {}),
    ...(draft.runtimeBinding ? { runtimeBinding: cloneRuntimeBindingSnapshot(draft.runtimeBinding) } : {}),
    createdAt: draft.createdAt || draft.updatedAt || now,
    updatedAt: draft.updatedAt,
  };
}

export function cloneWorkflowStore(input: {
  activeWorkflowId: string | undefined;
  workflows: Iterable<WorkflowDraftState>;
  workflowRuns: Iterable<WorkflowRunState>;
  cloneDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  cloneRun: (run: WorkflowRunState) => WorkflowRunState;
}): WorkflowStoreState {
  const workflows = [...input.workflows];
  const workflowRuns = [...input.workflowRuns];
  return {
    activeWorkflowId: input.activeWorkflowId,
    workflows: workflows
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((workflow) => input.cloneDraft(workflow)),
    runs: workflowRuns
      .sort((left, right) => right.startedAt - left.startedAt)
      .map((run) => input.cloneRun(run)),
  };
}

export function cloneScheduledWorkflowStore(input: {
  activeScheduleId: string | undefined;
  runnerConfig: ScheduledWorkflowRunnerConfig;
  runnerStatus: ScheduledWorkflowRunnerStatus;
  schedules: Iterable<ScheduledWorkflowSchedule>;
  runs: Iterable<ScheduledWorkflowRun>;
  cloneRunnerConfig: (config: ScheduledWorkflowRunnerConfig) => ScheduledWorkflowRunnerConfig;
  cloneSchedule: (schedule: ScheduledWorkflowSchedule) => ScheduledWorkflowSchedule;
  cloneRun: (run: ScheduledWorkflowRun) => ScheduledWorkflowRun;
}): ScheduledWorkflowStoreState {
  const schedules = [...input.schedules];
  const runs = [...input.runs];
  return {
    activeScheduleId: input.activeScheduleId,
    runnerConfig: input.cloneRunnerConfig(input.runnerConfig),
    runnerStatus: { ...input.runnerStatus },
    schedules: schedules
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((schedule) => input.cloneSchedule(schedule)),
    runs: runs
      .sort((left, right) => right.startedAt - left.startedAt)
      .map((run) => input.cloneRun(run)),
  };
}
