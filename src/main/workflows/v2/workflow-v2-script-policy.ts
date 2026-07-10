import type { ExecuteWorkflowV2ScriptRequest } from "../workflow-runtime";
import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";

/**
 * Product policy for script execution until a trusted isolation backend and the
 * Phase 04 human-approval surface exist. Every mode fails closed deliberately.
 */
export async function executeWorkflowV2ScriptWithPolicy(
  input: ExecuteWorkflowV2ScriptRequest,
): Promise<WorkflowV2WorkerOutput> {
  if (input.sandboxMode === "full") {
    throw new Error("Workflow V2 full script execution requires human approval, which is not available before Phase 04.");
  }

  throw new Error(
    `Workflow V2 ${input.sandboxMode} sandbox policy is unavailable because no trusted isolation backend is configured.`,
  );
}
