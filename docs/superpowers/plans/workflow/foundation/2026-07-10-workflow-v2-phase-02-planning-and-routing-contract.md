# Workflow V2 Phase 02 Planning And Routing Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a user objective into a frozen Workflow V2 plan with explicit roles, model routing, context budgets, and graph revision boundaries.

**Architecture:** Keep planning separate from execution. Planning should emit a compiled, versioned graph and packetized context contracts, not a loose conversation transcript. The output of this phase should be strong enough that execution can start without inventing missing route or budget decisions.

**Tech Stack:** TypeScript, Electron main process, shared contracts, Vitest

---

### Task 1: Define Plan-Time Contracts

**Files:**
- Create: `src/shared/workflow-v2/planning.ts`
- Create: `src/shared/workflow-v2/planning.test.ts`
- Modify: `src/shared/types.ts`

- [x] **Step 1: Add explicit plan result, role routing, and context budget contracts**

```ts
export interface WorkflowV2Plan {
  objective: string;
  graphVersion: number;
  definition: WorkflowV2Definition;
  contextBudget: ContextBudget;
}
```

- [x] **Step 2: Add `TaskPacket`, `ResultPacket`, and `GraphRevision` types**

- [x] **Step 3: Encode role defaults explicitly**

```ts
type WorkflowV2Role = "orchestrator" | "executor" | "reviewer";
type WorkflowV2ModelProfile = "fast" | "balanced" | "expert";
```

### Task 2: Add A Planner Boundary In Main

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-planner.ts`
- Create: `src/main/workflows/v2/workflow-v2-planner.test.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-draft.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-execution.ts`

- [x] **Step 1: Add a dedicated planner boundary instead of mixing planning into execution helpers**

```ts
export async function buildWorkflowV2Plan(...)
```

- [x] **Step 2: Freeze `graphVersion` and acceptance criteria before execution starts**

- [x] **Step 3: Keep replan/revision as explicit operations**

### Task 3: Route Role And Budget Information Forward

**Files:**
- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/types.ts`

- [x] **Step 1: Carry role/model-profile information into runtime request surfaces**

- [x] **Step 2: Pass packetized context instead of full transcripts**

- [x] **Step 3: Keep the planner narrow and avoid absorbing execution scheduling logic**

### Task 4: Verification

**Files:**
- Modify: tests only as needed

- [x] **Step 1: Run focused planner tests**

Run:

```bash
npx vitest run src/shared/workflow-v2/planning.test.ts src/main/workflows/v2/workflow-v2-planner.test.ts
```

Expected: all pass

- [x] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit code `0`
