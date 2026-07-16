# Workflow V2 Interactive Phase 01: Strict Dependency Settlement

## Status

Approved design. Not implemented.

## Objective

Prevent descendants from starting while any required predecessor is non-terminal, waiting for user input, awaiting approval, paused, or failed.

## Preconditions

- Workflow V2 run state and scheduler exist.
- Node transitions are persisted.
- The frozen graph contains dependency edges.

## Contract

The scheduler must derive readiness from persisted node state after every transition. A dependency is satisfied only by `completed`, or by `skipped` when the frozen edge/node policy explicitly permits skipping.

The following states are never dependency-satisfying:

```ts
"queued" | "ready" | "running" | "validating" | "reviewing" |
"waiting_for_user" | "completion_proposed" | "awaiting_approval" |
"paused" | "failed"
```

A worker process ending, returning partial output, emitting an intervention, or opening a user-input gate must not mark its node complete. When a predecessor enters a blocking state, already queued descendants must be revalidated before launch.

## Required Tests

- A -> B: A waits for user; B never starts.
- A -> B: A proposes completion; B never starts before confirmation.
- A -> B: A pauses or fails; B remains blocked.
- A and C -> B: completion of only one predecessor does not release B.
- Independent C may continue under `finish_independent` while B remains blocked by A.
- Recovery from durable state preserves the same blocking result.

## Forbidden Moves

- Checking only whether an upstream promise settled.
- Treating absence from the active-task map as completion.
- Adding fake edges to represent runtime waiting.
- Advancing from renderer state.

## Acceptance Criteria

No descendant launch occurs unless all required predecessor states satisfy the frozen dependency policy. Tests reproduce the current premature-advance bug and pass after the fix.

## Fail Fast

Stop if readiness cannot be derived from one authoritative persisted state model. Do not patch individual UI statuses around scheduler behavior.
