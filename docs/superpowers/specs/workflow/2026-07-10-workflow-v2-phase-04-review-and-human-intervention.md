# Workflow V2 Phase 04: Review And Human Intervention

## 2026-07-10

### Status

Implementation complete on 2026-07-10. Layered validation, real independent reviewer TaskRuns, lease supervision, recoverable hard/probe timeouts, and one durable intervention action surface are implemented. Repository-wide typecheck is still affected by pre-existing legacy runtime wrapper imports outside Workflow V2; focused Workflow/AgentHub/preload/renderer checks and tests pass.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-implementation-program.md`
- the current repository state

The agent must not assume prior chat history.

### Objective

Define how Workflow V2 decides whether node output is acceptable, when it should retry, when it should escalate, and how humans can intervene through one unified pause boundary.

This phase is responsible for one thing only:

- correctness gates and intervention flow

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- a compiled graph contract exists
- a planning contract exists
- a scheduler exists for `llm` and `script` nodes
- worker output and leader control boundaries are explicit

If any precondition is false, stop and report a phase-ordering violation.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- mechanical validation runs before semantic review
- important nodes do not self-certify
- review state is runtime state, not edge metadata
- `paused` is the unified human-intervention state
- retry, reject, escalate, and skip are distinct outcomes

### In Scope

- mechanical validation pipelines
- semantic review handoff
- reviewer node verdict contract
- retry and exhaustion policy
- reject and escalate loops
- unified pause and human-decision surface
- lease-based timeout supervision
- structured progress probes and supervisor decisions

### Out Of Scope

- persistence file layout
- cache fingerprinting
- hook execution framework
- durable checkpoint storage and restart recovery, which belong to Phase 05

### Required End State

#### 1. Validation Must Be Layered

Node acceptance must occur in two steps:

1. deterministic structural and rule validation
2. semantic quality review where required

The runtime must not call semantic review to compensate for missing structural checks.

#### 2. LLM And Script Nodes Must Have Distinct Pipelines

`llm` nodes and `script` nodes do not validate the same way.

The runtime must preserve execution-model-specific validation rules while keeping one consistent high-level contract:

- validate
- pass
- retry
- fail
- ask human

#### 3. Reviewer Verdicts Must Be Structured

Reviewer outcomes must not be free-form prose only.

At minimum, the runtime must support structured decisions such as:

- `accept`
- `reject`
- `escalate`

plus reasons, required fixes, and risk indicators.

#### 4. Reject And Retry Must Be Controlled, Not Implicit

If a node is rejected:

- the runtime must know whether to retry the same node
- or route to orchestrator
- or pause for human action

It must not rely on prompt text alone to infer the next transition.

#### 5. Human Intervention Must Use One Pause Boundary

The system must expose one unified paused state for:

- continue
- skip
- escalate
- replan
- increase review strength

The implementation must not create multiple half-paused states that each encode different UI or scheduler assumptions.

#### 6. Review Must Stay Out Of Edge Semantics

This phase may introduce review states and reviewer nodes, but must not introduce:

- review edges
- reject edges
- human-intervention edges

Those behaviors belong to runtime state transitions.

#### 7. Timeout Supervision Must Be Lease-Based

Each running attempt must have explicit inactivity, soft, and hard time boundaries.

- inactivity timeout detects loss of meaningful activity
- soft timeout requests progress without immediately terminating the task
- hard timeout is an absolute cancellation boundary

Soft timeout must not be treated as node failure by itself. The scheduler or orchestrator must first request a structured progress report when the underlying runtime can still be steered.

#### 8. Progress Reports Must Be Structured And Evidence-Based

The progress-report contract must include, at minimum:

- node and attempt identity
- current phase
- completed and remaining items
- blockers
- evidence produced since the previous report
- optional checkpoint reference
- estimated remaining time
- whether interruption is safe
- requested control action

A progress report must never count as final node output and must never bypass mechanical validation or semantic review.

#### 9. Supervisor Decisions Must Be Explicit

After a progress probe, the control plane must choose one structured action:

- `continue` with a bounded lease extension
- `retry`, optionally from a checkpoint
- `escalate` to the orchestrator or a stronger model route
- `pause` through the unified human-intervention boundary
- `cancel`

Ordinary dependency parents must not own this decision. Timeout supervision belongs to scheduler, leader, or orchestrator control state and must not be encoded in edges.

#### 10. Extensions Must Stay Inside Hard Budgets

The runtime must enforce:

- a maximum extension count
- a maximum duration per extension
- progress-probe timeout
- node hard timeout
- run wall-clock and model-call budgets

Repeated identical reports, reports with no new evidence, or missing probe responses must not renew the lease indefinitely.

#### 11. Interruption Must Preserve Recoverability

The control plane should request a checkpoint before interruption when possible.

- steering-capable runtimes may probe the active conversation directly
- runtimes without steering must stop the old task only after capturing available output and recovery context
- persistent checkpoint storage and restart recovery are implemented in Phase 05

#### 12. Intervention Resolution Must Be One Cross-Layer Contract

`continue`, `skip`, `escalate`, `replan`, and `increase_review_strength` must use the same typed request from renderer through Electron IPC to the durable runtime.

- `continue` resumes from the available checkpoint and runtime conversation
- `skip` records a skipped output packet so downstream dependency inputs remain explicit
- `escalate` reruns with the expert model-profile contract and mandatory independent review
- `increase_review_strength` reruns with mandatory independent review without changing the frozen graph
- `replan` keeps the current run stopped and records that a new graph revision is required; it does not mutate the frozen plan in place

Every accepted resolution must be appended to the durable event log and stored in node control state before execution continues.

### Phase Failure Conditions

This phase is incomplete if any of the following remain true:

- important nodes can self-approve with no independent review option
- review outcomes are only free-form text
- pause behavior is fragmented across multiple incompatible states
- review logic is encoded through graph edges
- soft timeout always kills work without a progress probe opportunity
- lease extensions can exceed hard node or run budgets
- free-form progress prose directly marks a node complete

### Definition Of Done

This phase is complete only when:

- Workflow V2 has layered validation gates
- reviewer verdicts are structured and actionable
- retry, reject, escalate, and pause transitions are explicit
- human intervention is unified through one runtime pause contract
- overdue work is supervised through bounded leases, structured progress reports, and explicit control decisions
