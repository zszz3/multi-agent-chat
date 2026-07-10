# Workflow V2 Phase 06 Hooks And Extension Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit hook lifecycle points and extension primitives without turning hooks into a second planning system or a covert edge-language replacement.

**Architecture:** Keep hooks as lightweight lifecycle extensions around node execution, validation, and completion. Hook execution should live in main-process workflow runtime boundaries, while agent and script executors remain unaware of hook internals.

**Tech Stack:** TypeScript, Electron main process, Vitest

---

### Task 1: Define Hook Contracts And Sources

**Files:**
- Create: `src/shared/workflow-v2/hooks.ts`
- Create: `src/shared/workflow-v2/hooks.test.ts`
- Modify: `src/shared/workflow-v2/definition.ts`

- [ ] **Step 1: Define hook lifecycle points and action taxonomy**

- [ ] **Step 2: Add source precedence for node-defined, template-defined, and user-added hooks**

- [ ] **Step 3: Keep `llmHook` read-only and low-cost by default**

### Task 2: Implement Hook Runtime

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-hooks.ts`
- Create: `src/main/workflows/v2/workflow-v2-hooks.test.ts`
- Modify: `src/main/workflows/v2/workflow-v2-scheduler.ts`

- [ ] **Step 1: Run hooks at explicit lifecycle boundaries**

- [ ] **Step 2: Accumulate hook context variables predictably**

- [ ] **Step 3: Define hook failure policy explicitly**

```ts
type HookFailurePolicy = "fail_node" | "pause_run" | "skip_hook";
```

### Task 3: Guard Against Semantic Drift

**Files:**
- Modify: `src/main/workflows/v2/workflow-v2-hooks.ts`
- Modify: `src/main/workflows/v2/workflow-v2-planner.ts`
- Modify: `src/main/workflows/workflow-runtime.test.ts`

- [ ] **Step 1: Ensure hooks cannot inject hidden edge semantics or bypass review/routing boundaries**

- [ ] **Step 2: Keep hook execution outside agent and script executors**

- [ ] **Step 3: Add regression coverage for forbidden side-effect patterns**

### Task 4: Verification

**Files:**
- Modify: tests only as needed

- [ ] **Step 1: Run focused hook tests**

Run:

```bash
npx vitest run src/shared/workflow-v2/hooks.test.ts src/main/workflows/v2/workflow-v2-hooks.test.ts
```

Expected: all pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit code `0`
