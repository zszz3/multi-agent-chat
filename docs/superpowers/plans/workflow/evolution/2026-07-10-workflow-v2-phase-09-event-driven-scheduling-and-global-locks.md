# Workflow V2 Phase 09 Event-Driven Scheduling And Global Locks Implementation Plan

> Requires verified Phase 08. Read the [Phase 09 spec](../../../specs/workflow/evolution/2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md).

**Status:** Proposed; not implemented.

**Goal:** Process node settlements immediately and coordinate shared/exclusive resource locks across all active Workflow V2 runs.

**Primary files:**

- Modify shared definition/state/validation/storage contracts
- Create `src/main/workflows/v2/workflow-v2-lock-manager.ts`
- Create `src/main/workflows/v2/workflow-v2-lock-store.ts` if persistence is separate
- Modify scheduler/executor/coordinator/AgentHub wiring
- Add focused lock, dynamic scheduling, recovery, and cross-run integration tests

---

## Task 1: Lock Contracts And Backward Compatibility

- [ ] Add structured shared/exclusive lock request and lock lease types.
- [ ] Normalize legacy string locks to exclusive locks.
- [ ] Validate safe bounded keys, duplicate modes, lease/wait limits, and scheduling policy.
- [ ] Include normalized locks in plan validation, plan hash, and cache fingerprint inputs where execution environment changes.
- [ ] Add shared tests for legacy normalization and every invalid shape.
- [ ] Commit: `feat(workflow): define global resource lock contracts`.

## Task 2: Lock Manager State Machine

- [ ] Write failing tests for atomic multi-lock acquisition, shared coexistence, exclusive blocking, deterministic key order, FIFO fairness, wait timeout, lease expiry, generation, stale release, cancellation, and startup orphan cleanup.
- [ ] Implement one AgentHub-owned `WorkflowV2LockManager`; no module singleton.
- [ ] Acquire all normalized keys atomically or none.
- [ ] Release through owner identity/generation and always from coordinator `finally`.
- [ ] Add bounded diagnostics/projections for waiters and owners.
- [ ] Persist/reconcile lock leases according to the spec without changing graph edges.
- [ ] Store the self-versioned registry at `<store root>/locks/registry.json`; keep it outside schema-1 run state until Phase 12.
- [ ] Commit: `feat(workflow): add global workflow lock manager`.

## Task 3: Prove Current Batch Barrier

- [ ] Add an executor regression with two independent roots: fast root unlocks a child while slow root remains pending.
- [ ] Assert the child starts before slow root resolves.
- [ ] Run the new test against current executor and record the expected failure.
- [ ] Add deterministic deferred helpers; do not use sleep.
- [ ] Commit failing regression only if project convention permits; otherwise keep it in the implementation commit with clear test history.

## Task 4: Implement Event-Driven Slot Loop

- [ ] Replace batch `Promise.allSettled` with active-promise map and next-settlement `Promise.race` loop.
- [ ] Persist `running` before invoking adapters.
- [ ] Apply validation/review/Hooks and terminal checkpoint for one settlement immediately.
- [ ] Release locks only after authoritative settlement persistence.
- [ ] Recompute readiness and refill free slots immediately.
- [ ] Keep externally visible worker output order deterministic by plan order/sequence.
- [ ] Test parallel starts, early child unlock, slot refill, pause, skip, retry, reviewer delay, Hook delay, and no-runnable stall.
- [ ] Commit: `perf(workflow): schedule nodes by settlement`.

## Task 5: Failure Modes And Cancellation

- [ ] Add scheduling policy with `fail_fast` and `finish_independent`.
- [ ] For fail-fast, abort active siblings, await cleanup, persist all final states, release locks, then finish.
- [ ] For finish-independent, block descendants of failures while independent branches finish.
- [ ] Make run-status derivation policy-aware: under finish-independent, keep run status running while independent work exists, then derive final failed without adding a pre-Phase-12 enum.
- [ ] Add lock wait timeout resolution through typed failure/intervention policy.
- [ ] Test manual pause and app shutdown while holding/waiting for locks.
- [ ] Test public “finishing independent branches” projection and restart while a failed node coexists with active independent work.
- [ ] Verify process trees/tasks stop before lease release.
- [ ] Commit: `feat(workflow): make scheduling failure policy explicit`.

## Task 6: AgentHub And Recovery Integration

- [ ] Construct one lock manager in AgentHub and inject it into coordinators.
- [ ] Reconcile lock registry during startup before resuming runs.
- [ ] Ensure two distinct workflows with the same workspace lock cannot run conflicting nodes.
- [ ] Ensure non-conflicting/shared work still runs concurrently.
- [ ] Add cross-workflow product tests and crash-order tests for checkpoint/lease boundaries.
- [ ] Commit: `feat(workflow): coordinate locks across runs`.

## Task 7: Verification

```bash
git diff --check
npm run typecheck
npm test -- --run src/main/workflows/v2/workflow-v2-lock-manager.test.ts src/main/workflows/v2/workflow-v2-scheduler.test.ts src/main/workflows/v2/workflow-v2-executor.test.ts src/main/workflows/workflow-runtime.test.ts src/main/hub/agent-hub.test.ts
npm test
npm run build
```

- [ ] Early-unlock regression passes.
- [ ] No batch barrier remains.
- [ ] Lock safety/fairness/generation/recovery properties pass.
- [ ] Output ordering is deterministic.
- [ ] Both failure policies and cleanup ordering pass.
- [ ] Commit/push with completion evidence before Phase 10.
