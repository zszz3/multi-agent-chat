import type { WorkflowV2Node } from "../../../shared/workflow-v2/definition";
import { cloneWorkflowV2WorkerOutput, type WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";
import type { WorkflowV2ResultPacket } from "../../../shared/workflow-v2/planning";
import type {
  WorkflowV2ReviewResolution,
  WorkflowV2ReviewerInput,
  WorkflowV2ReviewerResponse,
  WorkflowV2ReviewRetryPolicy,
  WorkflowV2ReviewVerdict,
} from "../../../shared/workflow-v2/review";

export function createWorkflowV2ReviewerInput(input: {
  node: WorkflowV2Node;
  objective: string;
  output: WorkflowV2WorkerOutput;
}): WorkflowV2ReviewerInput {
  const clonedOutput = cloneWorkflowV2WorkerOutput(input.output);
  return {
    executorNodeId: input.node.id,
    objective: input.objective,
    constraints: input.node.execModel === "llm"
      ? (input.node.constraints ?? []).map((constraint) => ({ ...constraint }))
      : [],
    result: toResultPacket(clonedOutput),
  };
}

export function assertIndependentWorkflowV2Reviewer(
  executorNodeId: string,
  response: WorkflowV2ReviewerResponse,
): void {
  if (response.reviewerNodeId === executorNodeId) {
    throw new Error(`Workflow V2 node ${executorNodeId} cannot certify its own output.`);
  }
  if (!isWorkflowV2ReviewVerdict(response.verdict)) {
    throw new Error(`Workflow V2 reviewer ${response.reviewerNodeId} returned a malformed verdict.`);
  }
}

export function resolveWorkflowV2ReviewVerdict(
  verdict: WorkflowV2ReviewVerdict,
  retryPolicy: WorkflowV2ReviewRetryPolicy,
): WorkflowV2ReviewResolution {
  const reason = verdict.reasons.join(" ").trim() || `Reviewer returned ${verdict.decision}.`;
  if (verdict.decision === "accept") return { action: "accept", verdict: cloneVerdict(verdict), reason };
  if (verdict.decision === "escalate") return { action: "escalate", verdict: cloneVerdict(verdict), reason };
  if (retryPolicy.attempt <= retryPolicy.maxRetry) {
    return { action: "retry", verdict: cloneVerdict(verdict), reason };
  }
  if (retryPolicy.onExhausted === "skip") return { action: "skip", verdict: cloneVerdict(verdict), reason };
  if (retryPolicy.onExhausted === "ask_human") return { action: "pause", verdict: cloneVerdict(verdict), reason };
  return { action: "fail", verdict: cloneVerdict(verdict), reason };
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

function toResultPacket(output: WorkflowV2WorkerOutput): WorkflowV2ResultPacket {
  return {
    nodeId: output.nodeId,
    summary: output.summary,
    outputs: output.outputs,
    ...(output.evidence ? { evidence: output.evidence } : {}),
    ...(output.risks ? { risks: output.risks } : {}),
    ...(output.nextStepSuggestions ? { nextStepSuggestions: output.nextStepSuggestions } : {}),
  };
}

function cloneVerdict(verdict: WorkflowV2ReviewVerdict): WorkflowV2ReviewVerdict {
  return structuredClone(verdict);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
