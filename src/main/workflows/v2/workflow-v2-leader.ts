import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";
import type { WorkflowV2RunState } from "../../../shared/workflow-v2/state";

export type WorkflowV2LeaderPlanHealth = "healthy" | "at-risk" | "blocked";

export interface WorkflowV2LeaderNavigation {
  nextNodeIds: string[];
  priorityNodeIds: string[];
  escalationHints: string[];
  planHealth: WorkflowV2LeaderPlanHealth;
}

export interface AssembleWorkflowV2LeaderNavigationInput {
  runState: WorkflowV2RunState;
  runnableNodeIds: string[];
  workerOutputs: WorkflowV2WorkerOutput[];
}

export function assembleWorkflowV2LeaderNavigation(
  input: AssembleWorkflowV2LeaderNavigationInput,
): WorkflowV2LeaderNavigation {
  const escalationHints = input.workerOutputs
    .flatMap((workerOutput) => workerOutput.proposals)
    .flatMap((proposal) => (proposal.kind === "escalate" ? [proposal.reason] : []));
  const planHealth = deriveWorkflowV2LeaderPlanHealth(input.runState.status, escalationHints.length > 0);
  const nextNodeIds = planHealth === "blocked" ? [] : [...input.runnableNodeIds];

  return {
    nextNodeIds,
    priorityNodeIds: [...nextNodeIds],
    escalationHints,
    planHealth,
  };
}

function deriveWorkflowV2LeaderPlanHealth(
  runStatus: WorkflowV2RunState["status"],
  hasEscalationHints: boolean,
): WorkflowV2LeaderPlanHealth {
  if (runStatus === "failed") return "blocked";
  if (hasEscalationHints) return "at-risk";
  return "healthy";
}
