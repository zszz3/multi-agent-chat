# Workflow V2 Phase 03 Execution Runtime And Dataflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 03 so Workflow V2 can execute a frozen graph by dependency order, with lock-aware parallelism and a strict separation between worker data output and leader control decisions.

**Architecture:** Keep the execution runtime isolated under `src/main/workflows/v2/` and the shared contracts isolated under `src/shared/workflow-v2/`. Reuse the existing plan, prompt, and hub wiring from Phase 02, but do not widen this phase into review, human intervention, persistence, or hooks.

**Tech Stack:** TypeScript, Electron main process, Vitest

---

## Current Baseline

The current branch already includes the first execution-state slice:

- `src/shared/workflow-v2/state.ts`
- `src/main/workflows/v2/workflow-v2-scheduler.ts`
- `src/main/workflows/v2/workflow-v2-scheduler.test.ts`

This plan starts by locking that baseline with regression checks, then completes the remaining Phase 03 scope.

## File Map

- `src/shared/workflow-v2/state.ts`
  Existing run-state model. Only extend it if packet or leader integration needs additional metadata that still belongs to Phase 03.
- `src/shared/workflow-v2/packets.ts`
  New shared runtime packet contracts for worker data output and control proposals.
- `src/shared/workflow-v2/packets.test.ts`
  Shared contract regression tests for packet cloning and data/control separation.
- `src/shared/types.ts`
  Re-export surface for new Workflow V2 packet types.
- `src/shared/workflow-run.ts`
  Existing workflow prompt surface. Keep it as a bridge surface only; do not add scheduler logic here.
- `src/main/workflows/v2/workflow-v2-scheduler.ts`
  Existing dependency and lock-aware readiness logic. Keep it pure and graph-driven.
- `src/main/workflows/v2/workflow-v2-leader.ts`
  New leader-navigation assembly surface that turns worker proposals plus run-state into control guidance without mutating graph edges.
- `src/main/workflows/v2/workflow-v2-leader.test.ts`
  Tests for priority, escalation hints, and plan-health assembly.
- `src/main/workflows/v2/workflow-v2-llm-runner.ts`
  Narrow adapter that runs `llm` nodes through the existing task runtime surface.
- `src/main/workflows/v2/workflow-v2-script-runner.ts`
  Narrow adapter that runs `script` nodes with explicit sandbox policy handling.
- `src/main/workflows/v2/workflow-v2-executor.ts`
  New execution loop that uses the scheduler, node runners, and leader overlay to advance a frozen graph.
- `src/main/workflows/v2/workflow-v2-executor.test.ts`
  End-to-end execution tests for dependency order, output propagation, and failure handling.
- `src/main/workflows/workflow-runtime.ts`
  Bridge existing runtime dependencies into the Workflow V2 executor. Avoid mixed-era behavior outside a thin adapter.
- `src/main/workflows/workflow-runtime.test.ts`
  Runtime integration tests for the Phase 03 path.

### Task 1: Lock The Scheduler Baseline

**Files:**
- Modify: `src/main/workflows/v2/workflow-v2-scheduler.test.ts`
- Modify: `src/shared/workflow-v2/state.ts` only if a missing Phase 03 invariant is exposed by the new tests
- Modify: `src/main/workflows/v2/workflow-v2-scheduler.ts` only if a missing Phase 03 invariant is exposed by the new tests
- Test: `src/main/workflows/v2/workflow-v2-scheduler.test.ts`

- [ ] **Step 1: Add one more regression that proves the scheduler only unlocks dependents after all upstream nodes complete**

```ts
test("keeps a fan-in node blocked until every dependency is completed", () => {
  const initial = createWorkflowV2RunState({
    definition: definition(),
    maxParallelNodes: 3,
  });
  const completedPlan = transitionWorkflowV2NodeState(
    transitionWorkflowV2NodeState(initial, { nodeId: "plan", status: "running", now: 100 }),
    { nodeId: "plan", status: "completed", now: 120 },
  );
  const completedImplement = transitionWorkflowV2NodeState(
    transitionWorkflowV2NodeState(completedPlan, { nodeId: "implement", status: "running", now: 130 }),
    { nodeId: "implement", status: "completed", now: 150 },
  );

  expect(completedImplement.nodes.review!.status).toBe("blocked");
  expect(completedImplement.nodes.review!.blockedBy).toEqual(["docs"]);
});
```

- [ ] **Step 2: Run the scheduler test file before touching runtime integration**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-scheduler.test.ts
```

Expected: the new test fails if readiness or `blockedBy` bookkeeping is incomplete.

- [ ] **Step 3: Apply the smallest scheduler or state fix needed to satisfy the regression without introducing later-phase concepts**

```ts
for (const nodeId of runState.nodeOrder) {
  if (nodeId === transition.nodeId) continue;
  const node = nextNodes[nodeId]!;
  if (node.status === "running" || node.status === "completed" || node.status === "failed") continue;

  const blockedBy = node.dependsOn.filter((dependencyNodeId) => nextNodes[dependencyNodeId]!.status !== "completed");
  node.blockedBy = blockedBy;
  node.status = blockedBy.length === 0 ? "ready" : "blocked";
}
```

- [ ] **Step 4: Re-run the scheduler tests**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-scheduler.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the scheduler checkpoint**

```bash
git add src/shared/workflow-v2/state.ts src/main/workflows/v2/workflow-v2-scheduler.ts src/main/workflows/v2/workflow-v2-scheduler.test.ts
git commit -m "test: lock workflow v2 scheduler readiness"
```

### Task 2: Add Shared Worker Output And Proposal Contracts

**Files:**
- Create: `src/shared/workflow-v2/packets.ts`
- Create: `src/shared/workflow-v2/packets.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/workflow-run.ts`
- Test: `src/shared/workflow-v2/packets.test.ts`

- [ ] **Step 1: Write a failing shared-contract test that proves worker data output and control proposals are separate**

```ts
import { describe, expect, test } from "vitest";
import {
  cloneWorkflowV2WorkerOutput,
  type WorkflowV2WorkerOutput,
} from "./packets";

describe("workflow-v2 packets", () => {
  test("keeps structured outputs separate from control proposals", () => {
    const output: WorkflowV2WorkerOutput = {
      nodeId: "implement",
      summary: "Implementation finished",
      outputs: { diff: "src/app.ts" },
      evidence: ["tests passed"],
      risks: ["needs reviewer confirmation"],
      proposals: [{ kind: "escalate", reason: "touches shared runtime" }],
    };

    const cloned = cloneWorkflowV2WorkerOutput(output);

    expect(cloned.outputs).toEqual({ diff: "src/app.ts" });
    expect(cloned.proposals).toEqual([{ kind: "escalate", reason: "touches shared runtime" }]);
    expect(cloned.outputs).not.toBe(output.outputs);
    expect(cloned.proposals).not.toBe(output.proposals);
  });
});
```

- [ ] **Step 2: Run the new shared-contract test**

Run:

```bash
npx vitest run src/shared/workflow-v2/packets.test.ts
```

Expected: fail with a missing module or missing export error.

- [ ] **Step 3: Implement the minimal shared packet contract in a new module**

```ts
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
    proposals: output.proposals.map((proposal) => ({
      ...proposal,
      ...("targetNodeIds" in proposal && proposal.targetNodeIds ? { targetNodeIds: [...proposal.targetNodeIds] } : {}),
    })),
  };
}
```

- [ ] **Step 4: Re-export the new packet types from the shared public surface and expose them to runtime prompt helpers only as read-only input**

```ts
export type {
  WorkflowV2WorkProposal,
  WorkflowV2WorkerOutput,
} from "./workflow-v2/packets";
```

```ts
export function workflowNodeRunPrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  upstreamArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument: string,
  storagePlan?: WorkflowStoragePlan,
  workflowV2TaskPacket?: WorkflowV2TaskPacket,
): string {
  // Prompt rendering may include task-packet context, but it must not compute scheduler state.
}
```

- [ ] **Step 5: Re-run the packet test**

Run:

```bash
npx vitest run src/shared/workflow-v2/packets.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit the shared packet contract**

```bash
git add src/shared/workflow-v2/packets.ts src/shared/workflow-v2/packets.test.ts src/shared/types.ts src/shared/workflow-run.ts
git commit -m "feat: add workflow v2 execution packets"
```

### Task 3: Add Leader Navigation Assembly Without Adding New Edge Semantics

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-leader.ts`
- Create: `src/main/workflows/v2/workflow-v2-leader.test.ts`
- Modify: `src/main/workflows/v2/workflow-v2-scheduler.ts` only if test coverage exposes a missing pure helper
- Test: `src/main/workflows/v2/workflow-v2-leader.test.ts`

- [ ] **Step 1: Write a failing test for leader navigation assembly**

```ts
import { describe, expect, test } from "vitest";
import { createWorkflowV2RunState } from "../../../shared/workflow-v2/state";
import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";
import { assembleWorkflowV2LeaderNavigation } from "./workflow-v2-leader";

describe("workflow-v2 leader", () => {
  test("surfaces escalation hints without mutating graph readiness", () => {
    const runState = createWorkflowV2RunState({
      definition: definition(),
      maxParallelNodes: 2,
    });
    const outputs: WorkflowV2WorkerOutput[] = [
      {
        nodeId: "implement",
        summary: "Implementation done",
        outputs: { diff: "src/app.ts" },
        proposals: [{ kind: "escalate", reason: "touches shared runtime" }],
      },
    ];

    const leader = assembleWorkflowV2LeaderNavigation({
      runState,
      runnableNodeIds: ["plan"],
      workerOutputs: outputs,
    });

    expect(leader.nextNodeIds).toEqual(["plan"]);
    expect(leader.escalationHints).toEqual(["touches shared runtime"]);
    expect(leader.planHealth).toBe("at-risk");
  });
});
```

- [ ] **Step 2: Run the leader test**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-leader.test.ts
```

Expected: fail with a missing module or missing export error.

- [ ] **Step 3: Implement a pure leader overlay that reads run state and worker proposals but never edits edges**

```ts
import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";
import type { WorkflowV2RunState } from "../../../shared/workflow-v2/state";

export interface WorkflowV2LeaderNavigation {
  nextNodeIds: string[];
  escalationHints: string[];
  priorityNodeIds: string[];
  planHealth: "healthy" | "at-risk" | "blocked";
}

export function assembleWorkflowV2LeaderNavigation(input: {
  runState: WorkflowV2RunState;
  runnableNodeIds: string[];
  workerOutputs: WorkflowV2WorkerOutput[];
}): WorkflowV2LeaderNavigation {
  const escalationHints = input.workerOutputs
    .flatMap((output) => output.proposals)
    .filter((proposal) => proposal.kind === "escalate")
    .map((proposal) => proposal.reason);

  return {
    nextNodeIds: [...input.runnableNodeIds],
    escalationHints,
    priorityNodeIds: [...input.runnableNodeIds],
    planHealth:
      input.runState.status === "failed"
        ? "blocked"
        : escalationHints.length > 0
          ? "at-risk"
          : "healthy",
  };
}
```

- [ ] **Step 4: Re-run the leader tests**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-leader.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the leader overlay**

```bash
git add src/main/workflows/v2/workflow-v2-leader.ts src/main/workflows/v2/workflow-v2-leader.test.ts
git commit -m "feat: add workflow v2 leader navigation"
```

### Task 4: Add Narrow `llm` And `script` Node Runners

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-llm-runner.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-runner.ts`
- Create: `src/main/workflows/v2/workflow-v2-executor.test.ts`
- Modify: `src/main/workflows/workflow-runtime.ts`
- Test: `src/main/workflows/v2/workflow-v2-executor.test.ts`

- [ ] **Step 1: Write a failing executor-level test that covers one `llm` node and one `script` node**

```ts
test("runs ready nodes through model-specific adapters and preserves structured outputs", async () => {
  const executed: string[] = [];
  const result = await executeWorkflowV2Plan({
    definition: definitionWithScriptNode(),
    maxParallelNodes: 2,
    runLlmNode: async ({ nodeId }) => {
      executed.push(`llm:${nodeId}`);
      return { nodeId, summary: "llm ok", outputs: { text: "done" }, proposals: [] };
    },
    runScriptNode: async ({ nodeId }) => {
      executed.push(`script:${nodeId}`);
      return { nodeId, summary: "script ok", outputs: { exitCode: 0 }, proposals: [] };
    },
  });

  expect(executed).toEqual(["llm:plan", "script:collect"]);
  expect(result.runState.status).toBe("completed");
});
```

- [ ] **Step 2: Run the executor test**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-executor.test.ts
```

Expected: fail because the executor and node runners do not exist yet.

- [ ] **Step 3: Implement the `llm` adapter as a thin wrapper around the existing task runtime dependency surface**

```ts
import type { WorkflowV2TaskPacket } from "../../../shared/workflow-v2/planning";
import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";

export async function runWorkflowV2LlmNode(input: {
  taskPacket: WorkflowV2TaskPacket;
  runTask: (request: RunTaskRequest) => Promise<WorkflowV2WorkerOutput>;
}): Promise<WorkflowV2WorkerOutput> {
  return input.runTask({
    taskId: input.taskPacket.nodeId,
    prompt: input.taskPacket.objective,
  });
}
```

- [ ] **Step 4: Implement the `script` adapter with explicit sandbox policy mapping and no review semantics**

```ts
import type { WorkflowV2ScriptNode } from "../../../shared/workflow-v2/definition";
import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";

export async function runWorkflowV2ScriptNode(input: {
  node: WorkflowV2ScriptNode;
  executeScript: (request: { command: string; sandboxMode: WorkflowV2ScriptNode["script"]["sandboxMode"] }) => Promise<{
    stdout: string;
    exitCode: number;
  }>;
}): Promise<WorkflowV2WorkerOutput> {
  const result = await input.executeScript({
    command: input.node.script.command,
    sandboxMode: input.node.script.sandboxMode,
  });

  return {
    nodeId: input.node.id,
    summary: result.stdout.trim() || `Script exited with code ${result.exitCode}.`,
    outputs: { stdout: result.stdout, exitCode: result.exitCode },
    proposals: [],
  };
}
```

- [ ] **Step 5: Re-run the executor test to confirm the adapters satisfy the contract**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-executor.test.ts
```

Expected: still failing, but now only on the missing execution loop.

- [ ] **Step 6: Commit the adapter layer**

```bash
git add src/main/workflows/v2/workflow-v2-llm-runner.ts src/main/workflows/v2/workflow-v2-script-runner.ts src/main/workflows/v2/workflow-v2-executor.test.ts src/main/workflows/workflow-runtime.ts
git commit -m "feat: add workflow v2 node runners"
```

### Task 5: Implement The Frozen-Graph Execution Loop

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-executor.ts`
- Modify: `src/main/workflows/v2/workflow-v2-executor.test.ts`
- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: `src/main/workflows/workflow-runtime.test.ts`
- Test: `src/main/workflows/v2/workflow-v2-executor.test.ts`
- Test: `src/main/workflows/workflow-runtime.test.ts`

- [ ] **Step 1: Extend the executor test so a completed upstream node unlocks the next runnable node and a failed node stops the run**

```ts
test("stops the run when a node fails and leaves downstream nodes blocked", async () => {
  const result = await executeWorkflowV2Plan({
    definition: definition(),
    maxParallelNodes: 2,
    runLlmNode: async ({ nodeId }) => {
      if (nodeId === "implement") throw new Error("compile failed");
      return { nodeId, summary: "ok", outputs: {}, proposals: [] };
    },
    runScriptNode: async () => {
      throw new Error("script runner should not be reached");
    },
  });

  expect(result.runState.status).toBe("failed");
  expect(result.runState.nodes.review!.status).toBe("blocked");
});
```

- [ ] **Step 2: Run the executor and runtime tests**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-executor.test.ts src/main/workflows/workflow-runtime.test.ts
```

Expected: fail because the loop is not wired yet.

- [ ] **Step 3: Implement the execution loop with scheduler-driven batching and adapter dispatch**

```ts
export async function executeWorkflowV2Plan(input: {
  definition: WorkflowV2Definition;
  maxParallelNodes?: number;
  runLlmNode: (input: { nodeId: string; taskPacket: WorkflowV2TaskPacket }) => Promise<WorkflowV2WorkerOutput>;
  runScriptNode: (input: { node: WorkflowV2ScriptNode }) => Promise<WorkflowV2WorkerOutput>;
}) {
  let runState = createWorkflowV2RunState({
    definition: input.definition,
    maxParallelNodes: input.maxParallelNodes,
  });
  const workerOutputs: WorkflowV2WorkerOutput[] = [];

  while (runState.status === "running") {
    const runnableNodeIds = listWorkflowV2RunnableNodeIds(runState);
    if (runnableNodeIds.length === 0) break;

    for (const nodeId of runnableNodeIds) {
      runState = transitionWorkflowV2NodeState(runState, { nodeId, status: "running" });
      try {
        const output = await runNextNode(nodeId);
        workerOutputs.push(output);
        runState = transitionWorkflowV2NodeState(runState, { nodeId, status: "completed" });
      } catch (error) {
        runState = transitionWorkflowV2NodeState(runState, {
          nodeId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    runState,
    leaderNavigation: assembleWorkflowV2LeaderNavigation({
      runState,
      runnableNodeIds: listWorkflowV2RunnableNodeIds(runState),
      workerOutputs,
    }),
    workerOutputs,
  };
}
```

- [ ] **Step 4: Bridge the existing runtime into the new executor through a thin V2 path instead of rewriting the legacy path**

```ts
if (workflow.workflowV2Plan) {
  return this.runWorkflowV2Plan({
    workflow,
    runId: started.runId,
    baseWorkflowContextDocument,
  });
}
```

- [ ] **Step 5: Re-run the executor and runtime tests**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-executor.test.ts src/main/workflows/workflow-runtime.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit the execution loop**

```bash
git add src/main/workflows/v2/workflow-v2-executor.ts src/main/workflows/v2/workflow-v2-executor.test.ts src/main/workflows/workflow-runtime.ts src/main/workflows/workflow-runtime.test.ts
git commit -m "feat: execute workflow v2 frozen graphs"
```

### Task 6: Final Verification For Phase 03

**Files:**
- Modify: tests only as needed

- [ ] **Step 1: Run the focused Phase 03 suite**

Run:

```bash
npx vitest run src/shared/workflow-v2/packets.test.ts src/main/workflows/v2/workflow-v2-scheduler.test.ts src/main/workflows/v2/workflow-v2-leader.test.ts src/main/workflows/v2/workflow-v2-executor.test.ts src/main/workflows/workflow-runtime.test.ts
```

Expected: pass.

- [ ] **Step 2: Run the broader Workflow V2 regression suite**

Run:

```bash
npx vitest run src/shared/workflow-v2/templates.test.ts src/shared/workflow-v2/validation.test.ts src/shared/workflow-v2/planning.test.ts src/shared/workflow-v2/packets.test.ts src/main/workflows/v2/workflow-v2-planner.test.ts src/main/workflows/v2/workflow-v2-scheduler.test.ts src/main/workflows/v2/workflow-v2-leader.test.ts src/main/workflows/v2/workflow-v2-executor.test.ts src/main/hub/workflow/agent-hub-workflow-v2.test.ts src/main/hub/agent-hub.test.ts src/preload/index.test.ts src/main/workflows/workflow-runtime.test.ts
```

Expected: pass.

- [ ] **Step 3: Run typecheck and isolate pre-existing repo failures from new Workflow V2 regressions**

Run:

```bash
npm run typecheck 2>&1 | tee /tmp/workflow-v2-phase-03-typecheck.log
rg "workflow-v2|workflow-runtime|agent-hub-workflow" /tmp/workflow-v2-phase-03-typecheck.log
```

Expected:

- the first command may still fail on the pre-existing missing-module errors outside Workflow V2
- the second command should print no new Workflow V2 type errors

- [ ] **Step 4: Inspect the final diff for accidental Phase 04 or Phase 05 spillover**

Run:

```bash
git diff --stat
git diff -- docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md src/shared/workflow-v2 src/main/workflows/v2 src/main/workflows/workflow-runtime.ts
```

Expected: changes stay inside Phase 03 boundaries.

- [ ] **Step 5: Commit the verification checkpoint**

```bash
git add docs/superpowers/plans/workflow/2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md
git commit -m "docs: refine workflow v2 phase 03 plan"
```
