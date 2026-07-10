import { describe, expect, test } from "vitest";
import type { WorkflowDraftState } from "../shared/types";
import { WorkflowStore } from "./workflow-store";

function cloneDraft(draft: WorkflowDraftState): WorkflowDraftState {
  return structuredClone(draft);
}

function createStore() {
  let now = 100;
  let workflowSequence = 0;
  let runSequence = 0;
  const store = new WorkflowStore({
    normalizeDraft: cloneDraft,
    now: () => now,
    createWorkflowId: () => `wf_${++workflowSequence}`,
    createRunId: () => `run_${++runSequence}`,
    onChange: () => undefined,
  });
  return {
    store,
    setNow(value: number) {
      now = value;
    },
  };
}

describe("WorkflowStore", () => {
  test("owns workflow selection and returns isolated snapshots", () => {
    const { store } = createStore();

    const workflow = store.createDraft({ configuredAgentId: "agent", modelId: "model" });

    expect(workflow?.workflowId).toBe("wf_1");
    expect(store.snapshot().activeWorkflowId).toBe("wf_1");
    const snapshot = store.snapshot();
    snapshot.workflows[0]!.title = "mutated outside";
    expect(store.getWorkflow("wf_1")?.title).not.toBe("mutated outside");
  });

  test("selects the most recently updated workflow after deleting the active one", () => {
    const { store, setNow } = createStore();
    const first = store.createDraft({ title: "First" })!;
    setNow(200);
    const second = store.createDraft({ title: "Second" })!;

    store.deleteWorkflow(second.workflowId);

    expect(store.snapshot().activeWorkflowId).toBe(first.workflowId);
  });

  test("rejects an update with a stale expected revision", () => {
    const { store } = createStore();
    const workflow = store.createDraft()!;

    const result = store.updateWorkflow({
      workflowId: workflow.workflowId,
      expectedRevision: 99,
      graph: workflow.graph,
    });

    expect(result).toMatchObject({ ok: false, workflowId: workflow.workflowId, revision: 1 });
  });

  test("tracks a run separately and mirrors its final state to the workflow", () => {
    const { store } = createStore();
    const workflow = store.createDraft()!;

    const started = store.startRun({ workflowId: workflow.workflowId, contextDocument: "context" });
    expect(started).toMatchObject({ ok: true, runId: "run_1" });

    store.finishRun({
      workflowId: workflow.workflowId,
      runId: "run_1",
      status: "completed",
      progress: [{ nodeId: "a", title: "A", status: "completed" }],
      finalReport: "done",
    });

    expect(store.getRun("run_1")).toMatchObject({ status: "completed", finalReport: "done" });
    expect(store.getWorkflow(workflow.workflowId)).toMatchObject({ status: "completed", finalReport: "done" });
  });
});
