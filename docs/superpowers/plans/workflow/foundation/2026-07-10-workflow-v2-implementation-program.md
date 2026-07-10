# Workflow V2 Implementation Program Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Workflow V2 as a compiled, role-aware, recoverable workflow system without trying to widen the first implementation into every future node kind or edge semantic.

**Architecture:** Follow the phased program contract exactly. Keep authoring, planning, execution, review, persistence, and hooks as separate implementation slices. Prefer introducing new focused modules under `src/shared/workflow-v2/` and `src/main/workflows/v2/` instead of overloading the current `workflow-graph.ts` and `workflow-runtime.ts` files with mixed-era behavior.

**Tech Stack:** TypeScript, Electron main process, renderer workflow page, Vitest

---

### Task 1: Establish The Shared Workflow V2 Module Boundary

**Files:**
- Create: `src/shared/workflow-v2/definition.ts`
- Create: `src/shared/workflow-v2/templates.ts`
- Create: `src/shared/workflow-v2/planning.ts`
- Create: `src/shared/workflow-v2/state.ts`
- Create: `src/shared/workflow-v2/storage.ts`
- Create: `src/shared/workflow-v2/hooks.ts`
- Modify: `src/shared/types.ts`

- [x] **Step 1: Introduce a dedicated shared module namespace for Workflow V2 contracts**

```ts
export interface WorkflowV2Definition { ... }
export interface WorkflowV2Plan { ... }
export interface WorkflowV2RunState { ... }
```

- [x] **Step 2: Keep legacy workflow graph contracts isolated instead of silently mutating them in place**

```ts
// Existing workflow graph types stay for current UI/runtime compatibility.
// Workflow V2 contracts live under shared/workflow-v2/.
```

- [x] **Step 3: Re-export only the minimal public surface needed by main/preload/renderer**

Run: `npm run typecheck`
Expected: exit code `0`

### Task 2: Implement The Six Program Phases In Order

**Files:**
- Follow:
  - `docs/superpowers/plans/workflow/foundation/2026-07-10-workflow-v2-phase-01-authoring-contract.md`
  - `docs/superpowers/plans/workflow/foundation/2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md`
  - `docs/superpowers/plans/workflow/foundation/2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md`
  - `docs/superpowers/plans/workflow/foundation/2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md`
  - `docs/superpowers/plans/workflow/foundation/2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md`
  - `docs/superpowers/plans/workflow/foundation/2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md`

- [x] **Step 1: Do not skip phase ordering**

```text
Phase 01 -> Phase 02 -> Phase 03 -> Phase 04 -> Phase 05 -> Phase 06
```

- [x] **Step 2: Treat each phase plan as self-contained and avoid absorbing later-phase work early**

```text
If a phase needs a later contract, stop and tighten the earlier boundary instead of improvising.
```

### Task 3: Wire Workflow V2 Into The Existing Product Surface Safely

**Files:**
- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: `src/main/workflows/workflow-runtime.test.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-execution.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/pages/workflow/WorkflowPage.tsx`
- Modify: `src/renderer/src/pages/workflow/workflow-utils.ts`

- [x] **Step 1: Keep current workflow UX functional while adding a V2-oriented execution path**

```ts
// Prefer an explicit v2 entry or adapter boundary rather than rewriting the
// current workflow runtime in one opaque pass.
```

- [x] **Step 2: Expose only contracts that the renderer actually needs**

```ts
type WorkflowV2RunSummary = { ... }
type WorkflowV2NodeProgress = { ... }
```

- [x] **Step 3: Avoid coupling renderer state directly to raw persistence or hook internals**

### Task 4: Verification And Rollout Proof

**Files:**
- Modify: tests only as needed

- [x] **Step 1: Run focused shared and runtime verification after each phase**

Run:

```bash
npx vitest run src/shared/workflow-graph.test.ts src/shared/workflow-run.test.ts src/main/workflows/workflow-runtime.test.ts
```

Expected: all pass

- [x] **Step 2: Run final typed verification once all phases land**

Run:

```bash
npm run typecheck
npx vitest run src/main/workflows/workflow-runtime.test.ts src/preload/index.test.ts
```

Expected: exit code `0` and 0 failures

- [x] **Step 3: Inspect git diff for accidental broad rewrites across unrelated hub/runtime modules**

Final result on 2026-07-10:

```text
npm run typecheck: passed
npm test: 91 files passed, 766 tests passed
```

The final diff is confined to Workflow V2 contracts/runtime/product wiring/documentation plus the compatibility import-path repair required after synchronizing `origin/main`. User-local `.idea/workspace.xml` changes were not staged.
