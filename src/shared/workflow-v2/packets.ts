import type { WorkflowV2ResultPacket } from "./planning";

export type WorkflowV2WorkProposal =
  | { kind: "continue"; reason: string; targetNodeIds?: string[] }
  | { kind: "retry"; reason: string; targetNodeId?: string }
  | { kind: "escalate"; reason: string }
  | { kind: "graph-revision"; reason: string };

export interface WorkflowV2WorkerOutput extends WorkflowV2ResultPacket {
  proposals: WorkflowV2WorkProposal[];
}

export function cloneWorkflowV2WorkerOutput(output: WorkflowV2WorkerOutput): WorkflowV2WorkerOutput {
  return {
    ...output,
    outputs: structuredClone(output.outputs),
    ...(output.evidence ? { evidence: [...output.evidence] } : {}),
    ...(output.risks ? { risks: [...output.risks] } : {}),
    ...(output.nextStepSuggestions ? { nextStepSuggestions: [...output.nextStepSuggestions] } : {}),
    proposals: structuredClone(output.proposals),
  };
}
