# Runtime Boundary Reset Design

## 2026-07-08

### Goal

Replace the current implicit, partially runtime-specific main-process execution model with a strict runtime boundary that:

- makes `runtimeId`, `executionMode`, and `continuationPolicy` explicit upper-layer inputs
- removes app-level `sessionId` and runtime-specific resume semantics from `AgentHub`
- routes all runtime entrypoints through a thin router plus layered driver/codec/session abstractions
- drops all compatibility with legacy persisted runtime state and legacy Claude transport-era logic

### Audience

- fresh agents with no prior branch history
- engineers changing `src/main/`
- doc maintainers updating runtime architecture guidance

### Scope

This design covers:

- runtime request semantics for chat, task, workflow, configured-agent test, and cleanup
- the main-process layering between `AgentHub`, router, drivers, codecs, and interactive sessions
- app state and persisted runtime state boundaries
- restore and continuation behavior
- current default policies and future-safe extensibility rules
- strict acceptance criteria and failure conditions

This design does not cover:

- renderer redesign beyond the config fields required to drive the new runtime request model
- MCP redesign
- backward compatibility with old persisted state or legacy Claude transport logic

## Why This Reset Exists

The current branch still mixes three concerns that should not share a layer:

1. app-level orchestration
2. runtime routing and execution
3. runtime-native continuation and persistence semantics

That leak shows up as `AgentHub` understanding runtime-native concepts such as Codex thread ids, Claude session ids, runtime-specific resume payloads, and legacy restore/migration behavior.

The target architecture is stricter:

- upper layers decide what runtime to call and how to call it
- router only routes
- drivers express runtime behavior
- codecs own runtime-native persisted payloads
- app state never directly models runtime-native session handles

## Core Principles

### Explicit Request Semantics

Every runtime request must be built from explicit upper-layer inputs:

- `runtimeId`
- `executionMode`
- `continuationPolicy`
- `runtimeConfig`

No layer may infer these from old session state, old payloads, env flags, or transport-specific heuristics.

### Thin Router

`RuntimeRouter` is a dispatch boundary only.

It may:

- resolve the correct driver for a `runtimeId`
- validate that the driver supports the requested surface and mode
- forward the request to the correct driver entrypoint

It may not:

- interpret runtime-native continuation payloads
- own persistence encoding or decoding
- implement interactive lifecycle state machines
- silently rewrite an unsupported request into a different mode

### Driver-Owned Runtime Semantics

`RuntimeDriver` owns runtime behavior.

That includes:

- supported surfaces
- supported execution modes per surface
- supported continuation policies per surface
- one-shot execution
- interactive session factory where supported
- workflow execution
- configured-agent testing
- cleanup behavior

### Codec-Owned Persisted Runtime State

Any persisted runtime-native continuation state must be treated as opaque above the codec layer.

`RuntimeStateCodec` is the only layer allowed to:

- validate runtime-native persisted payload shape
- decode that payload into driver-usable continuation state
- encode updated continuation state for persistence

`AgentHub` and `RuntimeRouter` must never parse driver-specific payload fields.

### No Legacy Compatibility

This reset is intentionally destructive with respect to old runtime state.

The implementation must not:

- migrate old top-level `sessionId`
- migrate old `runtimeSession`
- preserve malformed persisted runtime payloads through fallback logic
- keep env-based compatibility selectors alive
- preserve old Claude transport compatibility stories as part of the target architecture

## Request Model

### Runtime Identity

The upper layer must choose the runtime explicitly through `runtimeId`.

Examples:

- `codex`
- `claude`
- `api`
- future runtime ids

Runtime identity must not be guessed from:

- model names
- provider names
- prior persisted session handles
- runtime-native payload contents
- legacy compatibility flags

### Execution Mode

The upper layer must choose `executionMode` explicitly.

Allowed values:

- `oneshot`
- `interactive`

`executionMode` is not derived from `runtimeId`.

Instead:

- callers request a mode
- drivers declare which modes they support for a given surface
- router validates support and dispatches

### Continuation Policy

The upper layer must choose `continuationPolicy` explicitly.

Allowed values:

- `fresh`
- `resume-preferred`
- `resume-required`

Meaning:

- `fresh`: do not attempt to continue prior runtime-native conversation state
- `resume-preferred`: resume if usable runtime-native state exists, otherwise start fresh
- `resume-required`: fail if usable runtime-native state does not exist

This policy applies to both `oneshot` and `interactive`.

### Runtime Config

Requests must carry an extensible `runtimeConfig` object.

Initial required supported field:

- `model`

Rules:

- `model` must be explicitly configurable from the upper layer for chat and workflow requests in this reset
- the shape must remain extensible for future runtime-specific but upper-layer-approved fields
- upper layers may rely on defaults, but the request model must not hard-code defaults as the only path

## Surface Policy

### Surface Definitions

This design recognizes these request surfaces:

- `chat`
- `task`
- `workflow`
- `configured-agent-test`
- `cleanup`

### Current Product Defaults

The current product policy is:

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

These are defaults only, not architecture truths.

This design must not encode future-hostile rules such as:

- "chat is always interactive forever"
- "workflow can never support interactive"
- "oneshot can never resume prior runtime-native history"

Instead, defaults are current product policy layered on top of a more general request model.

## Layered Architecture

### 1. AgentHub

`AgentHub` owns only app-level orchestration and state.

Allowed responsibilities:

- app-owned ids such as `chatId`, `taskId`, `workflowRunId`
- message lists
- running/error/UI state
- configured agent and channel selection
- persistence of app-neutral state
- calling the runtime router with explicit request objects

Forbidden responsibilities:

- parsing runtime-native continuation payloads
- constructing Claude or Codex resume payload shapes
- understanding raw Codex thread ids or Claude session ids
- migrating legacy runtime session formats

### 2. RuntimeRouter

`RuntimeRouter` owns dispatch.

Allowed responsibilities:

- select the driver for a given `runtimeId`
- validate that the requested surface, mode, and continuation policy are supported
- call the correct driver entrypoint

Forbidden responsibilities:

- persistence encoding/decoding
- interactive state transitions
- runtime-native payload interpretation

### 3. RuntimeDriver

Each runtime has one driver implementation.

Each driver must declare:

- supported surfaces
- supported execution modes per surface
- supported continuation policies per surface
- default runtime config normalization rules, where needed

Each driver must expose the runtime behaviors it supports:

- one-shot execution
- interactive chat session factory where supported
- workflow execution
- configured-agent test
- cleanup

### 4. RuntimeStateCodec

Each runtime that persists resumable conversation state must own a codec.

The codec must:

- define the persisted envelope version it understands
- validate opaque payload shape
- decode persisted runtime state into driver-usable continuation state
- encode updated continuation state back into persisted form

The codec layer is what makes runtime-native payloads legal to persist without leaking their structure upward.

### 5. InteractiveChatSession

Interactive lifecycle is not a router concern.

Interactive chat must be handled by runtime-owned session objects, such as:

- `CodexInteractiveSession`
- `ClaudeInteractiveSession`

These session objects own:

- attach
- send
- interrupt
- detach
- snapshot
- interactive continuation updates

They do not own app-level file schema design.

## State Model

### App-Level State

App-level state must not contain:

- top-level `sessionId`
- `resumeState`
- runtime-specific native handle fields

The app-level state for a chat may contain only app-neutral runtime activity fields such as:

- `executionMode`
- `running`
- `lastError`
- `attachmentState`
- `attachmentGeneration`
- `activeTurnId`
- `lastMeaningfulActivityAt`

The app-level state for tasks and workflows must remain app-owned and runtime-neutral.

### Persisted Runtime Conversation Envelope

Persisted runtime continuation state must use an opaque envelope such as:

- `runtimeId`
- `codecVersion`
- `payload`

Rules:

- `payload` is opaque outside the owning codec
- the envelope does not appear under legacy names like `resumeState`
- upper layers may store and replace the envelope, but may not inspect its fields

### Persistence Scope

Current product persistence rules:

- chats may persist runtime conversation envelopes
- tasks do not persist runtime conversation envelopes
- workflows do not persist runtime conversation envelopes in this reset
- configured-agent tests do not persist runtime conversation envelopes
- cleanup never persists runtime conversation envelopes

This is a current product rule, not a permanent architecture prohibition.

If future product policy enables persisted workflow continuation, it must do so by reusing the same explicit request/driver/codec boundary rather than by reintroducing upper-layer runtime-native fields.

## Restore And Continuation Rules

### Restore

Restore means reading app-owned state and any opaque runtime conversation envelope from disk.

Rules:

- only the new schema is legal
- if the schema on disk is not the new schema, the entire persisted state is discarded
- no partial salvage
- no legacy migration
- no best-effort fallback

### Resume

Resume means reusing a previously persisted runtime conversation envelope in a new request.

Rules:

- both `oneshot` and `interactive` requests may use resume behavior
- resume behavior is controlled by explicit `continuationPolicy`
- `resume-required` must fail when no usable runtime conversation envelope exists
- `resume-preferred` may start fresh only when no usable runtime conversation envelope exists
- no layer may silently reinterpret `resume-required` as `resume-preferred`

### Interactive Restore Behavior

When an interactive chat is restored after app restart:

- its app-level attachment state must be `detached`
- it must not eagerly reattach on boot
- ephemeral in-flight fields must not be restored as running state
- the next user action may trigger reattach through the driver/session layer

## Current Runtime Expectations

### Claude

Claude must continue to use the official Claude Agent SDK:

- one-shot uses the SDK single-message path
- interactive uses the SDK streaming-input path

This reset must not reintroduce:

- legacy transport selectors
- CLI-wrapper-as-SDK framing
- transitional `stream-json` / `runner` compatibility targets

### Codex

Codex continues to use its own runtime-specific driver and interactive session implementation, but its native continuation state must remain hidden behind codec/session boundaries.

### API

API remains a one-shot runtime in current product policy unless and until a future spec expands its supported modes.

Even so, it must still fit the same explicit request contract:

- explicit `runtimeId`
- explicit `executionMode`
- explicit `continuationPolicy`
- explicit `runtimeConfig`

## Strict Removal Requirements

The implementation of this design must delete, not preserve under new names:

- legacy state migration helpers
- malformed-state fallback compatibility behavior
- top-level app `sessionId` usage
- app-level `resumeState`
- runtime-specific restore logic in `AgentHub`
- legacy Claude compatibility selectors

Tests that currently lock old compatibility behavior as correct must be deleted or rewritten.

## Testing Requirements

The implementation must prove all of the following:

### Type And Search Proof

- app-level types no longer expose top-level `sessionId`
- app-level types no longer expose `resumeState`
- `AgentHub` no longer parses runtime-native payload structure
- code search shows legacy runtime migration helpers removed

### Restore Proof

- loading a legacy persistence schema discards the entire persisted state and initializes a clean new state
- no legacy runtime session state is migrated
- restored interactive chats come back `detached`

### Request Model Proof

- `runtimeId`, `executionMode`, `continuationPolicy`, and `runtimeConfig.model` flow from upper layer into runtime requests
- unsupported combinations fail explicitly
- router does not silently downgrade mode or continuation behavior

### Runtime Proof

- Claude one-shot uses the official SDK single-message path
- Claude interactive uses the official SDK streaming-input path
- oneshot requests may resume only through explicit continuation policy and usable runtime conversation state
- current workflow/task/test/cleanup defaults remain one-shot

### Startup Proof

- after the refactor, the project still launches successfully through the real development startup path

## Failure Conditions

The implementation is incomplete if any of the following remain true:

- `AgentHub` still contains runtime-specific restore or migration logic
- app-level state still exposes top-level `sessionId`
- app-level state still exposes `resumeState`
- old schemas are migrated, partially recovered, or best-effort parsed
- router interprets runtime-native payload fields directly
- unsupported mode or continuation requests are silently downgraded
- legacy env selectors still influence runtime selection or execution mode
- tests still treat legacy migration behavior as correct target behavior
- docs still describe compatibility with old runtime state or old Claude transport logic as a goal

## Definition Of Done

This design is implemented only when all of the following are true:

- the request model makes `runtimeId`, `executionMode`, `continuationPolicy`, and `runtimeConfig.model` explicit
- `AgentHub` is reduced to app-level orchestration and no longer models runtime-native continuation semantics
- router, driver, codec, and interactive session responsibilities are separated according to this design
- top-level app `sessionId` and `resumeState` are removed
- old persistence schemas are discarded without migration
- Claude continues to use the official SDK for both one-shot and interactive paths
- tests, code search, typecheck, and real startup verification all prove the strict abstraction boundary

## Files This Design Intends To Guide

- `src/main/agent-hub.ts`
- `src/main/agent-executor.ts`
- `src/main/agents/runtime-driver.ts`
- new router and codec files under `src/main/agents/`
- `src/main/agents/codex-interactive-session.ts`
- `src/main/agents/claude-interactive-session.ts`
- runtime request and app-state types under `src/shared/`
- canonical runtime docs under `docs/`

## Superseded Direction

This design supersedes any branch-local direction that still assumes:

- app-level `sessionId` as a generic cross-runtime abstraction
- `AgentHub` as the place where runtime-native continuation payloads are interpreted
- compatibility with old persisted runtime state
- legacy Claude transport compatibility as part of the target runtime architecture
