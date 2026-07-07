# Runtime Phase 04: Surface Wiring And Proof

## 2026-07-08

### Status

Approved design for the fourth execution phase.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- the current repository state

The agent must not assume prior chat history or prior spec context.

### Objective

Finish the reset at the product boundary:

- wire upper-layer defaults and config fields into the explicit runtime request model
- remove compatibility-oriented tests and docs
- prove the reset through verification and real startup

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- explicit runtime request types already exist
- legacy persistence-schema migration is already gone
- router, driver, codec, and interactive-session boundaries already exist
- registered runtimes already conform to the new contract
- Claude one-shot and interactive already use the official SDK paths

If any precondition is false, stop and report a phase-ordering violation.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- current defaults are product defaults, not architecture truths
- upper layers own default selection for `executionMode` and `continuationPolicy`
- `runtimeConfig.model` must be configurable from upper layers now
- compatibility-oriented docs and tests must be deleted or rewritten, not left beside the new truth

### In Scope

- renderer, preload, and main request-building paths that choose runtime behavior
- chat/workflow/task/configured-agent-test/cleanup default policy wiring
- docs under `docs/` and `docs/zh-CN/` that describe runtime execution architecture
- tests that still encode old migration or compatibility behavior
- verification commands and live startup proof

### Out Of Scope

- unrelated renderer redesign
- MCP redesign

### Required End State

#### 1. Upper Layers Must Send The Explicit Contract

The effective runtime request at the main-process boundary must carry:

- `runtimeId`
- `executionMode`
- `continuationPolicy`
- `runtimeConfig`

`runtimeConfig.model` must be supported now.

If the repository already exposes other common upper-layer fields that belong in `runtimeConfig`, they may be included only if they do not reintroduce runtime-native semantics.

#### 2. Current Product Defaults Must Be Wired Explicitly

Current defaults:

- `chat`
  - default `executionMode`: `interactive`
  - default `continuationPolicy`: `resume-preferred`
- `task`
  - default `executionMode`: `oneshot`
  - default `continuationPolicy`: `fresh`
- `workflow`
  - default `executionMode`: `oneshot`
  - default `continuationPolicy`: `fresh`
- `configured-agent-test`
  - default `executionMode`: `oneshot`
  - default `continuationPolicy`: `fresh`
- `cleanup`
  - default `executionMode`: `oneshot`
  - default `continuationPolicy`: `fresh`

These defaults must be applied by upper-layer request builders or policy selection code, not by runtime-native heuristics.

#### 3. Workflow And Chat Must Not Be Frozen Into Permanent Rules

This phase must not encode future-hostile assumptions such as:

- chat can never be oneshot
- workflow can never be interactive
- only interactive may ever resume prior conversation state

The current defaults are product policy for now, not permanent architecture rules.

#### 4. Remove Compatibility-Oriented Tests And Docs

Delete or rewrite any test that treats the following as correct behavior:

- legacy schema migration
- malformed runtime payload salvage
- silent mode downgrade
- silent continuation-policy downgrade
- old Claude transport compatibility as a target architecture

Docs must be updated so that the canonical runtime story matches the new boundary exactly.

#### 5. Prove The Reset With Real Verification

This phase must end with proof, not assertion.

Required proof categories:

- type proof
- code-search proof
- focused automated test proof
- real development startup proof

The startup proof must use the repository's real dev startup path after the refactor.

### Forbidden Moves

- Do not hide product defaults inside runtime drivers.
- Do not leave old compatibility tests skipped "for later cleanup."
- Do not leave old docs in place as historical alternatives.
- Do not claim success without real startup verification.

### Acceptance Criteria

This phase is complete only if all of the following are true:

- upper layers actually send the explicit runtime request contract
- `runtimeConfig.model` is configurable from upper layers
- current chat/workflow/task/test/cleanup defaults are wired explicitly
- no compatibility-oriented test still defines the target behavior
- canonical docs reflect the new strict boundary
- typecheck, search checks, focused tests, and real startup proof all pass

### Search Proof

The phase is not done until code search confirms the following:

- no doc still presents legacy runtime-state compatibility as a goal
- no test still encodes legacy runtime migration as correct target behavior
- no upper-layer request builder still relies on implicit runtime-mode inference

### Fail-Fast Conditions

Stop and report a blocking issue instead of improvising if:

- phase 03 preconditions are not satisfied
- upper-layer request wiring cannot become explicit without reopening the phase split and moving new data-model work back into phase 01
- startup proof is blocked by unrelated repository breakage that makes the result impossible to verify honestly

### Final Definition Of Done

The full runtime boundary reset is complete only when this phase finishes and all of the following are true:

- explicit upper-layer runtime request semantics are in place
- app state no longer models runtime-native session semantics
- router, driver, codec, and interactive session layers are cleanly separated
- registered runtimes conform to the new contract
- Claude uses the official SDK for one-shot and interactive execution
- old persisted runtime-state compatibility is gone
- docs, tests, typecheck, and live startup proof all agree with the new architecture
