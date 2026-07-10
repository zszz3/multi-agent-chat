# Workflow V2 Phase 04: Review And Human Intervention

## 2026-07-10

### Status

Draft on 2026-07-10.

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

### Out Of Scope

- persistence file layout
- cache fingerprinting
- hook execution framework

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

### Phase Failure Conditions

This phase is incomplete if any of the following remain true:

- important nodes can self-approve with no independent review option
- review outcomes are only free-form text
- pause behavior is fragmented across multiple incompatible states
- review logic is encoded through graph edges

### Definition Of Done

This phase is complete only when:

- Workflow V2 has layered validation gates
- reviewer verdicts are structured and actionable
- retry, reject, escalate, and pause transitions are explicit
- human intervention is unified through one runtime pause contract
