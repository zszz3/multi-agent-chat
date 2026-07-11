# Workflow V2 Interactive Phase 02: Execution Modes And Planning

## Status

Approved design. Not implemented.

## Objective

Make node execution strategy explicit and frozen before a run starts.

## Contract

```ts
export type WorkflowV2ExecutionMode = "one-shot" | "interactive" | "script";
```

Every executable plan node declares an execution mode and mode-specific configuration. Validation rejects missing, incompatible, or unsupported modes before approval.

Planner guidance:

- `one-shot`: bounded objective, complete inputs, low ambiguity, one response can satisfy acceptance criteria.
- `interactive`: multiple information dimensions, expected clarification, user preference discovery, iterative review, or incomplete required inputs.
- `script`: deterministic transformation, validation, extraction, aggregation, formatting, file operation, or command with no reasoning requirement.

The planner returns a machine-readable rationale and confidence for each selected mode. The Manager presents the proposed modes before plan approval. Users may override modes before freezing; runtime may only propose a revision.

## Mode-Specific Plan Fields

- One-shot: runtime route, task packet, retry/review policy.
- Interactive: runtime route, initial prompt, completion criteria, confirmation policy, idle probe policy.
- Script: command/operation identifier, typed arguments, access mode, timeout, expected output schema, approval requirement.

## Compatibility

Existing frozen plans without execution mode require an explicit migration/default rule. They must not be silently reclassified after execution begins.

## Required Tests

- Planner classifies simple bounded work as one-shot.
- Planner classifies multi-dimensional information collection as interactive.
- Planner classifies deterministic work as script.
- Unsupported runtime capability rejects plan approval.
- User override is persisted in the frozen plan.
- Revision is required to change a mode after freeze.

## Forbidden Moves

- Inferring execution mode from prompt text after plan freeze.
- Selecting interactive mode when the chosen runtime cannot resume conversations.
- Using script mode as an unrestricted shell escape hatch.
- Changing a mode during execution without an approved graph revision.

## Fail Fast

Stop plan approval when any node lacks a valid mode, mode-specific configuration, capability support, or migration decision.
## Acceptance Criteria

Execution never infers mode from prompt wording at runtime. Plan inspection and UI both show the chosen mode, rationale, and capability compatibility.
