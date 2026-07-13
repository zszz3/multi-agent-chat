import { describe, expect, test } from "vitest";
import { AgentHub } from "./agent-hub";
import { createWorkflowV2InlineScriptSpec } from "../../shared/workflow-v2/definition";
import type { WorkflowV2GenerationReviewState } from "../../shared/workflow-v2/generation-review";

function approvedReview(revision: number, reviewerConfiguredAgentId: string, reviewerModelId: string): WorkflowV2GenerationReviewState {
  return { status: "approved", reviewerConfiguredAgentId, reviewerModelId, reviewedRevision: revision, result: { verdict: "approve", reviewedRevision: revision, summary: "Approved", findings: [], scriptRisks: {}, suggestions: [] }, updatedAt: 1 };
}

describe("AgentHub workflow materialization", () => {
  test("materializes into the originating Workflow without allocating another record", () => {
    const hub = new AgentHub();
    const source = hub.createWorkflowDraft({ configuredAgentId: "default-agent" }).workflowDraft!;
    const beforeCount = hub.snapshot().workflowStore.workflows.length;
    const result = hub.materializeWorkflowDraft(source.workflowId, {
      title: "Echo workflow",
      objective: "Echo user input",
      definition: { workflowId: "ignored", graphVersion: 1, objective: "Echo user input", nodes: [{ id: "echo", kind: "transform", title: "Echo", execModel: "script", executionMode: "script", script: createWorkflowV2InlineScriptSpec({ language: "typescript", code: "return inputs;" }), outputFields: [{ key: "output", required: true }] }], edges: [] },
    });
    expect(result).toMatchObject({ ok: true, workflowId: source.workflowId });
    expect(hub.snapshot().workflowStore.workflows).toHaveLength(beforeCount);
    expect(hub.snapshot().workflowDraft?.definition.workflowId).toBe(source.workflowId);
  });

  test("requires confirmation and invalidates it after a draft definition change", () => {
    const hub = new AgentHub();
    const workflowId = hub.createWorkflowDraft().workflowDraft!.workflowId;
    const materialized = hub.materializeWorkflowDraft(workflowId, {
      title: "Answer",
      objective: "Answer",
      definition: { workflowId, graphVersion: 1, objective: "Answer", nodes: [{ id: "answer", kind: "answer", title: "Answer", execModel: "llm", executionMode: "one-shot", prompt: "Answer.", outputFields: [{ key: "answer", required: true }] }], edges: [] },
    });
    expect(hub.runWorkflow({ workflowId })).toMatchObject({ ok: false, error: "Workflow must be confirmed before starting a run." });
    expect(hub.confirmWorkflow({ workflowId, ...(materialized.revision !== undefined ? { expectedRevision: materialized.revision } : {}) })).toMatchObject({ ok: false, error: "Workflow requires an approved adversarial review for the current revision." });
    const route = hub.snapshot().workflowDraft!;
    hub.patchWorkflowDraft({ workflowId, generationReview: approvedReview(materialized.revision!, route.reviewerConfiguredAgentId, route.reviewerModelId) });
    expect(hub.confirmWorkflow({ workflowId, expectedRevision: materialized.revision! })).toMatchObject({ ok: true });
    const confirmed = hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId)!;
    hub.patchWorkflowDraft({ workflowId, objective: "Changed answer" });
    expect(hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId)?.confirmedRevision).toBeUndefined();
    expect(confirmed.confirmedRevision).toBe(confirmed.revision);
  });

  test("invalidates an approved review only when executable content changes", () => {
    const hub = new AgentHub();
    const workflowId = hub.createWorkflowDraft().workflowDraft!.workflowId;
    const materialized = hub.materializeWorkflowDraft(workflowId, { title: "Answer", objective: "Answer", definition: { workflowId, graphVersion: 1, objective: "Answer", nodes: [{ id: "answer", kind: "answer", title: "Answer", execModel: "llm", executionMode: "one-shot", prompt: "Answer.", outputFields: [{ key: "answer", required: true }] }], edges: [] } });
    const route = hub.snapshot().workflowDraft!;
    hub.patchWorkflowDraft({ workflowId, generationReview: approvedReview(materialized.revision!, route.reviewerConfiguredAgentId, route.reviewerModelId) });
    hub.patchWorkflowDraft({ workflowId, messages: [{ id: "m1", role: "user", content: "Looks good" }] });
    expect(hub.snapshot().workflowDraft).toMatchObject({ revision: materialized.revision, generationReview: { status: "approved", reviewedRevision: materialized.revision } });
    hub.patchWorkflowDraft({ workflowId, objective: "Changed" });
    expect(hub.snapshot().workflowDraft?.generationReview).toBeUndefined();
  });
});
