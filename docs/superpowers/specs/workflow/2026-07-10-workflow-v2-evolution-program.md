# Workflow V2 Evolution Program Contract

## 2026-07-10

### Status

Proposed. This program begins only after the completed Workflow V2 Phase 01–06 program.

### Purpose

This contract turns the known post-MVP gaps into a serial implementation program that can be handed to a fresh implementation agent without relying on chat history or architectural guesswork.

The program owns eight phases:

1. runtime service boundaries
2. execution capabilities and script sandbox
3. event-driven scheduling and global locks
4. model routing, budget ledger, and context
5. revision and replan lifecycle
6. storage migration and crash consistency
7. hook safety, idempotency, and memory
8. observability, simulation, and workflow UX

### Required Reading

Before implementing any phase, read:

- `AGENTS.md` and every instruction file it references
- this program contract
- the target phase spec
- the matching phase plan
- the completed Phase 01–06 implementation program spec
- the current source files listed by the target phase

The implementer must treat the current worktree, not remembered chat context, as authoritative.

### Authority And Conflict Rules

1. System/repository instructions win over all project documents.
2. This evolution program wins over a phase document when global invariants conflict.
3. A phase spec wins over its implementation plan for behavior and scope.
4. The implementation plan wins for task order and verification commands.
5. Current code is evidence, not authority, when it contradicts an approved spec.
6. No agent may silently reinterpret a contract to match an easier implementation.

### Baseline Preconditions

The program may start only when:

- Workflow V2 Phase 01–06 completion audit remains valid
- `npm run typecheck` passes
- `npm test` passes
- the current branch contains the selected upstream base
- the working tree has no unexplained changes
- unrelated user changes are identified and protected

If any precondition fails, record the failure and fix or explicitly isolate it before Phase 07.

### Global Non-Negotiable Invariants

#### Frozen Graph And Revision

- A run executes one immutable plan and graphVersion.
- Retry/resume does not mean replan.
- Replan never mutates the old run or old plan.
- A revision requires validation and explicit approval before a new run starts.

#### Capability Safety

- Unsupported execution capabilities fail before plan approval.
- Prompt instructions are never accepted as enforcement for tools, filesystem, network, processes, permissions, review, routing, or budgets.
- Capability resolution fails closed and may not silently widen permissions.

#### Scheduling And Concurrency

- Dependency readiness is graph/state driven.
- Parallelism respects global slots and shared/exclusive locks.
- Locks use stable keys, deterministic acquisition ordering, leases, and `finally` release.
- One node settlement must not wait for unrelated nodes in the same scheduling wave.

#### Budget And Context

- Every model call is charged exactly once to one run ledger.
- Reviewer, supervisor, progress probe, summarizer, worker, and llmHook calls are all included.
- Prompt, completion, cost, call-count, and wall-clock limits have explicit enforcement semantics.
- Context fallback never silently sends the full transcript or drops required acceptance criteria.

#### Persistence And Idempotency

- Authoritative state writes are atomic and crash-tested.
- Stored schema changes require forward migration and rollback/read compatibility policy.
- Durable events are typed and sequence-safe.
- External or file side effects have explicit at-most-once, at-least-once, or idempotency-key semantics.

#### Review And Human Control

- Mechanical validation still precedes semantic review.
- Important nodes still use independent reviewers.
- Human intervention remains one typed cross-layer boundary.
- UI projections may request typed actions but may not directly mutate executor state.

#### Compatibility

- The legacy workflow path remains functional until a separate removal contract exists.
- Existing persisted Workflow V2 schema version 1 data must remain readable through migration or explicit quarantine diagnostics.
- Existing public IPC fields must not be removed without a compatibility plan and tests.
- Before Phase 12, Phases 08–11 may persist new data only as backward-compatible optional plan fields or separate self-versioned files. They must not bump or reinterpret the core run-state schema. Phase 12 owns the coordinated schema-2 migration.

### Shared Error Contract

New cross-layer failures must use a stable error envelope rather than parsing message strings:

```ts
export type WorkflowV2ErrorCategory =
  | "authoring"
  | "planning"
  | "capability"
  | "budget"
  | "execution"
  | "review"
  | "intervention"
  | "persistence"
  | "hook"
  | "internal";

export interface WorkflowV2ErrorEnvelope {
  code: string;
  category: WorkflowV2ErrorCategory;
  message: string;
  retryable: boolean;
  workflowId?: string;
  runId?: string;
  nodeId?: string;
  attempt?: number;
  details?: Record<string, unknown>;
}
```

`details` must contain finite JSON only and must not contain secrets, raw credentials, unrestricted prompts, or unbounded logs.

### Phase Order

```text
07 Runtime Service Boundaries
08 Execution Capabilities And Script Sandbox
09 Event-Driven Scheduling And Global Locks
10 Model Routing, Budget Ledger, And Context
11 Revision And Replan Lifecycle
12 Storage Migration And Crash Consistency
13 Hook Safety, Idempotency, And Memory
14 Observability, Simulation, And Workflow UX
```

Each phase must be merged, verified, and documented before the next phase starts. A later phase may add tests against earlier contracts but may not repair an incomplete earlier implementation through a local workaround.

### Mandatory Phase Evidence

Every phase completion record must include:

- requirement-to-file mapping
- requirement-to-test mapping
- exact commands and exit codes
- negative and failure-path test evidence
- migration/compatibility result where applicable
- `git diff --check`
- full `npm run typecheck`
- focused phase suite
- full `npm test`
- production `npm run build` for cross-layer changes
- commit hashes and pushed branch state
- explicit list of known limitations, which must not contradict the phase definition of done

### Prohibited Shortcuts

- no new boolean flags that bypass state machines
- no free-form event names when a typed event is required
- no catching and ignoring persistence, process, or network errors
- no unbounded arrays, logs, prompts, or event payloads in authoritative state
- no filesystem containment based only on string prefix checks
- no side-effect replay without a durable receipt/idempotency decision
- no model-profile routing based only on text embedded in prompts
- no `Promise.allSettled` batch barrier in the final scheduler
- no UI-only approval that the main process cannot independently verify
- no schema version bump without a migration and old-fixture test

### Program Completion Definition

The evolution program is complete only when all Phase 07–14 definitions of done are proven against current code and tests, the document indexes are current, all plans have evidence-backed completion records, the branch is synchronized with its upstream base, and no required work remains hidden under “future improvement” notes.
