import type { WorkflowV2ConstraintDef, WorkflowV2ExhaustedPolicy } from "./definition";
import type { WorkflowV2ResultPacket } from "./planning";
import type { WorkflowV2ProgressReport, WorkflowV2SupervisorDecision } from "./supervision";
import { isWorkflowV2ProgressReport, isWorkflowV2SupervisorDecision } from "./supervision";

export type WorkflowV2ReviewDecision = "accept" | "reject" | "escalate";
export type WorkflowV2ReviewRiskLevel = "low" | "medium" | "high";
export type WorkflowV2ReviewConfidence = "high" | "medium" | "low";

export interface WorkflowV2ReviewVerdict {
  decision: WorkflowV2ReviewDecision;
  reasons: string[];
  requiredFixes?: string[];
  riskLevel: WorkflowV2ReviewRiskLevel;
  evidence?: string[];
  confidence: WorkflowV2ReviewConfidence;
}

export interface WorkflowV2ReviewerInput {
  executorNodeId: string;
  objective: string;
  constraints: WorkflowV2ConstraintDef[];
  result: WorkflowV2ResultPacket;
}

export interface WorkflowV2ReviewerResponse {
  reviewerNodeId: string;
  verdict: WorkflowV2ReviewVerdict;
}

export type WorkflowV2ReviewAction = "accept" | "retry" | "fail" | "skip" | "pause" | "escalate";

export interface WorkflowV2ReviewResolution {
  action: WorkflowV2ReviewAction;
  verdict: WorkflowV2ReviewVerdict;
  reason: string;
}

export interface WorkflowV2ReviewRetryPolicy {
  attempt: number;
  maxRetry: number;
  onExhausted: WorkflowV2ExhaustedPolicy;
}

export type WorkflowV2InterventionAction = "continue" | "skip" | "escalate" | "replan" | "increase_review_strength";

export interface WorkflowV2HumanIntervention {
  nodeId: string;
  source:
    | "validation"
    | "review_rejection"
    | "review_escalation"
    | "supervision_pause"
    | "supervision_escalation";
  reason: string;
  allowedActions: WorkflowV2InterventionAction[];
  requestedAt: number;
  reviewVerdict?: WorkflowV2ReviewVerdict;
  progressReport?: WorkflowV2ProgressReport;
  supervisorDecision?: WorkflowV2SupervisorDecision;
  resumeConversation?: {
    runtimeId: string;
    codecVersion: string;
    payload: unknown;
  };
}

export function isWorkflowV2ReviewVerdict(value: unknown): value is WorkflowV2ReviewVerdict {
  if (!isRecord(value)) return false;
  if (value.decision !== "accept" && value.decision !== "reject" && value.decision !== "escalate") return false;
  if (!isStringArray(value.reasons)) return false;
  if (value.requiredFixes !== undefined && !isStringArray(value.requiredFixes)) return false;
  if (value.riskLevel !== "low" && value.riskLevel !== "medium" && value.riskLevel !== "high") return false;
  if (value.evidence !== undefined && !isStringArray(value.evidence)) return false;
  return value.confidence === "high" || value.confidence === "medium" || value.confidence === "low";
}

export function isWorkflowV2HumanIntervention(value: unknown): value is WorkflowV2HumanIntervention {
  if (!isRecord(value)) return false;
  if (typeof value.nodeId !== "string" || !value.nodeId.trim()) return false;
  if (!isInterventionSource(value.source)) return false;
  if (typeof value.reason !== "string" || !value.reason.trim()) return false;
  if (!Array.isArray(value.allowedActions) || !value.allowedActions.every(isWorkflowV2InterventionAction)) return false;
  if (typeof value.requestedAt !== "number" || !Number.isFinite(value.requestedAt) || value.requestedAt < 0) return false;
  if (value.reviewVerdict !== undefined && !isWorkflowV2ReviewVerdict(value.reviewVerdict)) return false;
  if (value.progressReport !== undefined && !isWorkflowV2ProgressReport(value.progressReport)) return false;
  if (value.supervisorDecision !== undefined && !isWorkflowV2SupervisorDecision(value.supervisorDecision)) return false;
  return value.resumeConversation === undefined || isResumeConversation(value.resumeConversation);
}

function isInterventionSource(value: unknown): value is WorkflowV2HumanIntervention["source"] {
  return value === "validation"
    || value === "review_rejection"
    || value === "review_escalation"
    || value === "supervision_pause"
    || value === "supervision_escalation";
}

export function isWorkflowV2InterventionAction(value: unknown): value is WorkflowV2InterventionAction {
  return value === "continue"
    || value === "skip"
    || value === "escalate"
    || value === "replan"
    || value === "increase_review_strength";
}

function isResumeConversation(value: unknown): value is NonNullable<WorkflowV2HumanIntervention["resumeConversation"]> {
  return isRecord(value)
    && typeof value.runtimeId === "string"
    && value.runtimeId.trim().length > 0
    && typeof value.codecVersion === "string"
    && value.codecVersion.trim().length > 0
    && Object.hasOwn(value, "payload");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
