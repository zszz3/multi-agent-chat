# Runtime Phase 01: Request And State Reset

## 2026-07-08

### Status

Implemented on 2026-07-08.

Post-review state-boundary fixes on 2026-07-08 closed the remaining stale `runtimeConversation` and reset-path edge cases before later phases continued.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- the current repository state

The agent must not assume prior chat history or prior spec context.

### Objective

Replace the legacy app/request/state contract with an explicit runtime request model and a new app-owned persistence boundary.

This phase establishes the data model that every later phase depends on.

### Implementation Result

Current branch evidence for this phase now includes:

- [src/shared/types.ts](C:/Users/29768/Desktop/multi-agent-chat/src/shared/types.ts:195) defines the opaque `RuntimeConversation` envelope, and [src/shared/types.ts](C:/Users/29768/Desktop/multi-agent-chat/src/shared/types.ts:201) defines the explicit `RuntimeRequest` contract with `runtimeId`, `executionMode`, `continuationPolicy`, and `runtimeConfig`
- [src/shared/types.ts](C:/Users/29768/Desktop/multi-agent-chat/src/shared/types.ts:290), [src/shared/types.ts](C:/Users/29768/Desktop/multi-agent-chat/src/shared/types.ts:309), and [src/shared/types.ts](C:/Users/29768/Desktop/multi-agent-chat/src/shared/types.ts:334) expose app-owned `runtimeState` / `runtimeConversation` boundaries without top-level app `sessionId` or app-visible `resumeState`
- [src/main/agent-hub.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-hub.ts:4251) restores only the V4 persisted app schema, and [src/main/agent-hub.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-hub.ts:4359) rejects non-V4 payloads so persisted state is reinitialized instead of migrated
- [src/main/agent-hub.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-hub.ts:3130), [src/main/agent-hub.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-hub.ts:1652), and [src/main/agent-hub.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-hub.ts:2395) keep `runtimeConversation` app-owned and opaque by clearing stale state through workflow patch/reset and interactive chat sync paths instead of preserving legacy compatibility fallbacks

### Corrected Branch Truth

The current branch now satisfies the phase-01 reset:

- shared runtime requests use the explicit app-owned contract
- app state persists runtime continuation only as opaque `runtimeConversation` envelopes
- restore rejects legacy state instead of salvaging `sessionId`, `runtimeSession`, or malformed runtime payloads
- later phases may assume there is no app-visible `PersistedResumeState`, no top-level app `sessionId`, and no legacy persistence migration path left to preserve

### Non-Negotiable Invariants

This phase must enforce all of the following:

- upper-layer runtime calls must carry explicit `runtimeId`
- upper-layer runtime calls must carry explicit `executionMode`
- upper-layer runtime calls must carry explicit `continuationPolicy`
- upper-layer runtime calls must carry extensible `runtimeConfig`, with `runtimeConfig.model` supported now
- app-level state must not expose top-level `sessionId`
- app-level state must not expose app-level `resumeState`
- persisted runtime continuation data must be opaque above the codec layer
- legacy schemas must be discarded instead of migrated

### In Scope

- shared runtime request and response types under `src/shared/`
- app-owned chat/task/workflow state types under `src/shared/`
- persisted-state record shapes consumed or produced by `AgentHub`
- restore entrypoints and schema validation in `src/main/agent-hub.ts`
- runtime-executor input types in `src/main/agent-executor.ts`

### Out Of Scope

- final router/driver/codec implementation boundaries
- runtime-specific SDK wiring
- renderer redesign beyond the fields required to send the new request contract

### Required End State

#### 1. Replace Generic `sessionId` Request Semantics

The app/runtime contract must stop using a generic cross-runtime `sessionId`.

This phase must introduce explicit request fields for:

- `runtimeId`
- `executionMode`
- `continuationPolicy`
- `runtimeConfig`

The contract must support `runtimeConfig.model` now.

The contract must also support an optional opaque prior-conversation input for resumable requests.

Required field name:

- `runtimeConversation`

That field must be treated as opaque by upper layers.

#### 2. Split App-Owned Runtime Activity From Runtime-Owned Conversation State

Current `runtimeSession` mixes:

- app-owned interactive attachment/activity state
- runtime-owned continuation payload state

That is the wrong boundary.

After this phase:

- app-owned interactive attachment/activity fields remain app-visible
- runtime-owned resumable conversation data is stored only as an opaque envelope

Required app-owned field split:

- `runtimeState` for app-neutral runtime activity
- `runtimeConversation` for the opaque persisted envelope

#### 3. Remove App-Level `sessionId`

The following app-facing or shared types must stop exposing generic `sessionId` fields:

- chat state
- task state
- workflow request/response shapes
- generic runtime-executor request shapes

If a runtime needs a native thread or session handle, it must travel only inside the opaque conversation envelope or inside runtime-owned session objects.

#### 4. Replace `PersistedResumeState`

`PersistedResumeState` must not survive this phase as an app-visible type.

The new persisted runtime conversation envelope must:

- carry `runtimeId`
- carry `codecVersion`
- carry opaque `payload`

Upper layers may store, replace, and pass this envelope.

Upper layers may not inspect `payload`.

#### 5. Replace Legacy Persistence Schema Handling

Current restore logic includes:

- legacy version handling
- legacy `sessionId` migration
- malformed `runtimeSession` fallback behavior

That entire posture must end in this phase.

Rules:

- only the new schema is legal
- if the persisted state on disk is not the new schema, discard the entire persisted state
- do not salvage chats, tasks, workflows, or runtime state from an old schema
- do not backfill runtime conversation state from legacy `sessionId`

#### 6. Preserve Only App-Neutral Restore Semantics

Restore may still clear ephemeral activity fields.

For restored interactive chats:

- `running` must restore as `false`
- attachment state must restore as `detached`
- ephemeral turn state must not restore as active

That behavior is allowed because it is app-owned lifecycle state, not runtime-native payload parsing.

### Forbidden Moves

- Do not keep `sessionId` and add the new request model beside it.
- Do not keep `resumeState` under a renamed but equivalent app-visible type.
- Do not parse runtime-native payload fields in shared app types.
- Do not migrate legacy `sessionId` into a new opaque envelope.
- Do not keep versioned restore helpers for old schemas as "temporary compatibility."

### Acceptance Criteria

This phase is complete only if all of the following are true:

- shared runtime request types expose explicit `runtimeId`, `executionMode`, `continuationPolicy`, and `runtimeConfig`
- `runtimeConfig.model` is supported in those shared request types
- top-level `sessionId` is removed from app-level chat/task/workflow runtime contracts
- app-visible `PersistedResumeState` is removed
- the new opaque runtime-conversation envelope exists with `runtimeId`, `codecVersion`, and `payload`
- persisted-state loading rejects any non-new schema by discarding the entire stored state
- no restore path migrates legacy `sessionId` or legacy `runtimeSession`

### Search Proof

The phase is not done until code search confirms the following:

- no app-owned shared type still exposes generic runtime `sessionId`
- no app-owned shared type still exposes `resumeState`
- no restore helper still migrates legacy runtime session state
- no restore helper still attempts malformed runtime-session fallback salvage

### Fail-Fast Conditions

Stop and report a blocking issue instead of improvising if:

- another unmerged branch has already introduced a conflicting request-contract type family
- the repository still requires old persisted schema compatibility for a separately approved migration project
- this phase cannot remove old fields without also redefining the runtime/router boundary, which would mean the phase split needs correction

### Handoff Output For Phase 02

At the end of this phase, the repository must already have:

- a single explicit runtime request contract
- app-owned runtime activity state separated from opaque runtime conversation state
- no top-level app `sessionId`
- no app-visible `resumeState`
- no legacy persistence migration path

Phase 02 may assume those conditions and must stop if they are not true.
