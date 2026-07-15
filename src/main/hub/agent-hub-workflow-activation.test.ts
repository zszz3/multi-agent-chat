import { describe, expect, test } from "vitest";
import { AgentHub } from "./agent-hub";
import { createWorkflowV2InlineScriptSpec } from "../../shared/workflow-v2/definition";

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

  test("materializes parallel terminal nodes with one generated summary node", () => {
    const hub = new AgentHub();
    const workflowId = hub.createWorkflowDraft().workflowDraft!.workflowId;

    const result = hub.materializeWorkflowDraft(workflowId, {
      title: "Parallel workflow",
      objective: "Combine parallel results",
      definition: {
        workflowId,
        graphVersion: 1,
        objective: "Combine parallel results",
        nodes: [
          { id: "left", kind: "analysis", title: "Left", execModel: "llm", executionMode: "one-shot", prompt: "Analyze left.", outputFields: [{ key: "left", required: true }] },
          { id: "right", kind: "analysis", title: "Right", execModel: "llm", executionMode: "one-shot", prompt: "Analyze right.", outputFields: [{ key: "right", required: true }] },
        ],
        edges: [],
      },
    });

    expect(result.ok).toBe(true);
    const workflow = hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId)!;
    expect(workflow.definition.nodes.at(-1)).toMatchObject({
      id: "workflow-summary",
      outputFields: [{ key: "answer_markdown", required: true }],
    });
    expect(workflow.definition.edges).toEqual([
      { fromNodeId: "left", toNodeId: "workflow-summary" },
      { fromNodeId: "right", toNodeId: "workflow-summary" },
    ]);
    expect(workflow.workflowV2Plan?.definition).toEqual(workflow.definition);
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
    expect(hub.confirmWorkflow({ workflowId, ...(materialized.revision !== undefined ? { expectedRevision: materialized.revision } : {}) })).toMatchObject({ ok: true });
    const confirmed = hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId)!;
    hub.patchWorkflowDraft({ workflowId, objective: "Changed answer" });
    expect(hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId)?.confirmedRevision).toBeUndefined();
    expect(confirmed.confirmedRevision).toBe(confirmed.revision);
  });

  test("keeps optional review feedback until executable content changes", () => {
    const hub = new AgentHub();
    const workflowId = hub.createWorkflowDraft().workflowDraft!.workflowId;
    const materialized = hub.materializeWorkflowDraft(workflowId, { title: "Answer", objective: "Answer", definition: { workflowId, graphVersion: 1, objective: "Answer", nodes: [{ id: "answer", kind: "answer", title: "Answer", execModel: "llm", executionMode: "one-shot", prompt: "Answer.", outputFields: [{ key: "answer", required: true }] }], edges: [] } });
    const route = hub.snapshot().workflowDraft!;
    hub.patchWorkflowDraft({ workflowId, generationReview: { status: "approved", reviewerConfiguredAgentId: route.reviewerConfiguredAgentId, reviewerModelId: route.reviewerModelId, reviewedRevision: materialized.revision!, result: { verdict: "approve", reviewedRevision: materialized.revision!, summary: "Approved", findings: [], scriptRisks: {}, suggestions: [] }, updatedAt: 1 } });
    hub.patchWorkflowDraft({ workflowId, messages: [{ id: "m1", role: "user", content: "Looks good" }] });
    expect(hub.snapshot().workflowDraft).toMatchObject({ revision: materialized.revision, generationReview: { status: "approved", reviewedRevision: materialized.revision } });
    hub.patchWorkflowDraft({ workflowId, objective: "Changed" });
    expect(hub.snapshot().workflowDraft?.generationReview).toBeUndefined();
  });
});
