# Workflow V2 Phase 14: Observability, Simulation, And Workflow UX

## 2026-07-10

### Status

Proposed. Final phase of the evolution program; requires completed Phase 13.

### Objective

Expose a typed, redacted, explainable projection of plans, capabilities, routes, budgets, scheduling, locks, revisions, reviews, interventions, Hooks, recovery, and failures; add dry-run simulation and approval UX without coupling renderer state to raw persistence or executor internals.

### Required Preconditions

- typed durable events and storage projections exist
- actual routes and budget ledger are durable
- global locks emit typed lifecycle events
- revision and Hook receipt state machines are complete
- renderer/main/preload typed IPC conventions remain intact

### Projection Boundary

Create a main-process projector that consumes validated snapshots/events and emits bounded public DTOs. Renderer never reads workflow files, event logs, lock files, receipts, or raw TaskRuns directly.

```ts
export interface WorkflowV2RunOverview {
  workflowId: string;
  runId: string;
  graphVersion: number;
  status: string;
  parentRunId?: string;
  revisionId?: string;
  startedAt: number;
  finishedAt?: number;
  budget: WorkflowV2BudgetSummary;
  cache: WorkflowV2CacheSummary;
  nodes: WorkflowV2NodeOverview[];
  activeIntervention?: WorkflowV2HumanIntervention;
}
```

DTOs use allowlists, finite JSON, bounded text, and redaction. They never expose credentials, full environment, unbounded prompts/logs, or native runtime conversation payloads.

### Typed Timeline

Timeline entries derive from typed durable events and include:

- run/plan/revision lifecycle
- node ready/start/output/validation/review/complete/fail/pause/skip
- task route and bounded usage summary
- lock wait/acquire/release/timeout
- lease/probe/supervisor decisions
- budget reservation/settlement/exhaustion
- cache reuse/rerun reason
- Hook receipt/effect outcome
- migration/recovery/quarantine diagnostics
- human approvals/intervention resolutions

Ordering uses durable sequence, not renderer receipt time. The projector detects gaps and displays an incomplete-history warning.

### Metrics

At minimum expose per run/node:

- queue and lock-wait duration
- execution/validation/review/intervention duration
- retries, probes, extensions, and pauses
- prompt/completion tokens, calls, estimated/actual cost
- context omitted/summarized counts
- cache hit/miss and reason
- Hook duration/failure/replay count
- recovery source and migration status

Metric computation is deterministic from typed state/events. It must not change scheduling decisions in this phase.

### Dry-Run Simulation

Simulation performs no worker/script/Hook write effects. It runs:

- template compilation and validation
- capability and route resolution
- budget reservation estimate
- context fit estimate
- dependency/concurrency/lock conflict simulation
- review/approval requirement detection
- cache/reuse preview
- Script backend availability check

```ts
export interface WorkflowV2SimulationReport {
  planHash: string;
  valid: boolean;
  errors: WorkflowV2ErrorEnvelope[];
  warnings: WorkflowV2ErrorEnvelope[];
  criticalPathNodeIds: string[];
  estimatedParallelism: number;
  unresolvedCapabilities: string[];
  lockConflicts: Array<{ key: string; nodeIds: string[] }>;
  budgetEstimate: WorkflowV2BudgetSummary;
  contextRisks: string[];
  approvalRequirements: string[];
}
```

Simulation is advisory except for deterministic validation/capability failures, which use the same code as plan freeze. It cannot be used as proof that side effects will succeed.

### Required UX

#### Plan Approval

Show graph, acceptance criteria, Script/effect capabilities, effective model routes, token/cost limits, resource locks, required approvals, and simulation errors/warnings before run start.

#### Run Timeline

Show node status, current attempt/task, lock wait, progress probe, review, Hook, budget, cache/recovery, and intervention events with stable sequence and expandable bounded details.

#### Revision Approval

Show old/new graphVersion, normalized graph/policy diff, impacted/reuse/rerun nodes, route/capability/budget changes, hashes, warnings, and approval action.

#### Diagnostics

Export a redacted diagnostic bundle containing manifest versions, sanitized plan/state, typed events, capability hashes, route ids, budget summary, migration/repair reports, and app version. Exclude secrets, raw user files, full prompts by default, and runtime conversation payloads.

### IPC Rules

- list/read overview, timeline, simulation, revision projection, and diagnostics through typed preload methods
- paginate timeline with stable cursor/sequence
- cancel obsolete reads with request identity
- mutation IPC remains limited to existing typed run/intervention/revision/approval actions
- main process revalidates every mutation and expected hash/generation
- no generic `readWorkflowFile` or `dispatchWorkflowEvent` API

### Accessibility And Performance

- keyboard navigation and visible focus for approval/timeline actions
- non-color status labels and accessible error summaries
- virtualize/paginate large timelines
- projection and filtering must not block the renderer for large bounded histories
- loading, empty, stale, partial-history, error, and retry states are explicit

### Test Requirements

- pure projector fixtures for every typed event
- redaction and bounded-payload tests
- pagination/gap/deduplication tests
- simulation parity tests with plan freeze
- renderer layout/accessibility/controller tests
- IPC contract tests
- end-to-end flows: plan approval, script capability failure, lock wait, budget intervention, replan approval, Hook replay, migrated run timeline
- large-history performance test with deterministic upper bound

### Out Of Scope

- remote telemetry upload by default
- multi-user collaboration
- distributed tracing backend requirement
- arbitrary event query language
- automatic optimization decisions based on metrics

### Phase Failure Conditions

- renderer reads raw persistence or native TaskRun/runtime conversation state
- timeline uses untyped strings or renderer time ordering
- diagnostic bundle leaks secrets/full prompts/files
- simulation uses a separate validator that can disagree with plan freeze
- UI approval is not hash/generation bound
- large histories render unbounded lists
- metrics alter runtime behavior without a separate contract

### Definition Of Done

- typed/redacted projections cover every Workflow V2 domain
- plan/revision approval and run timeline are complete and accessible
- dry-run reuses authoritative validation/capability/routing/budget logic
- diagnostics are useful and safe
- IPC remains narrow and main-authoritative
- performance, redaction, cross-layer, and end-to-end tests pass
- evolution program final audit passes
