import { describe, expect, test } from "vitest";
import type {
  AppSnapshot,
  FinishWorkflowRunRequest,
  RunTaskRequest,
  TaskRun,
  WorkflowDraftState,
  WorkflowEvent,
  WorkflowRunState,
  WorkflowRunProgressItem,
} from "../../shared/types";
import type {
  WorkflowV2ContextBudget,
  WorkflowV2Definition,
  WorkflowV2ScriptNode,
} from "../../shared/workflow-v2/definition";
import type { WorkflowV2WorkerOutput } from "../../shared/workflow-v2/packets";
import type { WorkflowV2CostBudget, WorkflowV2ResultPacket } from "../../shared/workflow-v2/planning";
import { buildWorkflowV2Plan } from "./v2/workflow-v2-planner";
import {
  type ExecuteWorkflowV2ScriptRequest,
  parseWorkflowV2WorkerArtifact,
  resolveWorkflowNodeAgent,
  WorkflowRuntime,
  workflowV2LlmNodePrompt,
} from "./workflow-runtime";

const AGENTS = [
  { id: "agent-a", modelId: "model-a" },
  { id: "agent-b", modelId: "model-b" },
];
const WORKFLOW_DEFAULTS = { configuredAgentId: "agent-a", modelId: "model-a" };

describe("resolveWorkflowNodeAgent", () => {
  test("uses the workflow default when the node has no override", () => {
    expect(resolveWorkflowNodeAgent({}, WORKFLOW_DEFAULTS, AGENTS)).toEqual({ configuredAgentId: "agent-a", modelId: "model-a" });
  });

  test("uses the node's agent and that agent's default model when only the agent is overridden", () => {
    expect(resolveWorkflowNodeAgent({ configuredAgentId: "agent-b" }, WORKFLOW_DEFAULTS, AGENTS)).toEqual({
      configuredAgentId: "agent-b",
      modelId: "model-b",
    });
  });

  test("honours an explicit per-node model override", () => {
    expect(resolveWorkflowNodeAgent({ configuredAgentId: "agent-b", modelId: "model-x" }, WORKFLOW_DEFAULTS, AGENTS)).toEqual({
      configuredAgentId: "agent-b",
      modelId: "model-x",
    });
  });

  test("falls back to the workflow default model when the node overrides only the model", () => {
    expect(resolveWorkflowNodeAgent({ modelId: "model-x" }, WORKFLOW_DEFAULTS, AGENTS)).toEqual({
      configuredAgentId: "agent-a",
      modelId: "model-x",
    });
  });
});

describe("parseWorkflowV2WorkerArtifact", () => {
  test("uses plain text only as the single declared output field", () => {
    const node = workflowV2Definition().nodes[0]!;
    if (node.execModel !== "llm") throw new Error("expected llm node");

    expect(parseWorkflowV2WorkerArtifact(node, "A narrow plain-text result.")).toEqual({
      nodeId: "draft",
      summary: "A narrow plain-text result.",
      outputs: { draft: "A narrow plain-text result." },
      proposals: [],
    });
  });

  test("rejects plain text when the node declares multiple output fields", () => {
    const baseNode = workflowV2Definition().nodes[0]!;
    if (baseNode.execModel !== "llm") throw new Error("expected llm node");
    const node = {
      ...baseNode,
      outputFields: [{ key: "draft", required: true }, { key: "notes", required: true }],
    };

    expect(() => parseWorkflowV2WorkerArtifact(node, "Ambiguous plain text.")).toThrow(
      "must return structured JSON for multiple output fields",
    );
  });

  test("rejects malformed content that presents itself as a structured packet", () => {
    const node = workflowV2Definition().nodes[0]!;
    if (node.execModel !== "llm") throw new Error("expected llm node");

    expect(() => parseWorkflowV2WorkerArtifact(node, '{"nodeId":"draft","summary":')).toThrow(
      "invalid structured worker-output packet",
    );
  });
});

describe("workflowV2LlmNodePrompt", () => {
  async function promptInput(input: {
    summaryFallbackPolicy?: WorkflowV2ContextBudget["summaryFallbackPolicy"];
    baseWorkflowContextDocument: string;
    maxContextTokens?: number;
    maxPromptTokens?: number;
  }): Promise<Parameters<typeof workflowV2LlmNodePrompt>[0]> {
    const definition = workflowV2Definition();
    const plan = await buildWorkflowV2Plan({
      definition,
      approvedBy: "prompt-budget-test",
      now: 10,
    });
    const node = definition.nodes[0]!;
    if (node.execModel !== "llm") throw new Error("expected llm node");
    const taskPacket = structuredClone(plan.nodes[0]!.taskPacket);
    taskPacket.budget.context.maxContextTokens = input.maxContextTokens ?? 1_000;
    if (input.summaryFallbackPolicy === undefined) {
      delete taskPacket.budget.context.summaryFallbackPolicy;
    } else {
      taskPacket.budget.context.summaryFallbackPolicy = input.summaryFallbackPolicy;
    }
    taskPacket.budget.cost = { maxPromptTokens: input.maxPromptTokens ?? 4_000 };

    return {
      node,
      taskPacket,
      upstreamOutputs: [],
      baseWorkflowContextDocument: input.baseWorkflowContextDocument,
      storagePlanDocument: "FIXED_STORAGE_PLAN_MUST_REMAIN",
    };
  }

  test.each([
    ["undefined", undefined],
    ["truncate", "truncate"],
  ] as const)("clips oversized dynamic context when fallback policy is %s", async (_name, summaryFallbackPolicy) => {
    const contextPrefix = "DYNAMIC_CONTEXT_PREFIX_MUST_REMAIN";
    const contextSentinel = "OVERSIZED_DYNAMIC_CONTEXT_SENTINEL_MUST_NOT_LEAK";

    const prompt = workflowV2LlmNodePrompt(await promptInput({
      summaryFallbackPolicy,
      baseWorkflowContextDocument: `${contextPrefix}${"x".repeat(10_000)}${contextSentinel}`,
    }));

    expect(prompt).toContain("Workflow V2 task packet");
    expect(prompt).toContain("Produce the implementation draft from the approved packet.");
    expect(prompt).toContain("FIXED_STORAGE_PLAN_MUST_REMAIN");
    expect(prompt).toContain("approximate character budget");
    expect(prompt).toContain(contextPrefix);
    expect(prompt).not.toContain(contextSentinel);
    expect(prompt.length).toBeLessThanOrEqual(4_000 * 4);
  });

  test("fails closed when summarize fallback is required for oversized dynamic context", async () => {
    const contextSentinel = "SUMMARIZE_SENTINEL_MUST_NOT_LEAK";
    const input = await promptInput({
      summaryFallbackPolicy: "summarize",
      baseWorkflowContextDocument: `${"x".repeat(10_000)}${contextSentinel}`,
    });

    expect(() => workflowV2LlmNodePrompt(input)).toThrow("summarize fallback is unavailable");
  });

  test("fails closed into the Phase 04 boundary when ask_human fallback is required", async () => {
    const input = await promptInput({
      summaryFallbackPolicy: "ask_human",
      baseWorkflowContextDocument: "x".repeat(10_000),
    });

    expect(() => workflowV2LlmNodePrompt(input)).toThrow("Phase 04 human intervention");
  });

  test.each(["summarize", "ask_human"] as const)(
    "keeps fitting dynamic context unchanged without triggering %s fallback",
    async (summaryFallbackPolicy) => {
      const contextSentinel = `${summaryFallbackPolicy.toUpperCase()}_FITTING_CONTEXT_SENTINEL`;

      const prompt = workflowV2LlmNodePrompt(await promptInput({
        summaryFallbackPolicy,
        baseWorkflowContextDocument: contextSentinel,
      }));

      expect(prompt).toContain(contextSentinel);
    },
  );

  test("keeps fixed task-packet overflow fail-fast ahead of fallback selection", async () => {
    const input = await promptInput({
      summaryFallbackPolicy: "summarize",
      baseWorkflowContextDocument: "x".repeat(10_000),
      maxContextTokens: 1,
    });

    expect(() => workflowV2LlmNodePrompt(input)).toThrow("fixed context exceeds maxContextTokens");
  });

  test("keeps full prompt overflow fail-fast ahead of unavailable fallback selection", async () => {
    const input = await promptInput({
      summaryFallbackPolicy: "summarize",
      baseWorkflowContextDocument: "x".repeat(10_000),
      maxPromptTokens: 0,
    });

    expect(() => workflowV2LlmNodePrompt(input)).toThrow("prompt budget exceeded maxPromptTokens");
  });
});

function workflowV2Definition(): WorkflowV2Definition {
  return {
    workflowId: "workflow-v2-runtime",
    graphVersion: 3,
    objective: "Execute a frozen V2 plan through the actual workflow runtime",
    nodes: [
      {
        id: "draft",
        kind: "implementation",
        title: "Draft",
        execModel: "llm",
        prompt: "Produce the implementation draft from the approved packet.",
        outputFields: [{ key: "draft", required: true }],
      },
      {
        id: "verify",
        kind: "verification",
        title: "Verify",
        execModel: "script",
        sandboxMode: "workspace",
        script: {
          language: "bash",
          code: "printf verified",
          timeoutMs: 5_000,
        },
        outputFields: [{ key: "verified", required: true }],
      },
    ],
    edges: [{ fromNodeId: "draft", toNodeId: "verify" }],
  };
}

async function workflowV2RuntimeFixture(input: {
  definition?: WorkflowV2Definition;
  contextBudget?: WorkflowV2ContextBudget;
  costBudget?: WorkflowV2CostBudget;
  llmArtifact?: string;
  executeScript: (request: ExecuteWorkflowV2ScriptRequest) => Promise<WorkflowV2WorkerOutput>;
}): Promise<{
  runtime: WorkflowRuntime;
  workflow: WorkflowDraftState;
  taskRequests: RunTaskRequest[];
  updates: Array<{ progress?: WorkflowRunProgressItem[]; appendEvents?: WorkflowEvent[] }>;
  startRequests: string[];
  stopTaskIds: string[];
  setRuns: (runs: WorkflowRunState[]) => void;
  finished: Promise<FinishWorkflowRunRequest>;
}> {
  const definition = input.definition ?? workflowV2Definition();
  const plan = await buildWorkflowV2Plan({
    definition,
    approvedBy: "runtime-test",
    now: 1_000,
    ...(input.contextBudget ? { contextBudget: input.contextBudget } : {}),
    ...(input.costBudget ? { costBudget: input.costBudget } : {}),
  });
  const workflow = {
    workflowId: definition.workflowId,
    title: "Workflow V2 runtime",
    status: "draft",
    revision: 1,
    configuredAgentId: "agent-a",
    modelId: "model-a",
    objective: definition.objective,
    workDir: "/tmp/workflow-v2-runtime",
    graph: {
      title: "Intentionally invalid legacy graph",
      objective: "V2 execution must branch before legacy validation",
      nodes: [],
      edges: [],
    },
    graphReady: true,
    messages: [],
    reply: "",
    error: undefined,
    runProgress: [],
    runContextDocument: "",
    contextDocument: "",
    workflowV2Plan: plan,
    runIds: [],
    createdAt: 1,
    updatedAt: 1,
  } satisfies WorkflowDraftState;
  const taskRequests: RunTaskRequest[] = [];
  const updates: Array<{ progress?: WorkflowRunProgressItem[]; appendEvents?: WorkflowEvent[] }> = [];
  const startRequests: string[] = [];
  const stopTaskIds: string[] = [];
  let tasks: TaskRun[] = [];
  let runs: WorkflowRunState[] = [];
  let finishRun!: (request: FinishWorkflowRunRequest) => void;
  const finished = new Promise<FinishWorkflowRunRequest>((resolve) => {
    finishRun = resolve;
  });
  const snapshot = (): AppSnapshot => ({
    workDir: "/tmp/app-workdir",
    configuredAgents: [{ id: "agent-a", modelId: "model-a" }],
    tasks,
    workflowStore: { activeWorkflowId: workflow.workflowId, workflows: [workflow], runs },
  }) as unknown as AppSnapshot;

  const runtime = new WorkflowRuntime({
    snapshot,
    startWorkflowRun: ({ workflowId }) => {
      startRequests.push(workflowId);
      return { ok: true, workflowId, runId: "run-v2-runtime" };
    },
    finishWorkflowRun: (request) => {
      finishRun(request);
      return { ok: true, workflowId: request.workflowId, runId: request.runId };
    },
    updateWorkflowRunState: (request) => {
      updates.push({
        ...(request.progress ? { progress: structuredClone(request.progress) } : {}),
        ...(request.appendEvents ? { appendEvents: structuredClone(request.appendEvents) } : {}),
      });
    },
    runTask: async (request) => {
      taskRequests.push(request);
      tasks = [{
        id: `task-${taskRequests.length}`,
        title: "Workflow V2 LLM node",
        status: "completed",
        prompt: request.prompt,
        configuredAgentId: request.configuredAgentId,
        messages: [{ role: "assistant", content: input.llmArtifact ?? JSON.stringify({
          nodeId: "draft",
          summary: "Draft ready",
          outputs: { draft: "const ready = true;" },
          evidence: ["draft evidence"],
          proposals: [],
        }) }],
        createdAt: taskRequests.length,
      } as TaskRun];
      return snapshot();
    },
    stopTask: async (taskId) => {
      stopTaskIds.push(taskId);
    },
    deleteTask: async (taskId) => {
      tasks = tasks.filter((task) => task.id !== taskId);
      return snapshot();
    },
    executeWorkflowV2Script: input.executeScript,
  });

  return {
    runtime,
    workflow,
    taskRequests,
    updates,
    startRequests,
    stopTaskIds,
    setRuns: (nextRuns) => {
      runs = nextRuns;
    },
    finished,
  };
}

function workflowV2InterventionRun(
  workflow: WorkflowDraftState,
  status: WorkflowRunState["status"],
  nodeStatus: WorkflowRunProgressItem["status"],
): WorkflowRunState {
  return {
    runId: "run-v2-intervention",
    workflowId: workflow.workflowId,
    status,
    graphSnapshot: {
      title: "Legacy graph must not resume",
      objective: "Legacy execution is forbidden for V2 intervention",
      nodes: [
        { id: "start", kind: "start", title: "Start", prompt: "" },
        { id: "draft", kind: "agent", title: "Draft", prompt: "Must not execute." },
        { id: "end", kind: "end", title: "Done", prompt: "" },
      ],
      edges: [
        { id: "start->draft", fromNodeId: "start", toNodeId: "draft" },
        { id: "draft->end", fromNodeId: "draft", toNodeId: "end" },
      ],
    },
    workflowV2Plan: workflow.workflowV2Plan!,
    progress: [{ nodeId: "draft", title: "Draft", status: nodeStatus, taskId: "task-v2-intervention" }],
    events: nodeStatus === "awaiting_input"
      ? [{ type: "gate_opened", nodeId: "draft", at: 1, question: "Continue?" }]
      : [],
    contextDocument: "# V2 context",
    startedAt: 1,
    finishedAt: undefined,
    lastError: undefined,
  };
}

describe("WorkflowRuntime Workflow V2 bridge", () => {
  test("rejects a duplicate run when the run store is running even if the draft status was reset", async () => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });
    fixture.workflow.status = "draft";
    fixture.setRuns([workflowV2InterventionRun(fixture.workflow, "running", "running")]);

    const result = fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });

    expect(result).toEqual({
      ok: false,
      workflowId: fixture.workflow.workflowId,
      error: "Workflow is already running.",
    });
    expect(fixture.startRequests).toEqual([]);
    expect(fixture.taskRequests).toEqual([]);
    expect(fixture.updates).toEqual([]);
  });

  test.each(["stopped", "completed"] as const)("allows a new run after a previous run is %s", async (previousStatus) => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async ({ node }) => ({
        nodeId: node.id,
        summary: "Verification complete",
        outputs: { verified: true },
        proposals: [],
      }),
    });
    fixture.setRuns([
      workflowV2InterventionRun(fixture.workflow, previousStatus, previousStatus === "stopped" ? "queued" : "completed"),
    ]);

    const result = fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    await fixture.finished;

    expect(result).toMatchObject({ ok: true, workflowId: fixture.workflow.workflowId });
    expect(fixture.startRequests).toEqual([fixture.workflow.workflowId]);
  });

  test("fails V2 pause intervention before stopping a task or changing run state", async () => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });
    fixture.setRuns([workflowV2InterventionRun(fixture.workflow, "running", "running")]);

    const result = await fixture.runtime.pauseWorkflowNode({
      workflowId: fixture.workflow.workflowId,
      runId: "run-v2-intervention",
      nodeId: "draft",
    });

    expect(result).toEqual({
      ok: false,
      workflowId: fixture.workflow.workflowId,
      runId: "run-v2-intervention",
      error: "Workflow V2 intervention requires Phase 04.",
    });
    expect(fixture.stopTaskIds).toEqual([]);
    expect(fixture.taskRequests).toEqual([]);
    expect(fixture.updates).toEqual([]);
  });

  test("fails V2 start intervention before resuming through the legacy executor", async () => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });
    fixture.setRuns([workflowV2InterventionRun(fixture.workflow, "stopped", "queued")]);

    const result = await fixture.runtime.startWorkflowNode({
      workflowId: fixture.workflow.workflowId,
      runId: "run-v2-intervention",
      nodeId: "draft",
    });
    await Promise.resolve();

    expect(result).toEqual({
      ok: false,
      workflowId: fixture.workflow.workflowId,
      runId: "run-v2-intervention",
      error: "Workflow V2 intervention requires Phase 04.",
    });
    expect(fixture.stopTaskIds).toEqual([]);
    expect(fixture.taskRequests).toEqual([]);
    expect(fixture.updates).toEqual([]);
  });

  test("fails V2 gate intervention before resuming through the legacy executor", async () => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });
    fixture.setRuns([workflowV2InterventionRun(fixture.workflow, "stopped", "awaiting_input")]);

    const result = await fixture.runtime.answerWorkflowGate({
      workflowId: fixture.workflow.workflowId,
      runId: "run-v2-intervention",
      nodeId: "draft",
      answer: "Continue",
    });
    await Promise.resolve();

    expect(result).toEqual({
      ok: false,
      workflowId: fixture.workflow.workflowId,
      runId: "run-v2-intervention",
      error: "Workflow V2 intervention requires Phase 04.",
    });
    expect(fixture.stopTaskIds).toEqual([]);
    expect(fixture.taskRequests).toEqual([]);
    expect(fixture.updates).toEqual([]);
  });

  test("rejects a frozen plan that duplicates one plan node and omits another before starting a run", async () => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });
    const plan = fixture.workflow.workflowV2Plan!;
    plan.nodes = [structuredClone(plan.nodes[0]!), structuredClone(plan.nodes[0]!)];

    const result = fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });

    expect(result).toEqual({
      ok: false,
      workflowId: fixture.workflow.workflowId,
      error: "Workflow V2 plan nodes do not match the frozen definition.",
    });
    expect(fixture.startRequests).toEqual([]);
  });

  test.each([
    ["blank approvedBy", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.approvedBy = "   ";
    }],
    ["negative frozenAt", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.frozenAt = -1;
    }],
    ["non-finite frozenAt", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.frozenAt = Number.NaN;
    }],
    ["blank objective", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.objective = " ";
    }],
    ["tampered task constraints", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.nodes[0]!.taskPacket.constraints = [{ key: "injected", description: "Injected after approval." }];
    }],
    ["tampered direct upstream digest", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.nodes[1]!.taskPacket.upstreamDigest = [];
    }],
    ["tampered node budget", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.nodes[0]!.budget.context.maxContextTokens += 1;
    }],
    ["tampered node acceptance criteria", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.nodes[0]!.acceptanceCriteria[0]!.description = "Injected acceptance criterion.";
    }],
    ["invalid top-level budget", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.budget.context.maxContextTokens = Number.NaN;
    }],
    ["invalid top-level acceptance criteria", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.acceptanceCriteria = [{ key: "", description: "Invalid criterion" }];
    }],
    ["duplicate trimmed top-level acceptance criteria", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.acceptanceCriteria = [
        { key: "release.ready", description: "Ready" },
        { key: " release.ready ", description: "Still ready" },
      ];
    }],
    ["invalid role defaults", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.roleDefaults.executor = { role: "reviewer", modelProfile: "fast" };
    }],
    ["non-topological node order", (plan: NonNullable<WorkflowDraftState["workflowV2Plan"]>) => {
      plan.nodes.reverse();
    }],
  ])("rejects a frozen plan with %s before starting a run", async (_name, mutatePlan) => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });
    mutatePlan(fixture.workflow.workflowV2Plan!);

    const result = fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });

    expect(result).toMatchObject({
      ok: false,
      workflowId: fixture.workflow.workflowId,
      error: expect.stringContaining("Workflow V2"),
    });
    expect(fixture.startRequests).toEqual([]);
    expect(fixture.taskRequests).toEqual([]);
    expect(fixture.updates).toEqual([]);
  });

  test("fails a zero maxModelCalls budget before starting an LLM task", async () => {
    let scriptCalls = 0;
    const fixture = await workflowV2RuntimeFixture({
      costBudget: { maxModelCalls: 0 },
      executeScript: async ({ node }) => {
        scriptCalls += 1;
        return { nodeId: node.id, summary: "unexpected", outputs: { verified: true }, proposals: [] };
      },
    });

    fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    const finished = await fixture.finished;

    expect(fixture.taskRequests).toEqual([]);
    expect(scriptCalls).toBe(0);
    expect(finished).toMatchObject({
      status: "failed",
      progress: [
        { nodeId: "draft", status: "failed", detail: "Workflow V2 model-call budget exhausted before node draft." },
        { nodeId: "verify", status: "queued" },
      ],
      lastError: "Workflow V2 model-call budget exhausted before node draft.",
    });
  });

  test("fails a zero maxPromptTokens budget before starting an LLM task", async () => {
    const fixture = await workflowV2RuntimeFixture({
      costBudget: { maxPromptTokens: 0 },
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });

    fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    const finished = await fixture.finished;

    expect(fixture.taskRequests).toEqual([]);
    expect(finished).toMatchObject({
      status: "failed",
      progress: [
        { nodeId: "draft", status: "failed", detail: expect.stringContaining("prompt budget") },
        { nodeId: "verify", status: "queued" },
      ],
      lastError: expect.stringContaining("prompt budget"),
    });
  });

  test("fails when fixed task context exceeds maxContextTokens before starting an LLM task", async () => {
    const fixture = await workflowV2RuntimeFixture({
      definition: workflowV2Definition(),
      executeScript: async () => {
        throw new Error("script runner should not be called");
      },
    });
    const plan = fixture.workflow.workflowV2Plan!;
    plan.budget.context.maxContextTokens = 1;
    for (const planNode of plan.nodes) {
      planNode.budget.context.maxContextTokens = 1;
      planNode.taskPacket.budget.context.maxContextTokens = 1;
    }

    fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    const finished = await fixture.finished;

    expect(fixture.taskRequests).toEqual([]);
    expect(finished).toMatchObject({
      status: "failed",
      progress: [
        { nodeId: "draft", status: "failed", detail: expect.stringContaining("fixed context") },
        { nodeId: "verify", status: "queued" },
      ],
      lastError: expect.stringContaining("fixed context"),
    });
  });

  test.each([
    ["summarize", "summarize fallback is unavailable", "SUMMARIZE_RUNTIME_SENTINEL_MUST_NOT_REACH_RUN_TASK"],
    ["ask_human", "Phase 04 human intervention", "ASK_HUMAN_RUNTIME_SENTINEL_MUST_NOT_REACH_RUN_TASK"],
  ] as const)(
    "fails the node and run without task or intervention state when %s fallback is required",
    async (summaryFallbackPolicy, expectedError, contextSentinel) => {
      const fixture = await workflowV2RuntimeFixture({
        contextBudget: {
          maxContextTokens: 1_000,
          summaryFallbackPolicy,
        },
        executeScript: async () => {
          throw new Error("script runner should not be called");
        },
      });

      fixture.runtime.runWorkflowGraph({
        workflowId: fixture.workflow.workflowId,
        contextDocument: `${"x".repeat(10_000)}${contextSentinel}`,
      });
      const finished = await fixture.finished;

      expect(fixture.taskRequests).toEqual([]);
      expect(JSON.stringify(fixture.taskRequests)).not.toContain(contextSentinel);
      expect(finished).toMatchObject({
        status: "failed",
        progress: [
          { nodeId: "draft", status: "failed", detail: expect.stringContaining(expectedError) },
          { nodeId: "verify", status: "queued" },
        ],
        lastError: expect.stringContaining(expectedError),
      });
      const events = fixture.updates.flatMap((update) => update.appendEvents ?? []);
      expect(events.map((event) => event.type)).toEqual(["node_started", "node_failed"]);
      expect(events.some((event) => event.type === "gate_opened" || event.type === "node_paused")).toBe(false);
      expect(fixture.updates.flatMap((update) => update.progress ?? []).some(
        (progress) => progress.status === "paused" || progress.status === "awaiting_input",
      )).toBe(false);
    },
  );

  test("fails a zero maxWallClockMs budget before starting a script dependency", async () => {
    const scriptDefinition: WorkflowV2Definition = {
      workflowId: "workflow-v2-runtime",
      graphVersion: 5,
      objective: "Enforce wall-clock budget before script start",
      nodes: [{
        id: "script-only",
        kind: "verification",
        title: "Script only",
        execModel: "script",
        sandboxMode: "workspace",
        script: { language: "bash", code: "printf should-not-run" },
        outputFields: [{ key: "verified", required: true }],
      }],
      edges: [],
    };
    let scriptCalls = 0;
    const fixture = await workflowV2RuntimeFixture({
      definition: scriptDefinition,
      costBudget: { maxWallClockMs: 0 },
      executeScript: async ({ node }) => {
        scriptCalls += 1;
        return { nodeId: node.id, summary: "unexpected", outputs: { verified: true }, proposals: [] };
      },
    });

    fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    const finished = await fixture.finished;

    expect(fixture.taskRequests).toEqual([]);
    expect(scriptCalls).toBe(0);
    expect(finished).toMatchObject({
      status: "failed",
      progress: [{
        nodeId: "script-only",
        status: "failed",
        detail: "Workflow V2 wall-clock budget exhausted before node script-only.",
      }],
      lastError: "Workflow V2 wall-clock budget exhausted before node script-only.",
    });
  });

  test("aborts an in-flight script at the wall-clock deadline and rejects its late completion", async () => {
    const scriptDefinition: WorkflowV2Definition = {
      workflowId: "workflow-v2-runtime",
      graphVersion: 6,
      objective: "Abort an in-flight script at the run deadline",
      nodes: [{
        id: "script-only",
        kind: "verification",
        title: "Script only",
        execModel: "script",
        sandboxMode: "workspace",
        script: { language: "bash", code: "printf late", timeoutMs: 5_000 },
        outputFields: [{ key: "verified", required: true }],
      }],
      edges: [],
    };
    let aborted = false;
    let observedTimeoutMs: number | undefined;
    const fixture = await workflowV2RuntimeFixture({
      definition: scriptDefinition,
      costBudget: { maxWallClockMs: 100 },
      executeScript: async (request) => {
        observedTimeoutMs = request.timeoutMs;
        if (!(request.signal instanceof AbortSignal)) throw new Error("expected an AbortSignal");
        await new Promise<void>((resolve) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          }, { once: true });
        });
        return {
          nodeId: request.node.id,
          summary: "late completion must be ignored",
          outputs: { verified: true },
          proposals: [],
        };
      },
    });

    fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    const finished = await fixture.finished;

    expect(observedTimeoutMs).toBeGreaterThan(0);
    expect(observedTimeoutMs).toBeLessThanOrEqual(100);
    expect(aborted).toBe(true);
    expect(finished).toMatchObject({
      status: "failed",
      progress: [{ nodeId: "script-only", status: "failed", detail: expect.stringContaining("timed out") }],
      lastError: expect.stringContaining("timed out"),
    });
    expect(finished.finalReport).not.toContain("late completion must be ignored");
  });

  test("bounds an oversized script timeout to the platform timer range", async () => {
    const scriptDefinition: WorkflowV2Definition = {
      workflowId: "workflow-v2-runtime",
      graphVersion: 7,
      objective: "Bound an oversized script timer",
      nodes: [{
        id: "script-only",
        kind: "verification",
        title: "Script only",
        execModel: "script",
        sandboxMode: "workspace",
        script: { language: "bash", code: "printf bounded", timeoutMs: Number.MAX_SAFE_INTEGER },
        outputFields: [{ key: "verified", required: true }],
      }],
      edges: [],
    };
    let observedTimeoutMs: number | undefined;
    const fixture = await workflowV2RuntimeFixture({
      definition: scriptDefinition,
      executeScript: async (request) => {
        observedTimeoutMs = request.timeoutMs;
        return {
          nodeId: request.node.id,
          summary: "bounded timer completed",
          outputs: { verified: true },
          proposals: [],
        };
      },
    });

    fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    const finished = await fixture.finished;

    expect(observedTimeoutMs).toBeGreaterThan(0);
    expect(observedTimeoutMs).toBeLessThanOrEqual(2_147_483_647);
    expect(finished.status).toBe("completed");
  });

  test("branches before legacy execution and runs llm then script nodes with direct upstream outputs", async () => {
    const proposalReason = "runtime-control-only";
    const scriptRequests: ExecuteWorkflowV2ScriptRequest[] = [];
    const fixture = await workflowV2RuntimeFixture({
      costBudget: {
        maxModelCalls: 1,
        maxPromptTokens: 4_000,
        maxCompletionTokens: 321,
        maxWallClockMs: 10_000,
      },
      llmArtifact: JSON.stringify({
        nodeId: "draft",
        summary: "Draft ready",
        outputs: { draft: "const ready = true;" },
        evidence: ["draft evidence"],
        proposals: [{ kind: "escalate", reason: proposalReason }],
      }),
      executeScript: async (request) => {
        scriptRequests.push(request);
        return {
          nodeId: request.node.id,
          summary: "Verification passed",
          outputs: { verified: true },
          evidence: ["script evidence"],
          proposals: [],
        };
      },
    });

    const started = fixture.runtime.runWorkflowGraph({
      workflowId: fixture.workflow.workflowId,
      contextDocument: "# Base context\nUse the approved implementation constraints.",
    });
    const finished = await fixture.finished;

    expect(started).toEqual({ ok: true, workflowId: fixture.workflow.workflowId, runId: "run-v2-runtime" });
    expect(fixture.taskRequests).toHaveLength(1);
    expect(fixture.taskRequests[0]).toMatchObject({
      configuredAgentId: "agent-a",
      modelId: "model-a",
      workDir: "/tmp/workflow-v2-runtime",
    });
    expect(fixture.taskRequests[0]?.prompt).toContain("Workflow V2 task packet");
    expect(fixture.taskRequests[0]?.prompt).toContain('"nodeId": "draft"');
    expect(fixture.taskRequests[0]?.prompt).toContain("Produce the implementation draft from the approved packet.");
    expect(fixture.taskRequests[0]?.prompt).toContain('"upstreamOutputs": []');
    expect(fixture.taskRequests[0]?.prompt).toContain("# Base context");
    expect(fixture.taskRequests[0]?.prompt).toContain("Workflow Storage Plan");
    expect(fixture.taskRequests[0]?.prompt).toContain("Return only one structured JSON worker-output packet");
    expect(fixture.taskRequests[0]?.prompt).toContain('"maxCompletionTokens": 321');
    expect(fixture.taskRequests[0]?.prompt).not.toContain("workflow judge");
    expect(fixture.taskRequests[0]?.prompt).not.toContain("main workflow agent");

    expect(scriptRequests).toHaveLength(1);
    expect(scriptRequests[0]).toMatchObject({
      node: { id: "verify" },
      workDir: "/tmp/workflow-v2-runtime",
      sandboxMode: "workspace",
      upstreamOutputs: [{
        nodeId: "draft",
        outputs: { draft: "const ready = true;" },
      }],
      signal: expect.any(AbortSignal),
      timeoutMs: 5_000,
    });
    expect(Object.hasOwn(scriptRequests[0]!.upstreamOutputs[0]!, "proposals")).toBe(false);
    expect(JSON.stringify(scriptRequests)).not.toContain(proposalReason);
    expect(finished).toMatchObject({
      workflowId: fixture.workflow.workflowId,
      runId: "run-v2-runtime",
      status: "completed",
      progress: [
        { nodeId: "draft", status: "completed" },
        { nodeId: "verify", status: "completed" },
      ],
      finalReport: expect.stringContaining("# Workflow V2 Run Summary"),
    });
    expect(finished.progress!.some((item) => item.nodeId === "__final_review__")).toBe(false);
    const events = fixture.updates.flatMap((update) => update.appendEvents ?? []);
    expect(events.map((event) => `${event.nodeId}:${event.type}`)).toEqual([
      "draft:node_started",
      "draft:node_output",
      "draft:node_completed",
      "verify:node_started",
      "verify:node_output",
      "verify:node_completed",
    ]);
    expect(events.filter((event) => event.nodeId === "draft").map((event) => event.type)).toEqual([
      "node_started",
      "node_output",
      "node_completed",
    ]);
    expect(events.filter((event) => event.nodeId === "verify").map((event) => event.type)).toEqual([
      "node_started",
      "node_output",
      "node_completed",
    ]);
  });

  test("fails the current script node and run when the injected sandbox policy rejects execution", async () => {
    const fixture = await workflowV2RuntimeFixture({
      executeScript: async () => {
        throw new Error("Workflow V2 workspace sandbox policy is unavailable on this platform.");
      },
    });

    fixture.runtime.runWorkflowGraph({ workflowId: fixture.workflow.workflowId });
    const finished = await fixture.finished;

    expect(finished).toMatchObject({
      status: "failed",
      progress: [
        { nodeId: "draft", status: "completed" },
        {
          nodeId: "verify",
          status: "failed",
          detail: "Workflow V2 workspace sandbox policy is unavailable on this platform.",
        },
      ],
      lastError: "Workflow V2 workspace sandbox policy is unavailable on this platform.",
    });
    const events = fixture.updates.flatMap((update) => update.appendEvents ?? []);
    expect(events.filter((event) => event.nodeId === "verify").map((event) => event.type)).toEqual([
      "node_started",
      "node_failed",
    ]);
  });
});
