import type { WorkflowV2Plan } from "../workflow-v2/planning";
import type { WorkflowV2HumanIntervention } from "../workflow-v2/review";

export type WorkflowRunNodeStatus = "queued" | "running" | "paused" | "awaiting_input" | "completed" | "failed";

export interface WorkflowRunProgressItem {
  nodeId: string;
  title: string;
  status: WorkflowRunNodeStatus;
  detail?: string;
  taskId?: string;
  intervention?: WorkflowV2HumanIntervention;
}

export type WorkflowEventType =
  | "node_ready"
  | "node_started"
  | "node_paused"
  | "node_output"
  | "node_judged"
  | "node_failed"
  | "node_completed"
  | "gate_opened"
  | "gate_answered";

export interface WorkflowArtifactReference {
  kind: "text" | "file" | "url";
  title: string;
  content?: string;
  path?: string;
  url?: string;
}

export interface WorkflowEvent {
  type: WorkflowEventType;
  nodeId: string;
  at: number;
  attempt?: number;
  taskId?: string;
  detail?: string;
  pass?: boolean;
  summary?: string;
  artifactRefs?: WorkflowArtifactReference[];
  error?: string;
  question?: string;
  answer?: string;
  intervention?: WorkflowV2HumanIntervention;
}

export type WorkflowStatus = "draft" | "running" | "waiting_for_user" | "completed" | "failed" | "stopped";

export function isWorkflowRunTerminalStatus(status: WorkflowStatus): boolean {
  return status === "completed" || status === "failed" || status === "stopped";
}

export interface WorkflowRunState {
  runId: string;
  workflowId: string;
  status: WorkflowStatus;
  workflowV2Plan: WorkflowV2Plan;
  progress: WorkflowRunProgressItem[];
  events: WorkflowEvent[];
  contextDocument: string;
  finalReport?: string;
  startedAt: number;
  finishedAt: number | undefined;
  lastError: string | undefined;
}
