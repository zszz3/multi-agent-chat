# Runtime Phase 02: Router Driver Codec Cutover

## 2026-07-08

### Status

Approved design for the second execution phase.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- the current repository state

The agent must not assume prior chat history or prior spec context.

### Objective

Install the strict runtime boundary:

- `AgentHub`
- `RuntimeRouter`
- `RuntimeDriver`
- `RuntimeStateCodec`
- `InteractiveChatSession`

This phase removes runtime-native parsing and restore behavior from `AgentHub`.

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- the shared request contract uses explicit `runtimeId`, `executionMode`, `continuationPolicy`, and `runtimeConfig`
- app-level state no longer exposes top-level `sessionId`
- app-level state no longer exposes app-visible `resumeState`
- persisted runtime continuation data already exists only as an opaque envelope
- legacy persistence-schema migration has already been removed

If any precondition is false, stop and report a phase-ordering violation.

### Why This Phase Exists

Current branch evidence shows `AgentHub` still owns runtime-native logic:

- [src/main/agent-hub.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-hub.ts:477) clones runtime-native resume payloads directly
- [src/main/agent-hub.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-hub.ts:4738) decodes runtime-native resume payloads directly
- [src/main/agents/runtime-driver.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agents/runtime-driver.ts:1) is still too thin to own restore/persistence boundaries
- [src/main/agent-executor.ts](C:/Users/29768/Desktop/multi-agent-chat/src/main/agent-executor.ts:1) still acts as a runtime-specific execution hub instead of consuming a stricter routed contract

### Non-Negotiable Invariants

This phase must enforce all of the following:

- router routes only
- `AgentHub` orchestrates only
- codecs own runtime-native payload validation and translation
- interactive session objects own interactive lifecycle
- unsupported combinations fail explicitly instead of downgrading silently

### In Scope

- `src/main/agent-hub.ts`
- `src/main/agent-executor.ts`
- `src/main/agents/runtime-driver.ts`
- new router and codec files under `src/main/agents/`
- interactive session boundaries for chat under `src/main/agents/`

### Out Of Scope

- final per-runtime SDK wiring details
- renderer-facing default policy wiring
- final docs and startup proof

### Required End State

#### 1. Introduce A Thin `RuntimeRouter`

The repository must gain an explicit router boundary.

`RuntimeRouter` must:

- receive an explicit runtime request
- resolve the correct driver
- validate support for surface, mode, and continuation policy
- dispatch to the correct driver entrypoint

`RuntimeRouter` must not:

- decode runtime conversation payloads
- encode runtime conversation payloads
- own attach/send/detach session state machines

#### 2. Expand The `RuntimeDriver` Contract

The driver contract must become the runtime behavior boundary, not just a factory list.

Each driver must declare:

- supported surfaces
- supported execution modes per surface
- supported continuation policies per surface
- one-shot behavior
- interactive chat session factory where supported
- workflow behavior where supported
- configured-agent-test behavior where supported
- cleanup behavior where supported

#### 3. Introduce `RuntimeStateCodec`

Every runtime that supports resumable conversation state must provide a codec boundary.

The codec is the only layer allowed to:

- validate persisted payload shape
- decode persisted payload into runtime-usable state
- encode updated runtime state back into the opaque envelope

No codec logic may remain in `AgentHub`.

#### 4. Reduce `AgentHub` To App Orchestration

`AgentHub` may still:

- own app state
- own interactive session instance maps
- call router entrypoints
- persist opaque runtime conversation envelopes

`AgentHub` must stop:

- cloning runtime-native resume payloads
- decoding runtime-native resume payloads
- migrating runtime-native payloads
- choosing runtime behavior by reading native payload structure

#### 5. Make Interactive Lifecycle Runtime-Owned

Interactive chat lifecycle must live in runtime-owned session objects such as:

- Codex interactive session implementation
- Claude interactive session implementation

These session objects own:

- attach
- send
- interrupt
- detach
- snapshot
- runtime-conversation refresh

They do not own app persistence schema rules.

### Forbidden Moves

- Do not add a router that also acts as codec or session manager.
- Do not leave runtime-native decode helpers in `AgentHub` "for convenience."
- Do not create one generic cross-runtime parser for runtime-native conversation payloads.
- Do not let driver support validation happen implicitly by returning `undefined`.
- Do not let unsupported requests fall through to older execution code paths.

### Acceptance Criteria

This phase is complete only if all of the following are true:

- a `RuntimeRouter` exists as an explicit dispatch boundary
- the driver contract declares supported surfaces, modes, and continuation policies
- resumable runtimes have codec boundaries for persisted opaque conversation payloads
- `AgentHub` no longer parses runtime-native payload structure
- interactive lifecycle logic is owned by runtime session objects rather than router code
- unsupported surface/mode/policy combinations fail explicitly

### Search Proof

The phase is not done until code search confirms the following:

- no runtime-native resume decode helper remains in `AgentHub`
- no runtime-native resume encode helper remains in `AgentHub`
- no legacy restore helper remains in `AgentHub`
- router code does not inspect runtime-native payload fields

### Fail-Fast Conditions

Stop and report a blocking issue instead of improvising if:

- phase 01 preconditions are not satisfied
- the repository already contains a competing router abstraction with overlapping responsibility
- a proposed codec boundary would still require `AgentHub` to read runtime-native payload internals

### Handoff Output For Phase 03

At the end of this phase, the repository must already have:

- a strict routed runtime boundary
- codec ownership for persisted runtime-native payloads
- runtime-owned interactive session lifecycle
- an `AgentHub` that no longer performs runtime-native payload parsing

Phase 03 may assume those conditions and must stop if they are not true.
