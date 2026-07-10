# AgentHub Workflow Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Workflow draft, run, and selection state ownership out of `AgentHub` without changing external behavior.

**Architecture:** Add a main-process `WorkflowStore` that owns Workflow maps and synchronous transitions. Keep `AgentHub` as a compatibility facade and async execution coordinator, delegating state access and mutation to the new Store.

**Tech Stack:** TypeScript, Electron main process, Vitest, existing shared Workflow types.

---

## File Structure

- Create `src/main/workflow-store.ts`: Workflow state ownership and synchronous transitions.
- Create `src/main/workflow-store.test.ts`: direct Store behavior tests.
- Modify `src/main/agent-hub.ts`: replace Workflow maps with Store delegation.
- Modify `src/main/agent-hub.test.ts`: add one compatibility assertion proving Hub state is Store-backed.
- Modify `src/main/WORKFLOW-RUNTIME.md`: record the new state owner.

### Task 1: Establish WorkflowStore ownership

**Files:**
- Create: `src/main/workflow-store.test.ts`
- Create: `src/main/workflow-store.ts`

- [ ] **Step 1: Write the failing ownership test**

```ts
import { describe, expect, test } from "vitest";
import { WorkflowStore } from "./workflow-store";

describe("WorkflowStore", () => {
  test("owns workflow selection and returns isolated snapshots", () => {
    const store = new WorkflowStore({
      normalizeDraft: (draft) => structuredClone(draft),
      now: () => 100,
      createWorkflowId: () => "wf_1",
      createRunId: () => "run_1",
      onChange: () => undefined,
    });
    const workflow = store.createDraft({ configuredAgentId: "agent", modelId: "model" });
    expect(workflow?.workflowId).toBe("wf_1");
    expect(store.snapshot().activeWorkflowId).toBe("wf_1");
    const snapshot = store.snapshot();
    snapshot.workflows[0]!.title = "mutated outside";
    expect(store.getWorkflow("wf_1")?.title).not.toBe("mutated outside");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/main/workflow-store.test.ts`

Expected: FAIL because `./workflow-store` does not exist.

- [ ] **Step 3: Implement the minimal Store shell**

Create a `WorkflowStore` with private workflow/run maps, active ID, injected normalization/clock/ID functions, `createDraft`, `getWorkflow`, `snapshot`, and a single `changed()` callback.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run src/main/workflow-store.test.ts`

Expected: PASS.

### Task 2: Move synchronous Workflow lifecycle transitions

**Files:**
- Modify: `src/main/workflow-store.test.ts`
- Modify: `src/main/workflow-store.ts`

- [ ] **Step 1: Add failing lifecycle tests**

Cover these concrete behaviors:

```ts
test("selects the most recently updated workflow after deleting the active one", () => {
  const first = store.createDraft({ title: "First" })!;
  now = 200;
  const second = store.createDraft({ title: "Second" })!;
  store.deleteWorkflow(second.workflowId);
  expect(store.snapshot().activeWorkflowId).toBe(first.workflowId);
});

test("rejects an update with a stale expected revision", () => {
  const workflow = store.createDraft()!;
  const result = store.updateWorkflow({
    workflowId: workflow.workflowId,
    expectedRevision: 99,
    graph: workflow.graph,
  });
  expect(result).toMatchObject({ ok: false, revision: 1 });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/main/workflow-store.test.ts`

Expected: FAIL because delete/update transitions are missing.

- [ ] **Step 3: Move lifecycle implementation**

Move creation, patching, reset, seed, select, rename, delete, graph update and context append behavior from `AgentHub` into Store methods. Preserve limits, validation, revision increments, timestamps and error text exactly.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/main/workflow-store.test.ts`

Expected: PASS.

### Task 3: Move Workflow Run state transitions

**Files:**
- Modify: `src/main/workflow-store.test.ts`
- Modify: `src/main/workflow-store.ts`

- [ ] **Step 1: Add a failing Run lifecycle test**

```ts
test("tracks a run separately and mirrors its final state to the workflow", () => {
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
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/main/workflow-store.test.ts`

Expected: FAIL because Run methods are missing.

- [ ] **Step 3: Implement Run transitions**

Move `startWorkflowRun`, `finishWorkflowRun`, `updateWorkflowRunState`, run-context append and run lookup into Store. Keep Workflow and Run updates atomic inside one method call.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/main/workflow-store.test.ts`

Expected: PASS.

### Task 4: Rewire AgentHub as a compatibility facade

**Files:**
- Modify: `src/main/agent-hub.test.ts`
- Modify: `src/main/agent-hub.ts`

- [ ] **Step 1: Add a failing compatibility assertion**

Add a test which creates and selects workflows through public `AgentHub` methods, then asserts the unchanged `AppSnapshot.workflowStore` result. Temporarily assert that a private `workflowStore` field exists and the legacy workflow maps do not.

- [ ] **Step 2: Run the focused Hub tests and verify RED**

Run: `npx vitest run src/main/agent-hub.test.ts -t "workflow state owner"`

Expected: FAIL because Hub still owns the legacy maps.

- [ ] **Step 3: Replace direct map ownership**

Instantiate `WorkflowStore` in the Hub constructor. Delegate public synchronous Workflow methods, async draft request state mutations, snapshot generation, scheduled-workflow lookups, output lookup and persistence hydration to the Store. Delete the three legacy state fields.

- [ ] **Step 4: Run focused integration tests**

Run: `npx vitest run src/main/workflow-store.test.ts src/main/agent-hub.test.ts src/main/mcp-bridge.test.ts src/main/workflow-runtime.test.ts`

Expected: PASS.

### Task 5: Document and verify the migration

**Files:**
- Modify: `src/main/WORKFLOW-RUNTIME.md`

- [ ] **Step 1: Update architecture documentation**

Document that `WorkflowStore` owns persisted draft/run/selection state, `WorkflowRuntime` owns execution control, and `AgentHub` remains the application facade.

- [ ] **Step 2: Run type checking**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run the complete test suite**

Run: `npm test`

Expected: PASS with no failed test files.

- [ ] **Step 4: Check the final diff**

Run: `git diff --check`

Expected: no output.
