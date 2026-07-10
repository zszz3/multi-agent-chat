# Workflow V2 Phase 04 Review And Human Intervention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic validation, independent reviewer verdicts, retry/reject/escalate flow, lease-based timeout supervision, and one unified pause boundary for human intervention.

**Architecture:** Layer validation, review, and execution leases on top of the scheduler from phase 03. Mechanical validation should be deterministic and local. Review and timeout supervision should be structured and stateful, owned by the scheduler/leader/orchestrator control plane rather than edge semantics or free-form prompt text.

**Tech Stack:** TypeScript, Electron main process, shared contracts, Vitest

---

### Task 1: Add Validation Pipelines

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-validation.ts`
- Create: `src/main/workflows/v2/workflow-v2-validation.test.ts`
- Modify: `src/shared/workflow-v2/definition.ts`

- [x] **Step 1: Define model-specific validation steps for `llm` and `script` nodes**

- [x] **Step 2: Run deterministic checks before any semantic reviewer logic**

- [x] **Step 3: Return explicit validation outcomes**

```ts
type ValidationOutcome = "pass" | "retry" | "fail" | "ask_human";
```

### Task 2: Add Structured Reviewer Verdicts

**Files:**
- Create: `src/shared/workflow-v2/review.ts`
- Create: `src/main/workflows/v2/workflow-v2-reviewer.ts`
- Create: `src/main/workflows/v2/workflow-v2-reviewer.test.ts`

- [x] **Step 1: Define `ReviewVerdict` and runtime transitions for `accept`, `reject`, and `escalate`**

- [x] **Step 2: Keep reviewer input independent from executor self-judgment**

- [x] **Step 3: Requeue, escalate, or pause based on explicit verdict state**

### Task 3: Unify Human Intervention

**Files:**
- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/pages/workflow/WorkflowPage.tsx`

- [ ] **Step 1: Add one unified paused/intervention contract**

- [ ] **Step 2: Support continue, skip, escalate, replan, and review-strength changes from one surface**

- [ ] **Step 3: Remove fragmented half-paused workflow states where possible**

### Task 4: Add Execution Lease Contracts

**Files:**
- Create: `src/shared/workflow-v2/supervision.ts`
- Create: `src/main/workflows/v2/workflow-v2-supervisor.ts`
- Create: `src/main/workflows/v2/workflow-v2-supervisor.test.ts`
- Modify: `src/shared/workflow-v2/state.ts`

- [x] **Step 1: Define inactivity, soft, hard, probe, and extension limits**

- [x] **Step 2: Define structured `WorkflowProgressReport` and `SupervisorDecision` contracts**

- [x] **Step 3: Validate identity, time ordering, extension bounds, and evidence fields at the runtime boundary**

- [x] **Step 4: Keep progress reports separate from final worker outputs and review verdicts**

### Task 5: Add Soft-Timeout Supervision

**Files:**
- Modify: `src/main/workflows/v2/workflow-v2-executor.ts`
- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: tests only as needed

- [ ] **Step 1: Track attempt lease and meaningful-activity timestamps**

- [ ] **Step 2: On soft timeout, probe the active task before interrupting when steering is supported**

- [ ] **Step 3: Resolve continue, retry, escalate, pause, and cancel as explicit runtime transitions**

- [ ] **Step 4: Bound extensions by per-node hard timeout and run budgets**

- [ ] **Step 5: On missing response or hard timeout, abort the active task and retain available recovery context**

### Task 6: Verification

**Files:**
- Modify: tests only as needed

- [ ] **Step 1: Run focused review/intervention tests**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-validation.test.ts src/main/workflows/v2/workflow-v2-reviewer.test.ts src/main/workflows/v2/workflow-v2-supervisor.test.ts src/main/workflows/workflow-runtime.test.ts
```

Expected: all pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit code `0`
