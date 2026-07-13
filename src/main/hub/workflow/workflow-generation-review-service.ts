import type { WorkflowAgentResponse, WorkflowDraftState } from "../../../shared/types";
import type { WorkflowV2GenerationReviewState } from "../../../shared/workflow-v2/generation-review";
import { parseWorkflowV2GenerationReview, workflowV2GenerationReviewPrompt } from "../../workflows/v2/workflow-v2-generation-review";

export async function executeWorkflowGenerationReview(input: {
  workflow: WorkflowDraftState;
  askReviewer: (prompt: string) => Promise<WorkflowAgentResponse>;
  now?: () => number;
}): Promise<WorkflowV2GenerationReviewState> {
  const now = input.now ?? Date.now;
  try {
    const response = await input.askReviewer(workflowV2GenerationReviewPrompt({ definition: input.workflow.definition, revision: input.workflow.revision }));
    const result = parseWorkflowV2GenerationReview({ definition: input.workflow.definition, revision: input.workflow.revision, content: response.content });
    return { status: result.verdict === "approve" ? "approved" : "changes_requested", reviewerConfiguredAgentId: input.workflow.reviewerConfiguredAgentId, reviewerModelId: input.workflow.reviewerModelId, reviewedRevision: input.workflow.revision, result, updatedAt: now() };
  } catch (error) {
    return { status: "failed", reviewerConfiguredAgentId: input.workflow.reviewerConfiguredAgentId, reviewerModelId: input.workflow.reviewerModelId, reviewedRevision: input.workflow.revision, error: error instanceof Error ? error.message : String(error), updatedAt: now() };
  }
}
