import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { WorkflowDraftState, WorkflowRunState } from "../../../shared/types";
import type { WorkflowV2Definition } from "../../../shared/workflow-v2/definition";
import { createWorkflowV2RunState } from "../../../shared/workflow-v2/state";
import {
  isWorkflowV2PersistedRunState,
  WORKFLOW_V2_STORAGE_SCHEMA_VERSION,
  type WorkflowV2PersistedRunState,
} from "../../../shared/workflow-v2/storage";
import { buildWorkflowV2Plan } from "../../workflows/v2/workflow-v2-planner";
import { transitionWorkflowV2NodeState } from "../../workflows/v2/workflow-v2-scheduler";
import { WorkflowV2FileStore } from "../../workflows/v2/workflow-v2-store";
import { AgentHub } from "../agent-hub";
import { reconcileWorkflowV2RunFromDurableState } from "./agent-hub-workflow-restore";

function definition(workflowId = "workflow-recovery"): WorkflowV2Definition {
  return {
    workflowId,
    graphVersion: 2,
    objective: "Recover the durable Workflow V2 projection",
    nodes: [
      {
        id: "draft",
        kind: "implementation",
        title: "Draft",
        execModel: "llm",
        executionMode: "one-shot",
        prompt: "Draft the change.",
        outputFields: [{ key: "draft", required: true }],
      },
      {
        id: "verify",
        kind: "verification",
        title: "Verify",
        execModel: "script",
        executionMode: "script",
        sandboxMode: "workspace",
        script: { language: "bash", code: "true", timeoutMs: 1_000 },
        outputFields: [{ key: "verified", required: true }],
      },
    ],
    edges: [{ fromNodeId: "draft", toNodeId: "verify" }],
  };
}

async function fixture(): Promise<{
  workflow: WorkflowDraftState;
  run: WorkflowRunState;
  persisted: WorkflowV2PersistedRunState;
}> {
  const workflowDefinition = definition();
  const plan = await buildWorkflowV2Plan({ definition: workflowDefinition, approvedBy: "restore-test", now: 1_000 });
  const workflow: WorkflowDraftState = {
    workflowId: workflowDefinition.workflowId,
    title: "Recovery workflow",
    status: "running",
    revision: 1,
    configuredAgentId: "agent-a",
    modelId: "model-a",
    objective: workflowDefinition.objective,
    definition: workflowDefinition,
    messages: [],
    reply: "",
    error: undefined,
    runProgress: [],
    runContextDocument: "# Run context",
    contextDocument: "# Workflow context",
    workflowV2Plan: plan,
    runIds: ["run-recovery"],
    createdAt: 900,
    updatedAt: 1_000,
  };
  const run: WorkflowRunState = {
    runId: "run-recovery",
    workflowId: workflow.workflowId,
    status: "running",
    workflowV2Plan: plan,
    progress: [{ nodeId: "draft", title: "Draft", status: "running" }],
    events: [],
    contextDocument: "# Run context",
    startedAt: 1_000,
    finishedAt: undefined,
    lastError: undefined,
  };
  const persisted: WorkflowV2PersistedRunState = {
    schemaVersion: WORKFLOW_V2_STORAGE_SCHEMA_VERSION,
    workflowId: workflow.workflowId,
    runId: run.runId,
    graphVersion: workflowDefinition.graphVersion,
    savedAt: 1_500,
    eventCount: 2,
    plan,
    runState: createWorkflowV2RunState({ definition: workflowDefinition, maxParallelNodes: 4 }),
    workerOutputs: [],
    nodeControl: { draft: { extensionCount: 0 }, verify: { extensionCount: 0 } },
  };
  return { workflow, run, persisted };
}

describe("Workflow V2 AgentHub durable restore", () => {
  test("projects a paused durable run as stopped and resumable without losing completed work", async () => {
    const input = await fixture();
    let state = transitionWorkflowV2NodeState(input.persisted.runState, { nodeId: "draft", status: "running", now: 1_100 });
    state = transitionWorkflowV2NodeState(state, { nodeId: "draft", status: "completed", now: 1_200 });
    state = transitionWorkflowV2NodeState(state, { nodeId: "verify", status: "running", now: 1_300 });
    state = transitionWorkflowV2NodeState(state, {
      nodeId: "verify",
      status: "paused",
      now: 1_400,
      intervention: {
        nodeId: "verify",
        source: "supervision_pause",
        reason: "Checkpoint captured before restart.",
        allowedActions: ["continue", "skip"],
        requestedAt: 1_400,
      },
    });
    input.persisted.runState = state;
    input.persisted.workerOutputs = [{
      nodeId: "draft",
      summary: "Draft persisted",
      outputs: { draft: "const durable = true;" },
      proposals: [],
    }];

    const restored = reconcileWorkflowV2RunFromDurableState({ ...input, updateWorkflowProjection: true });

    expect(restored?.run).toMatchObject({
      status: "stopped",
      finishedAt: undefined,
      lastError: undefined,
      progress: [
        { nodeId: "draft", status: "completed", detail: "Draft persisted" },
        {
          nodeId: "verify",
          status: "paused",
          detail: "Checkpoint captured before restart.",
          intervention: expect.objectContaining({ allowedActions: ["continue", "skip"] }),
        },
      ],
      events: [expect.objectContaining({ type: "node_paused", nodeId: "verify" })],
    });
    expect(restored?.workflow).toMatchObject({ status: "stopped", error: undefined });
    expect(restored?.run.finalReport).toBeUndefined();
  });

  test("repairs a missed public completion from the authoritative durable checkpoint", async () => {
    const input = await fixture();
    let state = transitionWorkflowV2NodeState(input.persisted.runState, { nodeId: "draft", status: "running", now: 1_100 });
    state = transitionWorkflowV2NodeState(state, { nodeId: "draft", status: "completed", now: 1_200 });
    state = transitionWorkflowV2NodeState(state, { nodeId: "verify", status: "running", now: 1_300 });
    state = transitionWorkflowV2NodeState(state, { nodeId: "verify", status: "completed", now: 1_400 });
    input.persisted.runState = state;
    input.persisted.workerOutputs = [
      { nodeId: "draft", summary: "Draft persisted", outputs: { draft: "done" }, proposals: [] },
      { nodeId: "verify", summary: "Verification persisted", outputs: { verified: true }, proposals: [] },
    ];

    const restored = reconcileWorkflowV2RunFromDurableState({ ...input, updateWorkflowProjection: true });

    expect(restored?.run.status).toBe("completed");
    expect(restored?.run.finishedAt).toBe(1_500);
    expect(restored?.run.finalReport).toContain("Verification persisted");
    expect(restored?.workflow).toMatchObject({ status: "completed", finalReport: expect.stringContaining("Draft persisted") });
  });

  test("rejects durable state that does not belong to the public run", async () => {
    const input = await fixture();
    input.persisted.runId = "another-run";

    expect(reconcileWorkflowV2RunFromDurableState({ ...input, updateWorkflowProjection: true })).toBeUndefined();
  });

  test("reconciles and persists a recoverable durable run during AgentHub startup", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "workflow-v2-hub-restore-"));
    const storagePath = path.join(rootDir, "state.json");
    const hub = new AgentHub();
    await hub.loadPersistedState(storagePath);
    const workflowDefinition = definition("startup-recovery-placeholder");
    const created = hub.createWorkflow({
      title: "Startup recovery",
      objective: "Reconcile durable state",
      definition: workflowDefinition,
    });
    expect(created).toMatchObject({ ok: true, workflowId: expect.any(String) });
    const workflowId = created.workflowId!;
    const createdWorkflow = hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId)!;
    const frozenDefinition = createdWorkflow.workflowV2Plan!.definition;
    const started = hub.startWorkflowRun({ workflowId });
    expect(started).toMatchObject({ ok: true, runId: expect.any(String) });
    const runId = started.runId!;
    await hub.flushPersistence();

    let durableRunState = createWorkflowV2RunState({ definition: frozenDefinition, maxParallelNodes: 4 });
    durableRunState = transitionWorkflowV2NodeState(durableRunState, { nodeId: "draft", status: "running", now: 2_000 });
    durableRunState = transitionWorkflowV2NodeState(durableRunState, { nodeId: "draft", status: "completed", now: 2_100 });
    durableRunState = transitionWorkflowV2NodeState(durableRunState, { nodeId: "verify", status: "running", now: 2_200 });
    durableRunState = transitionWorkflowV2NodeState(durableRunState, {
      nodeId: "verify",
      status: "paused",
      now: 2_300,
      error: "Paused before restart",
    });
    const durableState = {
      schemaVersion: WORKFLOW_V2_STORAGE_SCHEMA_VERSION,
      workflowId,
      runId,
      graphVersion: workflowDefinition.graphVersion,
      savedAt: 2_400,
      eventCount: 4,
      plan: createdWorkflow.workflowV2Plan!,
      runState: durableRunState,
      workerOutputs: [{
        nodeId: "draft",
        summary: "Durable draft",
        outputs: { draft: "const durable = true;" },
        proposals: [],
      }],
      nodeControl: {
        draft: { extensionCount: 0 },
        verify: { extensionCount: 0, checkpoint: "verify-checkpoint" },
      },
    } satisfies WorkflowV2PersistedRunState;
    expect(isWorkflowV2PersistedRunState(durableState)).toBe(true);
    await new WorkflowV2FileStore(rootDir).persistRunState(durableState);

    const restoredHub = new AgentHub();
    await restoredHub.loadPersistedState(storagePath);
    const restored = restoredHub.snapshot();
    const restoredRun = restored.workflowStore.runs.find((run) => run.runId === runId);
    const restoredWorkflow = restored.workflowStore.workflows.find((workflow) => workflow.workflowId === workflowId);

    expect(restoredRun).toMatchObject({
      status: "stopped",
      progress: [
        { nodeId: "draft", status: "completed", detail: "Durable draft" },
        { nodeId: "verify", status: "paused", detail: "Paused before restart" },
      ],
    });
    expect(restoredWorkflow).toMatchObject({ status: "stopped" });
    const persistedPublicState = JSON.parse(await readFile(storagePath, "utf8")) as {
      workflowStore: { runs: Array<{ runId: string; status: string }> };
    };
    expect(persistedPublicState.workflowStore.runs.find((run) => run.runId === runId)?.status).toBe("stopped");
  });
});
