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
import { isWorkflowV2ReviewVerdict as isSharedWorkflowV2ReviewVerdict } from "../../../shared/workflow-v2/review";

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
  return isSharedWorkflowV2ReviewVerdict(value);
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
