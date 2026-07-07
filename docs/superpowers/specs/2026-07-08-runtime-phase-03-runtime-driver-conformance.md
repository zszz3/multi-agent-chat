# Runtime Phase 03: Runtime Driver Conformance

## 2026-07-08

### Status

Approved design for the third execution phase.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- the current repository state

The agent must not assume prior chat history or prior spec context.

### Objective

Make every registered runtime conform to the new routed runtime contract, with strict runtime-owned continuation behavior and strict Claude SDK usage.

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- explicit runtime request types already exist
- legacy persistence-schema migration is already gone
- router, driver, codec, and interactive-session boundaries already exist
- `AgentHub` no longer parses runtime-native payload structure

If any precondition is false, stop and report a phase-ordering violation.

### Why This Phase Exists

Even with a clean router boundary, the reset still fails if concrete runtimes keep old semantics alive underneath.

Current repository runtime entrypoints include at least:

- Codex
- Claude
- API
- Hermes

Any additional registered runtime in the repository at execution time must also conform to this phase.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- runtime support is declared explicitly, not inferred by accident
- runtime-native continuation state stays behind codec/session boundaries
- Claude one-shot uses the official Claude Agent SDK single-message path
- Claude interactive uses the official Claude Agent SDK streaming-input path
- oneshot resume is possible only through explicit `continuationPolicy` plus usable opaque conversation state

### In Scope

- concrete runtime-driver implementations under `src/main/`
- Codex runtime driver and interactive session wiring
- Claude runtime driver and interactive session wiring
- API runtime driver wiring
- Hermes runtime driver wiring if the runtime remains registered
- runtime-specific codec implementations for resumable runtimes

### Out Of Scope

- renderer default-policy UX
- final doc cleanup and startup proof

### Required End State

#### 1. Every Registered Runtime Declares Its Own Support Matrix

For each registered runtime, the driver must explicitly declare:

- supported surfaces
- supported execution modes per surface
- supported continuation policies per surface

No runtime may rely on old fallback behavior such as:

- "if session-like data exists, try resume anyway"
- "if interactive is unsupported, fall back to oneshot"

#### 2. Codex Must Conform Without Leaking Native Semantics Upward

Codex may keep its native thread/session behavior internally.

However:

- upper layers must only pass opaque runtime conversation envelopes
- upper layers must not read Codex-native thread fields
- Codex interactive session logic must refresh runtime conversation state through the new codec/session boundary

#### 3. Claude Must Use The Official SDK For Both Paths

Claude one-shot:

- must use the official SDK single-message path

Claude interactive:

- must use the official SDK streaming-input path

This phase must delete or reject any remaining transitional abstraction that preserves:

- transport-era selector logic
- compatibility wording that treats legacy wrapper paths as valid targets
- fake SDK framing around older transport wrappers

#### 4. API Must Conform To The Explicit Contract

API may remain one-shot only in current product policy.

Even so, its driver must still consume the same explicit contract:

- `runtimeId`
- `executionMode`
- `continuationPolicy`
- `runtimeConfig`

If API does not support a requested mode or continuation policy, it must fail explicitly.

#### 5. Hermes Or Any Other Registered Runtime Must Not Be An Escape Hatch

If Hermes or another runtime remains registered:

- it must also declare its support matrix explicitly
- it must not bypass router validation
- it must not keep legacy session semantics alive through ad hoc fields

If a runtime should no longer exist, remove it deliberately rather than letting it silently follow stale contracts.

### Forbidden Moves

- Do not keep a runtime on the old contract "until later."
- Do not preserve runtime-specific resume inputs outside the opaque envelope boundary.
- Do not allow Claude to keep a compatibility selector or fallback path that contradicts the official SDK requirement.
- Do not let one-shot resume happen through hidden runtime heuristics.

### Acceptance Criteria

This phase is complete only if all of the following are true:

- every registered runtime conforms to the new driver contract
- resumable runtimes use codec/session boundaries for conversation continuation
- Claude one-shot uses the official SDK single-message path
- Claude interactive uses the official SDK streaming-input path
- unsupported runtime requests fail explicitly instead of falling back

### Search Proof

The phase is not done until code search confirms the following:

- no legacy Claude transport selector remains active
- no registered runtime bypasses router validation
- no upper-layer code reads runtime-native payload structure for Codex, Claude, or any other runtime

### Fail-Fast Conditions

Stop and report a blocking issue instead of improvising if:

- phase 02 preconditions are not satisfied
- the installed Claude package surface no longer supports the planned official SDK path and the repository has not been explicitly re-spec'd for that change
- a registered runtime cannot conform without first changing product-level defaults or renderer request wiring, which belongs to phase 04

### Handoff Output For Phase 04

At the end of this phase, the repository must already have:

- registered runtimes on one common driver contract
- official SDK-based Claude one-shot and interactive execution
- runtime-native continuation hidden behind codec and session boundaries
- explicit failure for unsupported requests

Phase 04 may assume those conditions and must stop if they are not true.
