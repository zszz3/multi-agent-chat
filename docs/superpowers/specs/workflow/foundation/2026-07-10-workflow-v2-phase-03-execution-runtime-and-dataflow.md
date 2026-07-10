# Workflow V2 Phase 03: Execution Runtime And Dataflow

## 2026-07-10

### Status

Implemented and verified on 2026-07-10. Frozen-plan execution, dependency and lock scheduling, packetized dataflow, leader navigation, and narrow LLM/script adapters are active in the WorkflowRuntime V2 path.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- `docs/superpowers/specs/workflow/foundation/2026-07-10-workflow-v2-implementation-program.md`
- the current repository state

The agent must not assume prior chat history.

### Objective

Define the deterministic runtime that executes a frozen Workflow V2 graph by dependency order, with clear separation between data flow and control flow.

This phase is responsible for one thing only:

- running the graph

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- a canonical compiled graph contract exists
- planning produces a frozen graph with graph version and role information
- context and result-packet boundaries are defined

If any precondition is false, stop and report a phase-ordering violation.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- execution runs from the frozen graph, not from planner free text
- node readiness is determined by dependencies only
- data and control planes stay separate
- workers emit data and proposals, not direct downstream behavior mutations
- leaders or orchestrators own navigation and behavioral adjustments
- parallelism is dependency-safe and lock-aware

### In Scope

- run-state model for executable nodes
- dependency readiness and topological progression
- concurrency ceiling handling
- `resourceLocks` semantics
- worker output and proposal contracts
- leader navigation assembly
- execution adapters for `llm` and `script`

### Out Of Scope

- semantic review verdict logic
- human intervention policy details
- persistence and restart recovery
- hook runtime

### Required End State

#### 1. The Scheduler Must Advance By Dependency Readiness

The runtime must be able to determine:

- which nodes are blocked
- which nodes are ready
- which nodes are running
- which nodes are completed or failed

Readiness must depend on graph structure and node state, not on prompt-local agent inference.

#### 2. Parallel Execution Must Be Controlled

The scheduler may run independent nodes in parallel, but must respect:

- dependency order
- global concurrency limits
- per-node `resourceLocks`

Shared high-risk resources must not be accessed concurrently simply because the graph level is parallelizable.

#### 3. Worker Output Must Preserve Data/Control Separation

Worker output must distinguish between:

- structured data for downstream consumption
- proposals for leader or orchestrator judgment

Workers may suggest, but not directly command, downstream behavior changes.

#### 4. Leader Navigation Must Be A Runtime Surface

The runtime must define how a leader or orchestrator contributes:

- navigation guidance
- priority decisions
- escalation hints
- plan-health evaluation

This control overlay may be visible in runtime state or UI composition, but must not be re-encoded as extra edge types.

#### 5. Execution Adapters Must Stay Narrow

The execution runtime may run:

- `llm` nodes through agent execution
- `script` nodes through script execution

but it must not widen this phase into:

- reviewer decision semantics
- pause/continue human policy
- persistence recovery rules

Those belong to later phases.

#### 6. Runtime State Must Be Strong Enough For Later Phases

Even before review and persistence are added, this phase must establish a coherent node-state model that later phases can extend.

At minimum, later phases must be able to layer on:

- validation states
- review states
- paused states
- resumed execution

without rewriting the scheduler contract from scratch.

### Phase Failure Conditions

This phase is incomplete if any of the following remain true:

- runtime still chooses the next node through ad hoc prompt logic rather than graph readiness
- workers can mutate downstream instructions directly
- lock-aware concurrency is missing
- leader navigation requires introducing a second edge type

### Definition Of Done

This phase is complete only when:

- Workflow V2 can execute a frozen graph by dependency order
- parallelism is bounded and lock-aware
- worker data and control proposals are distinct
- leader or orchestrator control remains outside the edge model

### Verification Evidence

- Scheduler tests cover fan-in readiness, concurrency ceilings, resource-lock exclusion, failure, and skipped-dependency propagation.
- Packet and leader tests prove worker data/proposals remain separate and navigation does not mutate graph edges.
- Executor/runtime tests cover parallel batches, dependency order, direct-upstream packet budgets, LLM/script dispatch, validation/review boundaries, checkpoint resume, failure, pause, skip, and hook lifecycle integration.
- The final repository-wide typecheck and 766-test suite pass.
