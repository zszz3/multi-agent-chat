# Workflow V2 Phase 09: Event-Driven Scheduling And Global Locks

## 2026-07-10

### Status

Proposed. Requires completed Phase 08.

### Objective

Replace batch-barrier execution with an event-driven bounded scheduler and extend resource locking from one run to all active workflows without adding control semantics to graph edges.

### Baseline Problem

The executor starts one runnable batch, waits for `Promise.allSettled`, then applies all settlements. A fast node cannot unlock its downstream work until unrelated slow siblings finish. Existing `resourceLocks: string[]` reserve resources only among running nodes in one run.

### Required Preconditions

- Script/task cancellation and capability policy are explicit.
- Phase 07 task/durability boundaries exist.
- Current scheduler and executor tests pass with deterministic clocks/deferred tasks.

### Resource Lock Contract

Keep string locks backward compatible as exclusive requests and add a structured form:

```ts
export type WorkflowV2ResourceLockRequest = string | {
  key: string;
  mode: "shared" | "exclusive";
};

export interface WorkflowV2LockLease {
  key: string;
  mode: "shared" | "exclusive";
  workflowId: string;
  runId: string;
  nodeId: string;
  attempt: number;
  acquiredAt: number;
  expiresAt: number;
  generation: number;
}
```

Lock keys are normalized safe identifiers. Empty keys, duplicates with conflicting modes, unbounded length, or control characters are invalid at authoring time.

### Global Lock Manager Rules

- one AgentHub-owned manager coordinates every active Workflow V2 run
- acquisition is atomic for a node's complete lock set
- keys are sorted before acquisition; partial acquisition is forbidden
- shared locks coexist only with shared locks
- exclusive locks require no other lease
- waiters use FIFO order within priority; starvation is tested
- leases have bounded expiry and owner generation
- release occurs in `finally` on completion, failure, skip, pause, cancellation, or startup reconciliation
- startup removes or quarantines orphan leases after comparing active run/attempt ownership
- a stale owner cannot release a newer generation

The persisted lock registry is operational state, not graph semantics. Edges remain dependency-only.

Before Phase 12, persist the self-versioned global registry separately at `<WorkflowV2FileStore root>/locks/registry.json`. The registry has its own `schemaVersion: 1`, generation, bounded leases, and atomic writer. It must not be embedded into schema-1 run state. Phase 12 migrates it to a schema-2 root envelope and coordinated startup-repair regime; it remains separately authoritative from any one workflow manifest.

### Event-Driven Scheduler Algorithm

The executor maintains:

- current run state
- active node promises keyed by node id
- available global concurrency slots
- lock wait queue
- ready queue in deterministic node order plus explicit priority metadata

Loop:

1. recompute ready nodes from run state
2. request locks for candidates in deterministic order
3. start candidates while slots and locks are available
4. checkpoint each node's `running` transition before invoking its adapter
5. await the next single settlement with `Promise.race`, not the whole wave
6. validate/review/hook/commit that settlement
7. checkpoint and release locks
8. immediately recompute readiness and fill slots
9. terminate only when no active node and no valid ready/waiting work remains

Settlement order may differ from start order. Worker output ordering exposed to consumers must remain deterministic by plan node order or explicit sequence, never accidental promise completion order.

### Failure And Cancellation Policy

Add an explicit run policy:

```ts
export interface WorkflowV2SchedulingPolicy {
  maxParallelNodes: number;
  failureMode: "fail_fast" | "finish_independent";
  lockLeaseMs: number;
  lockWaitTimeoutMs: number;
}
```

- `fail_fast`: abort active siblings, wait for cleanup, persist every final state, then fail
- `finish_independent`: stop scheduling descendants of failed nodes but allow already-independent branches to finish
- lock wait timeout produces a typed intervention or failure according to authored exhausted policy; it never steals an unexpired lease
- manual pause aborts/pauses affected work and releases locks only after the active adapter confirms stop

`finish_independent` must remain compatible with the existing run-status enum before Phase 12: persist the failed node immediately, but keep `runState.status = "running"` while any independent eligible/active work remains. When no eligible/active work remains, derive final run status `failed`. The scheduler/status derivation receives the frozen scheduling policy explicitly; it must not use a hidden global. Public projection shows “finishing independent branches” while status is running. Do not add a new durable run-status enum in this phase.

### Durability Ordering

- persist `running` before side effects begin
- persist terminal/paused state and output before releasing locks to downstream consumers
- if durable checkpoint fails, do not publish completion or release a resource for potentially inconsistent reuse
- lock registry and run checkpoint ordering must have a crash-recovery test for every boundary

### Public Projection

A node waiting for a global lock remains mechanically ready in the graph state but projects `Waiting for resource <key>` with queue metadata. Do not add a fake graph dependency or edge. If a durable wait state is later required, it must be introduced through the Phase 12 schema migration contract.

### Out Of Scope

- distributed multi-host scheduling
- priority preemption of already running nodes
- database lock service
- model routing/budget changes

### Phase Failure Conditions

- any remaining whole-wave `Promise.allSettled` barrier
- locks are acquired incrementally and can deadlock
- two runs can hold conflicting locks
- a fast node still waits for unrelated slow siblings before unlocking downstream
- stale lease release can remove a newer owner
- output ordering changes nondeterministically
- fail-fast exits before child cleanup/checkpointing finishes

### Definition Of Done

- node settlements are processed individually and slots refill immediately
- global shared/exclusive locks are fair, leased, durable enough for reconciliation, and deadlock-free
- scheduling/failure policies are explicit and tested
- checkpoints, locks, outputs, and public projections remain consistent under crashes and cancellations
- existing dependency/review/intervention behavior remains intact
- full verification passes
