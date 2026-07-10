import { describe, expect, test } from "vitest";
import type { UpdateWorkflowRequest, WorkflowDraftState, WorkflowGraph } from "../../../shared/types";
import { buildWorkflowV2Plan } from "../../workflows/v2/workflow-v2-planner";
import { applyWorkflowDraftPatch, updateWorkflowDraftState } from "./agent-hub-workflow-draft";

const graph: WorkflowGraph = {
  title: "Workflow",
  objective: "Original objective",
  nodes: [
    { id: "start", kind: "start", title: "Start", prompt: "" },
    { id: "work", kind: "agent", title: "Work", prompt: "Do the work" },
    { id: "end", kind: "end", title: "End", prompt: "" },
  ],
  edges: [
    { id: "start->work", fromNodeId: "start", toNodeId: "work" },
    { id: "work->end", fromNodeId: "work", toNodeId: "end" },
  ],
};

async function workflowDraft(): Promise<WorkflowDraftState> {
  const workflowV2Plan = await buildWorkflowV2Plan({
    definition: {
      workflowId: "workflow-1",
      graphVersion: 1,
      objective: "Original objective",
      nodes: [{
        id: "work",
        kind: "implementation",
        title: "Work",
        execModel: "llm",
        prompt: "Do the work",
        outputFields: [{ key: "output", required: true }],
      }],
      edges: [],
    },
    approvedBy: "planner-agent",
    now: 1_720_000_000_000,
  });

  return {
    workflowId: "workflow-1",
    title: "Workflow",
    status: "draft",
    revision: 3,
    configuredAgentId: "codex-agent",
    modelId: "default",
    objective: "Original objective",
    graph,
    graphReady: true,
    messages: [],
    reply: "",
    error: undefined,
    runProgress: [],
    runContextDocument: "",
    contextDocument: "# Context",
    workflowV2Plan,
    finalReport: "# Final report",
    runIds: [],
    runtimeConversation: {
      runtimeId: "codex",
      codecVersion: "v1",
      payload: { native: { threadId: "thread-1" } },
    },
    createdAt: 1_720_000_000_000,
    updatedAt: 1_720_000_000_001,
  };
}

function update(current: WorkflowDraftState, request: UpdateWorkflowRequest, nextGraph = current.graph): WorkflowDraftState {
  return updateWorkflowDraftState({
    current,
    request,
    graph: nextGraph,
    configuredAgentId: request.configuredAgentId ?? current.configuredAgentId,
    modelId: request.modelId ?? current.modelId,
    cloneDraft: structuredClone,
    now: 1_720_000_000_002,
  });
}

function patch(current: WorkflowDraftState, request: Parameters<typeof applyWorkflowDraftPatch>[0]["patch"]): WorkflowDraftState {
  return applyWorkflowDraftPatch({
    current,
    patch: request,
    normalizeConfiguredAgentId: (configuredAgentId) => configuredAgentId?.trim() || current.configuredAgentId,
    normalizeModelId: (_configuredAgentId, modelId) => modelId?.trim() || current.modelId,
    cloneGraph: structuredClone,
    cloneConversation: structuredClone,
    cloneDraft: structuredClone,
    now: 1_720_000_000_002,
  });
}

describe("updateWorkflowDraftState", () => {
  test("clears the workflow-v2 plan when workflowV2Plan is explicitly null", async () => {
    const current = await workflowDraft();

    const result = update(current, { workflowId: current.workflowId, workflowV2Plan: null });

    expect(result.workflowV2Plan).toBeUndefined();
    expect(result.finalReport).toBe("# Final report");
    expect(result.runtimeConversation).toEqual(current.runtimeConversation);
  });

  test.each(["graph", "objective"] as const)(
    "clears the workflow-v2 plan when %s changes without a replacement plan",
    async (changedField) => {
      const current = await workflowDraft();
      const nextGraph = {
        ...current.graph,
        objective: "Changed graph objective",
      };
      const request: UpdateWorkflowRequest = changedField === "graph"
        ? { workflowId: current.workflowId, graph: nextGraph }
        : { workflowId: current.workflowId, objective: "Changed objective" };

      const result = update(current, request, changedField === "graph" ? nextGraph : current.graph);

      expect(result.workflowV2Plan).toBeUndefined();
      expect(result.finalReport).toBe("# Final report");
      expect(result.runtimeConversation).toEqual(current.runtimeConversation);
    },
  );

  test("preserves the workflow-v2 plan as a deep clone when plan inputs do not change", async () => {
    const current = await workflowDraft();

    const result = update(current, { workflowId: current.workflowId, title: "Renamed workflow" });

    expect(result.workflowV2Plan).toEqual(current.workflowV2Plan);
    expect(result.workflowV2Plan).not.toBe(current.workflowV2Plan);
    expect(result.workflowV2Plan?.definition).not.toBe(current.workflowV2Plan?.definition);
    expect(result.workflowV2Plan?.nodes[0]?.taskPacket).not.toBe(current.workflowV2Plan?.nodes[0]?.taskPacket);
  });

  test.each([
    ["update", (current: WorkflowDraftState) => update(current, {
      workflowId: current.workflowId,
      configuredAgentId: "claude-agent",
      modelId: "expert-model",
    })],
    ["patch", (current: WorkflowDraftState) => patch(current, {
      workflowId: current.workflowId,
      configuredAgentId: "claude-agent",
      modelId: "expert-model",
    })],
  ] as const)("clears the workflow-v2 plan when the actual route changes through %s", async (_entry, changeRoute) => {
    const current = await workflowDraft();

    const result = changeRoute(current);

    expect(result.workflowV2Plan).toBeUndefined();
    expect(result.configuredAgentId).toBe("claude-agent");
    expect(result.modelId).toBe("expert-model");
    expect(result.finalReport).toBe(current.finalReport);
    expect(result.runtimeConversation).toEqual(current.runtimeConversation);
    expect(result.contextDocument).toBe(current.contextDocument);
    expect(result.graph).toEqual(current.graph);
  });

  test.each([
    ["update", (current: WorkflowDraftState) => update(current, {
      workflowId: current.workflowId,
      configuredAgentId: "claude-agent",
      modelId: "expert-model",
      workflowV2Plan: current.workflowV2Plan!,
    })],
    ["patch", (current: WorkflowDraftState) => patch(current, {
      workflowId: current.workflowId,
      configuredAgentId: "claude-agent",
      modelId: "expert-model",
      workflowV2Plan: current.workflowV2Plan!,
    })],
  ] as const)("preserves an explicit replacement plan when the route changes through %s", async (_entry, changeRoute) => {
    const current = await workflowDraft();

    const result = changeRoute(current);

    expect(result.workflowV2Plan).toEqual(current.workflowV2Plan);
    expect(result.workflowV2Plan).not.toBe(current.workflowV2Plan);
  });

  test.each([
    ["update", (current: WorkflowDraftState) => update(current, {
      workflowId: current.workflowId,
      configuredAgentId: current.configuredAgentId,
      modelId: current.modelId,
    })],
    ["patch", (current: WorkflowDraftState) => patch(current, {
      workflowId: current.workflowId,
      configuredAgentId: ` ${current.configuredAgentId} `,
      modelId: ` ${current.modelId} `,
    })],
  ] as const)("keeps the workflow-v2 plan when the normalized route is unchanged through %s", async (_entry, keepRoute) => {
    const current = await workflowDraft();

    const result = keepRoute(current);

    expect(result.workflowV2Plan).toEqual(current.workflowV2Plan);
  });
});
