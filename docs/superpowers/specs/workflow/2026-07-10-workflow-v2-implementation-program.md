# Workflow V2 Implementation Program Contract

## 2026-07-10

### Status

Draft on 2026-07-10.

This file is the top-level implementation contract for Workflow V2.

It is intentionally split into a master contract plus serial phase specs so a fresh agent can execute one narrow slice at a time without mixing authoring, planning, execution, review, storage, and extension concerns together.

### Purpose

The `docs/workflow-v2/` set already defines the target architecture. What it does not yet provide is an execution-oriented split that is narrow enough for reliable implementation.

This file exists to turn that design set into:

- one canonical implementation contract
- multiple phase specs with single, explicit responsibility
- a phase order that reduces cross-cutting ambiguity

This file is not an implementation plan.

### Source Documents

This program contract is derived from:

- `docs/workflow-v2-design.md`
- `docs/workflow-v2/overview-and-boundaries.md`
- `docs/workflow-v2/roles-and-routing.md`
- `docs/workflow-v2/graph-and-nodes.md`
- `docs/workflow-v2/templates.md`
- `docs/workflow-v2/validation-and-review.md`
- `docs/workflow-v2/data-control-and-leader.md`
- `docs/workflow-v2/execution-and-intervention.md`
- `docs/workflow-v2/context-and-cost.md`
- `docs/workflow-v2/storage-and-recovery.md`
- `docs/workflow-v2/hooks.md`
- `docs/workflow-v2/mvp-scope.md`

If a phase spec conflicts with this master contract, this file wins.

### Why This Program Is Split

Workflow V2 is broad enough that one flat spec is too easy to misread as:

- "implement everything in one pass"
- "invent missing runtime behavior while also changing authoring contracts"
- "treat review, persistence, and hooks as incidental details"

That leads to unclear boundaries and wide edits.

The implementation is therefore split into six phases:

1. authoring contract
2. planning contract
3. execution runtime
4. review and intervention
5. persistence and recovery
6. hook extension surface

Each phase spec must stay narrow. If implementation work requires widening the phase, the correct response is to amend the phase spec, not to silently absorb neighboring concerns.

### How To Hand This To A Fresh Agent

- Give the agent the current repository state plus exactly one phase spec.
- Do not assume the agent has prior chat context.
- The agent may read this master contract for invariants, but should implement from one phase spec at a time.
- If a phase precondition is false in the repository, the agent must stop and report a phase-ordering violation instead of improvising compatibility logic.
- If one phase appears to require fields or runtime behavior owned by a later phase, the earlier phase must stop at contract boundaries instead of backfilling later-phase implementation.

### Non-Negotiable Semantics

#### 1. Workflow V2 Is A Compiled Graph, Not An Implicit Conversation Chain

Execution must run from an explicit workflow definition.

The system must not depend on:

- implicit agent-to-agent transcript replay
- ad hoc runtime branching hidden inside prompts
- shell-local "next step" heuristics with no graph representation

The authoritative executable unit is a compiled graph definition.

#### 2. Edges Express Dependency Only

Edges may express:

- downstream readiness dependency
- upstream output visibility

Edges may not express:

- review semantics
- reject loops
- aggregate policy
- branching policy
- control instructions

Those concerns belong to node contracts or runtime state, not to the edge model.

#### 3. Workflow V2 Starts With Two Execution Models Only

MVP execution models are:

- `llm`
- `script`

Future node kinds such as `human`, `sub-workflow`, or `api-call` are not required to prove the core architecture.

#### 4. Roles And Model Routing Are First-Class

Workflow V2 is not a flat pool of interchangeable agents.

The runtime must preserve these role defaults:

- `orchestrator` uses expert by default
- `executor` uses fast by default
- `reviewer` uses expert by default

Escalation may widen capability, but the default split must remain visible in the planning and execution contracts.

#### 5. Planning And Execution Are Separate Stages

Every run must have:

1. a planning stage that outputs an executable graph plus budgets and acceptance rules
2. an execution stage that runs a frozen graph

The graph is frozen after planning unless a later, explicit graph revision is approved.

#### 6. Data Plane And Control Plane Stay Separate

Workers produce data and proposals.

Leaders or orchestrators own navigation, routing adjustments, escalation, and plan revision decisions.

Workers must not directly rewrite sibling or downstream execution behavior.

#### 7. Validation Is Layered

Node completion must be checked in this order:

1. mechanical validation
2. semantic review

No LLM review step should compensate for missing mechanical structure checks that could have been done deterministically first.

#### 8. Reviewer Independence Must Be Preserved

Important nodes must not self-certify.

Where review exists, the reviewer must evaluate:

- objective
- constraints
- result packet
- evidence
- risk

The reviewer may read executor conclusions, but must not merely echo them.

#### 9. Context Must Be Budgeted Explicitly

The system default is result-packet return, not full transcript replay.

This means:

- executors receive minimal local context
- reviewers receive goal, result, evidence, and risk
- orchestrators receive summaries and unresolved decisions

Long raw logs may be stored, but are not the default control-plane context.

#### 10. Persistence Is File-System-First

MVP persistence is file-based rather than SQLite-first.

The persistence layer must support:

- run state
- event logs
- cache entries
- resumable recovery

without requiring a database schema to prove core Workflow V2 behavior.

#### 11. Hooks Extend Lifecycle Boundaries, Not The Graph Model

Hooks exist to inject lightweight behavior around node lifecycle events.

Hooks must not become a covert second graph language or a hidden way to reintroduce edge semantics through side effects.

### Program Phases

#### Phase 01

File:

- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-01-authoring-contract.md`

Goal:

- define the compiled graph contract
- define node and edge semantics
- define template expansion boundaries
- define static validation before runtime starts

#### Phase 02

File:

- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md`

Goal:

- define how an objective becomes a frozen executable graph
- define role routing and context budgets
- define plan-time graph revision boundaries

#### Phase 03

File:

- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md`

Goal:

- execute frozen graphs deterministically
- define node readiness, concurrency, and resource locking
- enforce data-plane and control-plane boundaries at runtime

#### Phase 04

File:

- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md`

Goal:

- define validation and review gates
- define retry, reject, escalate, and pause behavior
- define the human-intervention contract

#### Phase 05

File:

- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md`

Goal:

- define file layout and durable run state
- define cache reuse boundaries
- define recovery and resume behavior

#### Phase 06

File:

- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md`

Goal:

- define lifecycle hook insertion points
- define hook action taxonomy and guardrails
- extend Workflow V2 without widening the core graph contract

### Global Failure Conditions

The program is incomplete if any of the following remain true:

- execution still depends on implicit transcript-driven orchestration instead of a compiled graph
- edges carry review or control semantics
- planning and execution are not explicitly split
- workers can directly rewrite downstream behavior without a leader or orchestrator boundary
- reviewer logic is merged into executor self-judgment for important nodes
- full transcripts are the default control-plane context
- persistence cannot recover a run without re-running everything from scratch
- hooks require inventing new node kinds for lightweight lifecycle customization

### Whole-Program Definition Of Done

Workflow V2 is complete only when all of the following are true:

- a validated authoring contract exists for compiled workflow definitions
- planning produces a frozen executable graph with explicit role and budget information
- execution runs by dependency order with controlled parallelism and lock semantics
- review and human intervention are first-class runtime states rather than prompt conventions
- state, events, and cache can survive process restart and support partial recovery
- hooks extend lifecycle behavior without widening graph or edge semantics

### Out Of Scope For This Program

This program does not require:

- complex edge semantics
- general graph diff and merge tooling
- a full plugin system
- every future node kind
- a database-first persistence rewrite

The goal is to land a clear, controllable, and recoverable Workflow V2 core first.
