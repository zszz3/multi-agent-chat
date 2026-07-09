# Runtime Boundary Reset Program Contract

## 2026-07-08

### Status

Implemented on 2026-07-08.

All four phases now land together on the current branch, including the final product-boundary wiring, canonical doc cleanup, and verification proof from phase 04.

### Purpose

This file is the top-level contract for the runtime boundary reset.

It exists to prevent a fresh agent from turning a strict architectural reset into a partial migration or a compatibility-preserving cleanup.

This file is not an implementation plan.

### Why This Program Is Split

The original single-spec version was too broad for a fresh agent with no branch history.

It mixed:

- non-negotiable architecture semantics
- request and persistence model changes
- runtime-driver rewiring
- product-surface defaults and final proof

That shape is too easy to misread as "do everything in one pass" or "keep the old path alive until later."

The reset is now split into a master contract plus serial phase specs.

### How To Hand This To A Fresh Agent

- Give the agent the current repository state plus exactly one phase spec.
- Do not assume the agent has read prior chat or prior specs.
- Each phase spec must be treated as self-contained.
- If a phase spec precondition is not true in the repository, the agent must stop and report a phase-ordering violation instead of improvising compatibility logic.
- If a phase spec conflicts with this master contract, this file wins.

### Non-Negotiable Semantics

#### 1. Explicit Runtime Request Contract

Upper layers must choose these fields explicitly:

- `runtimeId`
- `executionMode`
- `continuationPolicy`
- `runtimeConfig`

Initial required supported config field:

- `runtimeConfig.model`

These fields must not be inferred from:

- legacy persisted state
- runtime-native payload contents
- env flags
- model-name heuristics
- transport-specific assumptions

#### 2. Execution Mode And Continuation Policy Belong To The Upper Layer

Allowed execution modes:

- `oneshot`
- `interactive`

Allowed continuation policies:

- `fresh`
- `resume-preferred`
- `resume-required`

Rules:

- `executionMode` is not derived from `runtimeId`
- `continuationPolicy` applies to both `oneshot` and `interactive`
- unsupported combinations must fail explicitly
- no layer may silently downgrade `interactive` to `oneshot`
- no layer may silently downgrade `resume-required` to `resume-preferred`

#### 3. Router Means Routing Only

`RuntimeRouter` may:

- resolve the driver for a `runtimeId`
- validate support for surface, mode, and continuation policy
- dispatch to the correct driver entrypoint

`RuntimeRouter` may not:

- decode runtime-native payloads
- encode persisted runtime state
- own interactive lifecycle state machines
- rewrite unsupported requests into a different mode or policy

#### 4. Strict Layer Boundaries

`AgentHub` owns:

- app-owned ids such as `chatId`, `taskId`, and `workflowRunId`
- app state
- message/event lists
- running/error/UI state
- configured-agent and channel selection
- persistence of app-owned data plus opaque runtime conversation envelopes
- calls into the router using explicit request objects

`AgentHub` does not own:

- Codex thread semantics
- Claude session semantics
- runtime-native resume payload parsing
- legacy runtime-session migration

`RuntimeDriver` owns:

- supported surfaces
- supported execution modes per surface
- supported continuation policies per surface
- runtime execution behavior
- interactive session creation where supported

`RuntimeStateCodec` owns:

- runtime-native persisted payload validation
- runtime-native persisted payload decoding
- runtime-native persisted payload encoding

`InteractiveChatSession` owns:

- attach
- send
- interrupt
- detach
- snapshot
- interactive continuation updates

#### 5. App State Must Stop Pretending To Be A Runtime Session

App-level state must not expose:

- top-level `sessionId`
- app-level `resumeState`
- parsed runtime-native handles

If the app persists resumable runtime conversation state, it must persist it as an opaque envelope, not as runtime-native fields.

Canonical envelope shape:

- `runtimeId`
- `codecVersion`
- `payload`

Canonical app-owned field names:

- `runtimeState`
- `runtimeConversation`

The payload is opaque above the codec layer.

#### 6. No Legacy Compatibility

The reset is intentionally destructive with respect to old runtime state.

The implementation must not:

- migrate old top-level `sessionId`
- migrate old `runtimeSession`
- salvage malformed persisted runtime payloads
- keep compatibility selectors alive under new names
- preserve transitional Claude transport-era abstractions

If persisted state on disk does not match the new schema, the entire persisted state must be discarded and reinitialized cleanly.

There is no partial salvage path.

#### 7. Product Defaults Are Defaults, Not Architecture Truths

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

These defaults must not be encoded as future-hostile rules.

#### 8. Runtime Expectations

Claude:

- one-shot must use the official Claude Agent SDK single-message path
- interactive must use the official Claude Agent SDK streaming-input path

Codex:

- may keep runtime-specific continuation semantics internally
- must hide them behind driver, codec, and session boundaries

API and any additional registered runtimes:

- must use the same explicit request contract
- must declare their supported surfaces, modes, and continuation policies explicitly

### Program Phases

#### Phase 01

File:

- `docs/superpowers/specs/2026-07-08-runtime-phase-01-request-and-state-reset.md`

Goal:

- define the explicit request contract
- remove app-level `sessionId` and `resumeState`
- introduce the new opaque runtime-conversation envelope
- discard legacy persistence schemas instead of migrating them

#### Phase 02

File:

- `docs/superpowers/specs/2026-07-08-runtime-phase-02-router-driver-codec-cutover.md`

Goal:

- install the strict `AgentHub` / `RuntimeRouter` / `RuntimeDriver` / `RuntimeStateCodec` / `InteractiveChatSession` boundaries
- remove runtime-native parsing and restore logic from `AgentHub`

#### Phase 03

File:

- `docs/superpowers/specs/2026-07-08-runtime-phase-03-runtime-driver-conformance.md`

Goal:

- make each registered runtime conform to the new driver contract
- preserve and verify the official Claude SDK path while bringing the remaining runtimes onto the same contract
- keep continuation behavior behind codec/session boundaries

#### Phase 04

File:

- `docs/superpowers/specs/2026-07-08-runtime-phase-04-surface-wiring-and-proof.md`

Goal:

- wire product defaults and upper-layer config plumbing
- delete compatibility-oriented tests and docs
- prove the reset through type, search, test, and startup verification

### Global Failure Conditions

The overall program is incomplete if any of the following remain true:

- `AgentHub` still parses runtime-native payload fields
- app-level state still exposes top-level `sessionId`
- app-level state still exposes app-level `resumeState`
- old schemas are migrated, partially restored, or best-effort parsed
- router logic silently downgrades mode or continuation behavior
- legacy env selectors still influence runtime selection or execution mode
- Claude interactive is still framed through transitional transport compatibility abstractions instead of the official SDK path
- docs still describe compatibility with old runtime state as a goal

### Whole-Program Definition Of Done

This reset is complete only when all of the following are true:

- upper-layer runtime requests make `runtimeId`, `executionMode`, `continuationPolicy`, and `runtimeConfig.model` explicit
- app-level `sessionId` and app-level `resumeState` are removed
- persisted runtime continuation state is stored only as an opaque envelope
- `AgentHub` is reduced to app-level orchestration
- router, driver, codec, and interactive session responsibilities are separated cleanly
- all registered runtimes conform to the same explicit contract
- Claude one-shot and interactive both use the official SDK
- legacy runtime-state migration paths are deleted
- tests, typecheck, search checks, and real startup proof confirm the new boundary
