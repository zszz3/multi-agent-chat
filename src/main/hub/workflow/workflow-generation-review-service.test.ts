import { describe, expect, test } from "vitest";
import type { WorkflowDraftState } from "../../../shared/types";
import { executeWorkflowGenerationReview } from "./workflow-generation-review-service";

const workflow = { workflowId: "wf", title: "Review", status: "draft", revision: 3, configuredAgentId: "manager", modelId: "manager-model", reviewerConfiguredAgentId: "reviewer", reviewerModelId: "review-model", objective: "Answer", definition: { workflowId: "wf", graphVersion: 1, objective: "Answer", nodes: [], edges: [] }, messages: [], reply: "", error: undefined, runProgress: [], runContextDocument: "", contextDocument: "", runIds: [], createdAt: 1, updatedAt: 1 } satisfies WorkflowDraftState;

describe("executeWorkflowGenerationReview", () => {
  test("binds approval to the exact workflow revision and reviewer route", async () => {
    const state = await executeWorkflowGenerationReview({ workflow, askReviewer: async () => ({ content: '{"verdict":"approve","reviewedRevision":3,"summary":"Good","findings":[],"scriptRisks":{},"suggestions":[]}' }), now: () => 9 });
    expect(state).toMatchObject({ status: "approved", reviewedRevision: 3, reviewerConfiguredAgentId: "reviewer", reviewerModelId: "review-model", updatedAt: 9 });
  });

  test("persists parse failures instead of implicitly approving", async () => {
    const state = await executeWorkflowGenerationReview({ workflow, askReviewer: async () => ({ content: "not-json" }), now: () => 9 });
    expect(state).toMatchObject({ status: "failed", reviewedRevision: 3, error: expect.any(String) });
  });
});
