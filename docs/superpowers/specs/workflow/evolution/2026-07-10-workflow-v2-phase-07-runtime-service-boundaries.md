# Workflow V2 Phase 07: Runtime Service Boundaries

## 2026-07-10

### Status

Proposed. First phase of the Workflow V2 evolution program.

### Objective

Split Workflow V2 orchestration out of the monolithic `workflow-runtime.ts` into explicit, acyclic services without changing product behavior, IPC contracts, persisted data, prompts, scheduling results, or legacy workflow execution.

This phase exists because later capability, scheduler, budget, revision, storage, and Hook work would otherwise keep expanding one 2,600-line coordinator and make failures hard to classify or recover.

### Required Preconditions

- Phase 01–06 completion remains valid.
- Evolution program baseline commands pass.
- Existing user changes are identified and preserved.
- No Phase 08 behavior is introduced during extraction.

### Non-Negotiable Invariants

- This is a behavior-preserving extraction.
- `WorkflowRuntime` remains the product facade used by AgentHub.
- Legacy workflow execution remains in place and unchanged except import movement required by extraction.
- V2 services depend on ports and shared contracts, never on AgentHub concrete state.
- Dependency direction is one-way; no service imports `WorkflowRuntime` or another higher-level coordinator.
- Existing timeout, abort, persistence, review, intervention, Hook, cache, and recovery behavior remains byte/shape compatible where observable.
- Errors are propagated or translated once at the facade boundary; services do not catch and silently continue.

### Target Module Graph

```text
AgentHub
  -> WorkflowRuntime facade
      -> WorkflowV2RunCoordinator
          -> WorkflowV2TaskService
          -> WorkflowV2ContextService
          -> WorkflowV2DurabilityCoordinator
          -> WorkflowV2InterventionService
          -> WorkflowV2HookHost
          -> existing planner/executor/reviewer/supervisor/recovery modules
```

Allowed dependencies:

- coordinator may call services and pure V2 modules
- services may call their declared ports and pure shared helpers
- durability may call the store/recovery modules
- intervention may call durability and recovery through narrow interfaces supplied by the coordinator
- Hook host may call task and durability through narrow interfaces

Forbidden dependencies:

- service -> `WorkflowRuntime`
- service -> AgentHub concrete class
- task service -> persistence implementation
- context service -> renderer/preload
- durability -> renderer/preload
- circular service imports

### Required Interfaces

Create a V2-only port contract owned under `src/main/workflows/v2/`:

```ts
export interface WorkflowV2RuntimePorts {
  snapshot(): AppSnapshot;
  runTask(request: RunTaskRequest): Promise<AppSnapshot>;
  stopTask(taskId: string): Promise<void>;
  deleteTask(taskId: string, options?: { preserveRuntimeConversation?: boolean }): Promise<AppSnapshot>;
  executeScript(request: ExecuteWorkflowV2ScriptRequest): Promise<WorkflowV2WorkerOutput>;
  createStore(): WorkflowV2StorePort | undefined;
  updatePublicRun(request: WorkflowRunStateUpdate): void;
  finishPublicRun(request: FinishWorkflowRunRequest): WorkflowOperationResult;
}
```

The interface must use existing project types where they already express the contract. Do not duplicate shapes under new names merely to avoid imports.

Before services import the port, move contracts currently declared inside `workflow-runtime.ts` to cycle-free owners:

- `WorkflowRunStateUpdate` -> `src/main/workflows/workflow-runtime-contracts.ts`
- `WorkflowV2StorePort` -> `src/main/workflows/v2/workflow-v2-store-port.ts`
- `ExecuteWorkflowV2ScriptRequest` -> `src/main/workflows/v2/workflow-v2-script-execution.ts`

`workflow-runtime.ts` may temporarily re-export these names for compatibility, but it is no longer their canonical owner. Add import-boundary tests proving V2 services do not import the facade.

Create the evolution program error envelope and validator in `src/shared/workflow-v2/errors.ts`. Services may use structured internal errors while the facade preserves existing public error strings/projections during this behavior-preserving phase. Later phases extend error codes rather than recreating the envelope.

Service responsibilities:

- `WorkflowV2RunCoordinator`: run lifecycle, active-run ownership, service composition, final outcome
- `WorkflowV2TaskService`: task creation discovery, polling, timeout/abort, cleanup, runtime conversation preservation
- `WorkflowV2ContextService`: prompt assembly, structured artifact parsing, context selection; no budget behavior changes yet
- `WorkflowV2DurabilityCoordinator`: checkpoint/event/cache ordering using the existing store contract
- `WorkflowV2InterventionService`: validate and apply existing intervention actions; no revision workflow yet
- `WorkflowV2HookHost`: adapt existing Hook registry to task/file/memory/durability ports; no new effects yet

### Extraction Rules

- Move one responsibility at a time behind characterization tests.
- Preserve public function names that are imported by tests or other modules; re-export temporarily from the old module if required.
- Avoid a “helpers.ts” dumping ground. Each extracted function must belong to one responsibility.
- Pass clocks, timers, and filesystem/task dependencies through ports when needed for deterministic tests.
- Keep mutable run state owned by the coordinator; services receive explicit run-scoped contexts rather than capturing unrelated facade fields.
- No singleton service with cross-test mutable state.

### Error And Cleanup Rules

- Task/process cleanup remains in `finally` blocks.
- Cleanup failure must be observable without masking the primary run failure; use an aggregate/secondary error field where necessary.
- Aborted and timed-out operations retain their current recoverability behavior.
- A service must not update public state before the authoritative operation it represents has succeeded unless compensation is explicit and tested.

### Out Of Scope

- trusted Script execution
- dynamic scheduler algorithm
- global locks
- actual profile-to-model routing
- new budget behavior
- replan revision flow
- storage schema migration
- Hook receipt/idempotency changes
- renderer features

### Phase Failure Conditions

The phase is incomplete if:

- `workflow-runtime.ts` still owns V2 task polling, durability, intervention, context, and Hook internals directly
- extraction changes persisted/public results without an approved spec amendment
- new circular imports appear
- tests rely on module-global mutable state
- legacy workflow tests regress
- services catch infrastructure errors and continue silently

### Definition Of Done

- the target module graph exists and is acyclic
- WorkflowRuntime delegates V2 execution and intervention through the coordinator
- characterization tests prove current behavior before/after extraction
- focused Workflow V2 and legacy workflow tests pass
- full typecheck, tests, and production build pass
- no Phase 08–14 behavior is hidden in the refactor
