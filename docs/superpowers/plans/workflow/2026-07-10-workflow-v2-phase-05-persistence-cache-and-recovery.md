# Workflow V2 Phase 05 Persistence, Cache, And Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Workflow V2 run state durably, reuse only trustworthy cached outputs, and recover from interruption at node granularity.

**Architecture:** Keep persistence file-system-first. Use explicit run-state files, append-only event logs, and cache fingerprints rather than opaque best-effort temp data. Recovery should plug into the runtime from earlier phases without forcing a scheduler rewrite.

**Tech Stack:** TypeScript, Node fs/promises, Electron main process, Vitest

---

### Task 1: Define Storage And Cache Contracts

**Files:**
- Create: `src/shared/workflow-v2/storage.ts`
- Create: `src/shared/workflow-v2/storage.test.ts`
- Modify: `src/shared/workflow-run.ts` only if common helpers are worth reusing

- [x] **Step 1: Define workflow/run directory layout and state-file contracts**

- [x] **Step 2: Add `NodeCacheFingerprint` and cache metadata contracts**

- [x] **Step 3: Keep graph-version-aware resume semantics explicit in the shared contract**

### Task 2: Implement Durable State Writing

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-store.ts`
- Create: `src/main/workflows/v2/workflow-v2-store.test.ts`
- Modify: `src/main/workflows/workflow-runtime.ts`

- [x] **Step 1: Add atomic write helpers for authoritative state files**

- [x] **Step 2: Persist run state, event log, and cache metadata separately**

- [x] **Step 3: Keep long raw logs out of control-plane state payloads**

### Task 3: Add Recovery And Resume

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-recovery.ts`
- Create: `src/main/workflows/v2/workflow-v2-recovery.test.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-restore.ts`

- [x] **Step 1: Read, validate, and materialize executor state from persisted files**

- [x] **Step 2: Resume unfinished execution without rerunning reusable upstream nodes**

- [x] **Step 3: Resume interrupted LLM attempts with saved checkpoint and runtime conversation**

- [ ] **Step 4: Reconcile durable Workflow V2 state during AgentHub startup restore**

- [x] **Step 5: Determine which nodes can resume, rerun, or reuse cache**

- [x] **Step 6: Re-evaluate unfinished nodes when `graphVersion` changes**

### Task 4: Verification

**Files:**
- Modify: tests only as needed

- [x] **Step 1: Run focused persistence and recovery tests**

Run:

```bash
npx vitest run src/shared/workflow-v2/storage.test.ts src/main/workflows/v2/workflow-v2-store.test.ts src/main/workflows/v2/workflow-v2-recovery.test.ts
```

Expected: all pass

Latest focused recovery/runtime result: 89 tests passed across the store, recovery planner, executor, and runtime bridge.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit code `0`

Workflow V2 and workflow-runtime paths currently report no type errors. Repository-wide typecheck remains blocked by pre-existing missing agent runtime modules outside Workflow V2.
