# Workflow V2 Phase 04 Review And Human Intervention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic validation, independent reviewer verdicts, retry/reject/escalate flow, and one unified pause boundary for human intervention.

**Architecture:** Layer validation and review on top of the scheduler from phase 03. Mechanical validation should be deterministic and local. Review should be structured and stateful, not encoded in edge semantics or free-form prompt text.

**Tech Stack:** TypeScript, Electron main process, shared contracts, Vitest

---

### Task 1: Add Validation Pipelines

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-validation.ts`
- Create: `src/main/workflows/v2/workflow-v2-validation.test.ts`
- Modify: `src/shared/workflow-v2/definition.ts`

- [ ] **Step 1: Define model-specific validation steps for `llm` and `script` nodes**

- [ ] **Step 2: Run deterministic checks before any semantic reviewer logic**

- [ ] **Step 3: Return explicit validation outcomes**

```ts
type ValidationOutcome = "pass" | "retry" | "fail" | "ask_human";
```

### Task 2: Add Structured Reviewer Verdicts

**Files:**
- Create: `src/shared/workflow-v2/review.ts`
- Create: `src/main/workflows/v2/workflow-v2-reviewer.ts`
- Create: `src/main/workflows/v2/workflow-v2-reviewer.test.ts`

- [ ] **Step 1: Define `ReviewVerdict` and runtime transitions for `accept`, `reject`, and `escalate`**

- [ ] **Step 2: Keep reviewer input independent from executor self-judgment**

- [ ] **Step 3: Requeue, escalate, or pause based on explicit verdict state**

### Task 3: Unify Human Intervention

**Files:**
- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/pages/workflow/WorkflowPage.tsx`

- [ ] **Step 1: Add one unified paused/intervention contract**

- [ ] **Step 2: Support continue, skip, escalate, replan, and review-strength changes from one surface**

- [ ] **Step 3: Remove fragmented half-paused workflow states where possible**

### Task 4: Verification

**Files:**
- Modify: tests only as needed

- [ ] **Step 1: Run focused review/intervention tests**

Run:

```bash
npx vitest run src/main/workflows/v2/workflow-v2-validation.test.ts src/main/workflows/v2/workflow-v2-reviewer.test.ts src/main/workflows/workflow-runtime.test.ts
```

Expected: all pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit code `0`
