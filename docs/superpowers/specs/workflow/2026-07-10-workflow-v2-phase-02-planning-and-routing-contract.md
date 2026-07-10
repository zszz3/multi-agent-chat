# Workflow V2 Phase 02: Planning And Routing Contract

## 2026-07-10

### Status

Implemented and verified on 2026-07-10. Plans are compiled, validated, graph-versioned, role-aware, budgeted, approved, and frozen before runtime execution.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-implementation-program.md`
- the current repository state

The agent must not assume prior chat history.

### Objective

Define how Workflow V2 turns an objective into a frozen executable graph with explicit role routing, context budgets, and revision boundaries.

This phase is responsible for one thing only:

- the planning-stage contract

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- a canonical compiled `WorkflowDefinition` contract exists
- templates expand before runtime execution
- static authoring validation rejects structurally invalid graphs

If any precondition is false, stop and report a phase-ordering violation.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- planning and execution are separate stages
- planning outputs a frozen graph rather than an informal prompt chain
- role routing is explicit, not reconstructed from model names later
- context budgets are part of the plan-time contract
- graph revision is explicit and versioned
- execution must not begin from an unplanned or partially planned graph

### In Scope

- planning request and response contracts
- role assignment defaults
- model-profile defaults by role
- `TaskPacket` and `ResultPacket` boundaries
- `ContextBudget` assignment
- plan approval and graph freezing semantics
- `GraphRevision` contract

### Out Of Scope

- node execution scheduler
- review runtime
- persistence and recovery
- hook execution

### Required End State

#### 1. The Planner Must Output An Explicit Run Plan

The repository must define a planning result that is strong enough for execution to begin without extra orchestration inference.

That result must include at least:

- objective
- executable graph
- graph version
- role assignments or role defaults
- acceptance criteria
- context and cost budget information

Execution must not synthesize missing plan fields ad hoc.

#### 2. Role Routing Must Be Visible In The Plan

Planning must preserve the Workflow V2 role model:

- `orchestrator`
- `executor`
- `reviewer`

It must be possible to inspect a plan and see where expert and fast models are expected to be used.

Later runtime code must not have to reverse-engineer role intent from prompt text alone.

#### 3. Context Must Be Planned, Not Only Enforced Later

Context discipline starts in planning.

The planning contract must define how the system captures:

- local task objective
- acceptance criteria
- constraints
- relevant upstream digest
- budget envelope

This allows execution to consume bounded packets instead of full transcript replay.

#### 4. Planning Must Freeze A Graph Version

After plan output is accepted, execution runs against a frozen `graphVersion`.

That means:

- runtime may not mutate the graph opportunistically
- planner changes require explicit revision logic
- unfinished nodes can be re-evaluated against a new version only through a declared revision flow

#### 5. Graph Revision Must Be Explicit

If an executing workflow needs re-planning, the system must produce a structured revision object.

At minimum:

- `revisionId`
- `basedOnGraphVersion`
- `reason`
- `changesSummary`
- `approvedBy`

The runtime must not blur "retry a node" and "change the plan" into the same operation.

#### 6. Planning Must Stay Narrow

This phase may define the planning output contract, but must not absorb execution concerns such as:

- actual node readiness resolution
- lock scheduling
- validator execution
- reviewer verdict processing

The planner decides what to run, not how the scheduler advances each node at runtime.

### Phase Failure Conditions

This phase is incomplete if any of the following remain true:

- execution still starts from a loose objective with no frozen graph
- role routing is implicit or model-name-based only
- context budgets are missing from the plan-time contract
- graph revision has no explicit type boundary

### Definition Of Done

This phase is complete only when:

- Workflow V2 has an explicit planning contract
- plan output is execution-ready and graph-versioned
- role routing and budget semantics are visible before execution starts
- graph revision is explicit instead of ad hoc runtime drift

### Verification Evidence

- Shared planning tests cover plan identity, role defaults, packet boundaries, graph revisions, and validation.
- Main-process planner tests cover template compilation, acceptance criteria, routing overrides, context/cost budgets, and frozen plan construction.
- Runtime tests prove execution consumes the approved plan and packetized direct-upstream outputs instead of reconstructing routing from transcripts.
- The final repository-wide typecheck and 766-test suite pass.
