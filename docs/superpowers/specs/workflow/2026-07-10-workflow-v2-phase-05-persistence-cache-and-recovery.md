# Workflow V2 Phase 05: Persistence, Cache, And Recovery

## 2026-07-10

### Status

Implementation complete on 2026-07-10. Durable storage, cache fingerprints, incremental checkpoints, node-level resume/rerun/reuse decisions, and automatic AgentHub startup reconciliation are implemented. Repository-wide typecheck is still affected by pre-existing missing agent runtime modules outside Workflow V2; focused Workflow V2 type checks and tests pass.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-implementation-program.md`
- the current repository state

The agent must not assume prior chat history.

### Objective

Define how Workflow V2 stores run state durably, reuses trustworthy outputs, and resumes partially completed graphs after interruption.

This phase is responsible for one thing only:

- durability and recovery

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- authoring, planning, execution, and review contracts already exist
- runtime node states are explicit enough to serialize
- graph version is explicit

If any precondition is false, stop and report a phase-ordering violation.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- MVP persistence is file-system-first
- writes for critical state files are atomic
- recovery is node-granular rather than all-or-nothing
- cache reuse depends on explicit fingerprints, not only node ids
- graph-version changes force re-evaluation of unfinished work

### In Scope

- workflow directory layout
- run-state persistence
- event-log persistence
- cache metadata and fingerprint contract
- recovery algorithm
- resume and partial replay policy
- durable checkpoint payloads produced by Phase 04 timeout supervision

### Out Of Scope

- hook execution
- plugin registry
- database-first redesign

### Required End State

#### 1. File Layout Must Be Predictable

Workflow V2 must have a stable filesystem layout for:

- workflow-level metadata
- run-level state
- event logs
- cache artifacts
- reusable template or memory side files where applicable

The repository must not rely on opaque scattered temp files to recover a run.

#### 2. Run State Must Be Durable Enough To Resume

Persisted run state must capture enough information to restore:

- graph version
- node states
- review-related states
- pause state
- completion boundaries

without replaying the entire workflow from scratch.

For an interrupted or retried node, state must also retain any Phase 04 checkpoint reference, the last accepted progress report, lease-extension count, and the reason the prior attempt stopped.

#### 3. Recovery Must Be Node-Granular

On restart or resume, the system must determine:

- which nodes are already complete
- which nodes failed
- which nodes must be retried
- which cached outputs remain valid

Recovery must not discard all completed work when only a subset needs to rerun.

#### 4. Cache Reuse Must Be Guarded By Fingerprints

Node output may be reused only when its fingerprint still matches the effective execution contract.

At minimum, that fingerprint must consider:

- node definition
- upstream outputs
- model profile
- tool or environment capabilities
- review policy where relevant

Cache reuse must not be keyed only by node id.

#### 5. Graph Version Must Participate In Recovery Decisions

If a graph revision changes `graphVersion`, recovery must re-evaluate whether unfinished or cached work is still valid.

The system must distinguish between:

- rerunning a node under the same graph version
- resuming after a new graph revision

#### 6. Atomic Writes Must Protect Core State

Critical files such as run state must use a write strategy that avoids partial corruption from interruption.

The repository must not rely on best-effort overwrites for authoritative state files.

#### 7. Resume Must Preserve Recoverable Agent Context

When an interrupted LLM node has both a checkpoint and a resumable runtime conversation, recovery must:

- create a fresh executor attempt for that node
- include the checkpoint as recovery context rather than treating it as a result
- request `resume-required` continuation against the saved runtime conversation
- consume that saved recovery context only once so later retries follow normal retry policy

Completed upstream nodes must remain completed and supply their persisted or fingerprint-matched outputs to the resumed node.

### Phase Failure Conditions

This phase is incomplete if any of the following remain true:

- restart requires full rerun of the workflow
- cache reuse ignores effective execution inputs
- graph revisions do not affect recovery policy
- persisted state can be corrupted by partial writes with no mitigation

### Definition Of Done

This phase is complete only when:

- Workflow V2 can persist and reload run state durably
- recovery can restart from node-level failure boundaries
- cache reuse is gated by explicit fingerprint rules
- graph-version-aware resume behavior is defined
