# Workflow V2 Phase 07 Runtime Service Boundaries Implementation Plan

> Implement only after reading the [Phase 07 spec](../../specs/workflow/2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md) and the evolution program contract. This phase must preserve behavior.

**Status:** Proposed; not implemented.

**Goal:** Extract Workflow V2 orchestration from `workflow-runtime.ts` into an acyclic service graph while preserving all public/persisted behavior.

**Primary files:**

- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: `src/main/workflows/workflow-runtime.test.ts`
- Create: `src/main/workflows/v2/workflow-v2-runtime-ports.ts`
- Create: `src/main/workflows/workflow-runtime-contracts.ts`
- Create: `src/main/workflows/v2/workflow-v2-store-port.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-execution.ts`
- Create: `src/shared/workflow-v2/errors.ts`
- Create: `src/main/workflows/v2/workflow-v2-run-coordinator.ts`
- Create: `src/main/workflows/v2/workflow-v2-task-service.ts`
- Create: `src/main/workflows/v2/workflow-v2-context-service.ts`
- Create: `src/main/workflows/v2/workflow-v2-durability-coordinator.ts`
- Create: `src/main/workflows/v2/workflow-v2-intervention-service.ts`
- Create: `src/main/workflows/v2/workflow-v2-hook-host.ts`
- Create focused tests beside each new module
- Create: `src/main/workflows/v2/workflow-v2-boundaries.test.ts`

---

## Task 1: Record Characterization Baseline

- [ ] Run `wc -l src/main/workflows/workflow-runtime.ts` and record the baseline in the phase completion note.
- [ ] Enumerate every exported function/type imported outside `workflow-runtime.ts` with `rg`.
- [ ] Add/confirm tests for: fresh V2 run, LLM run, Script policy failure, independent review, supervision continue/pause/hard timeout, each intervention action, checkpoint/cache write, recovery resume, startup reconciliation, every Hook lifecycle/failure policy, and legacy workflow execution.
- [ ] Add snapshots/assertions for public `FinishWorkflowRunRequest`, progress/events, persisted run state, cache entry, and intervention result shapes.
- [ ] Run:

```bash
npm test -- --run src/main/workflows/workflow-runtime.test.ts src/main/workflows/v2/workflow-v2-executor.test.ts src/main/hub/workflow/agent-hub-workflow-v2.test.ts
```

- [ ] Commit only missing characterization tests: `test(workflow): characterize v2 runtime boundaries`.

## Task 2: Introduce Ports And Boundary Guard

- [ ] Move `WorkflowRunStateUpdate`, `WorkflowV2StorePort`, and `ExecuteWorkflowV2ScriptRequest` to the canonical cycle-free files required by the spec.
- [ ] Re-export moved names from `workflow-runtime.ts` only where current imports require compatibility; add a search/test proving no new code treats the facade as type owner.
- [ ] Add `WorkflowV2ErrorEnvelope`, category/code validation, finite bounded details validation, and clone tests under shared V2 errors.
- [ ] Create `WorkflowV2RuntimePorts` using existing project types; do not duplicate `RunTaskRequest`, `WorkflowRunStateUpdate`, store, script, or finish shapes.
- [ ] Add factory input for clock/timer only where current code directly depends on nondeterministic globals.
- [ ] Add `workflow-v2-boundaries.test.ts` that reads imports and rejects these edges:
  - any V2 service importing `workflow-runtime.ts`
  - any V2 service importing AgentHub concrete modules
  - task/context services importing store implementations
  - renderer/preload imports in main V2 modules
- [ ] Wire an adapter from existing `WorkflowRuntimeDependencies` to `WorkflowV2RuntimePorts` without moving behavior.
- [ ] Preserve existing public error strings/results at the facade while service tests begin using structured internal errors.
- [ ] Run typecheck and boundary tests.
- [ ] Commit: `refactor(workflow): define v2 runtime ports`.

## Task 3: Extract Task Service

- [ ] Move task discovery, creation, polling, activity observation, stop/delete, timeout, abort, runtime-conversation preservation, and supervised cleanup into `WorkflowV2TaskService`.
- [ ] Pass run/node/attempt identity explicitly to every operation.
- [ ] Keep process/task cleanup in `finally`; preserve primary and cleanup errors.
- [ ] Use injected clock/timer in service tests; no real sleep.
- [ ] Test task-not-found after snapshot, duplicate task candidates, creation failure, completion, failure, stop, timeout, abort, cleanup failure, and resumable conversation preservation.
- [ ] Keep existing prompt construction out of task service.
- [ ] Run task service + runtime tests.
- [ ] Commit: `refactor(workflow): extract v2 task service`.

## Task 4: Extract Context Service

- [ ] Move V2 prompt assembly, worker/reviewer/progress/supervisor parsing adapters, dynamic-context selection, and artifact normalization into `WorkflowV2ContextService` or existing focused pure modules.
- [ ] Preserve current approximate-budget and unavailable-fallback behavior exactly; Phase 10 changes semantics later.
- [ ] Keep task starts, persistence, scheduling, and public state updates out of context service.
- [ ] Move existing prompt/parser tests or add focused equivalents without reducing assertions.
- [ ] Run context and runtime tests.
- [ ] Commit: `refactor(workflow): extract v2 context service`.

## Task 5: Extract Durability Coordinator

- [ ] Move event sequencing, checkpoint persistence, cache persistence, node-control persistence, and final durable state ordering into `WorkflowV2DurabilityCoordinator`.
- [ ] Retain current store port and schema version.
- [ ] Explicitly pass current checkpoint/control/cache context; do not capture coordinator-private mutable data through closures.
- [ ] Test initial checkpoint, state transition events, event count, cache fingerprint inputs, store failure before execution, failure during event append, and recovery state.
- [ ] Verify authoritative write failure still stops public success publication.
- [ ] Commit: `refactor(workflow): extract v2 durability coordinator`.

## Task 6: Extract Intervention Service And Hook Host

- [ ] Move intervention request validation/application into `WorkflowV2InterventionService` while preserving continue/skip/escalate/replan/increase-review-strength results.
- [ ] Move registry construction, in-run memory, file adapter, llmHook adapter, result persistence, and signal translation into `WorkflowV2HookHost`.
- [ ] Preserve current Hook safety/idempotency semantics; Phase 13 changes them later.
- [ ] Inject task/durability/recovery interfaces instead of importing higher-level services.
- [ ] Test every action/lifecycle and invalid cross-run/node request.
- [ ] Commit: `refactor(workflow): extract v2 intervention and hook services`.

## Task 7: Introduce Run Coordinator And Thin Facade

- [ ] Move V2 run lifecycle composition into `WorkflowV2RunCoordinator`.
- [ ] Keep active-run ownership explicit and run-scoped; no module-global map.
- [ ] Make `WorkflowRuntime` delegate V2 run, pause, intervention resolution, and recovery entry points while retaining legacy logic.
- [ ] Preserve exported helpers through direct imports or temporary re-exports with deprecation comments and tests.
- [ ] Remove dead closures/imports after all tests pass.
- [ ] Re-run boundary test and inspect module graph manually.
- [ ] Commit: `refactor(workflow): delegate v2 runs to coordinator`.

## Task 8: Phase Verification

Run:

```bash
git diff --check
npm run typecheck
npm test -- --run src/main/workflows/v2 src/main/workflows/workflow-runtime.test.ts src/main/hub/workflow/agent-hub-workflow-v2.test.ts src/preload/index.test.ts
npm test
npm run build
```

- [ ] All commands exit `0`.
- [ ] Public/persisted characterization fixtures are unchanged unless the spec was amended before implementation.
- [ ] Boundary test proves the target dependency direction.
- [ ] `workflow-runtime.ts` no longer owns V2 task, context, durability, intervention, and Hook internals.
- [ ] Legacy workflow tests pass.
- [ ] No Phase 08 behavior was added.
- [ ] Update spec/plan status with exact evidence and push the phase commit(s).
