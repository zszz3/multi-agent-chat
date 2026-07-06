# Claude Interactive Runtime Design

## 2026-07-07

### Goal

Define one fresh-agent-ready source of truth for Claude interactive chat in this repository. This document consolidates the intent that was previously split across:

- `docs/superpowers/plans/2026-07-06-claude-sdk-interactive-transport.md`
- `docs/superpowers/plans/2026-07-06-claude-approval-user-input-events.md`
- `docs/superpowers/plans/2026-07-06-interactive-session-reconfigure.md`

The main purpose is to remove ambiguity between:

- what the branch already landed
- what the branch only claimed in docs
- what the Claude interactive runtime must still become before it can be called complete

### Audience And Usage

- Audience: fresh implementation agents with no prior chat context
- Primary use: any work that changes Claude interactive chat behavior, capability claims, persistence, or runtime docs on `feat/claude-interactive-runtime`
- Source-of-truth rule:
  - current checkout wins for present-tense status
  - this spec wins for target architecture and definition of done
- If an older doc says Claude is already "SDK-backed" but the code still launches the CLI, treat that older doc as stale and fix either the code or the doc before closing work

### Source Materials

- `docs/superpowers/specs/2026-07-04-runtime-execution-architecture-design.md`
- `docs/superpowers/plans/2026-07-06-claude-sdk-interactive-transport.md`
- `docs/superpowers/plans/2026-07-06-claude-approval-user-input-events.md`
- `docs/superpowers/plans/2026-07-06-interactive-session-reconfigure.md`
- `docs/architecture-overview.md`

### Scope

This spec covers:

- Claude chat execution in the Electron main process
- the shared Claude interactive-session boundary
- package-backed `stream-json` versus `runner` compatibility transport selection, with `sdk` reserved for a future official programmatic backend
- persisted Claude resume metadata
- structured approval and user-input event lifecycles
- interactive-session reconfigure behavior
- truthful capability claims and docs status

### Non-Goals

This spec does not:

- make Claude task, workflow, or runtime-test execution interactive
- make PTY the default Claude backend
- design approval submission UI or user-input reply UI
- redesign Codex or API runtime semantics beyond shared contract alignment
- turn history reconstruction into a hidden substitute for native resume

## Current Branch Truth

### Landed Foundations

The branch already has the following major pieces in place:

- `ClaudeInteractiveSession` exists as the shared Claude chat session boundary
- Claude now uses a dedicated transport contract instead of hard-wiring all behavior into one session class
- `ClaudeStreamJsonInteractiveTransport` exists as the default package-backed `stream-json` compatibility transport
- `ClaudeRunnerInteractiveTransport` exists as the more conservative compatibility fallback
- `claude-transport-selection.ts` centralizes backend selection and advertised resume capabilities
- `claude-stream-json-bindings.ts` and `claude-stream-json-events.ts` own the current package-backed stream-json glue
- `AgentEvent` and `ChatEvent` already include structured approval and user-input lifecycle variants
- `AgentHub` persists approval and user-input request events and expires abandoned live requests on stop or restore
- `chat-event-display.tsx` renders pending and expired approval or input requests honestly
- interactive reconfigure is already classified through `session-reconfigure.ts`
- per-chat `channelId` overrides already exist
- `InteractiveSessionManager` already serializes `reconfigure(...)` through the same per-chat queue used for prompt dispatch

### Current Truth After The Transport-Renaming Cleanup

The branch now uses truthful transport names, but it still does not have a verified official programmatic Claude SDK backend.

What is true right now:

- the branch installs `@anthropic-ai/claude-code`
- the default Claude selection path is `stream-json`
- `ClaudeStreamJsonInteractiveTransport` is the default backend
- `CLAUDE_INTERACTIVE_TRANSPORT=runner` selects `ClaudeRunnerInteractiveTransport`
- explicit `CLAUDE_INTERACTIVE_TRANSPORT=sdk` requests fail with "Official Claude programmatic SDK transport is not implemented for the installed package surface."

What is also true right now:

- `src/main/agents/claude-stream-json-bindings.ts` still launches the package-provided `claude` binary
- the default bindings still assemble CLI flags such as `--print` and `--output-format stream-json`
- the checked-in package-surface artifact shows `exports: (none)`, `main: (none)`, and `verified programmatic export surface: not verified`

Therefore this branch must currently be described as "default Claude interactive uses the official package-backed `stream-json` compatibility transport," not as "truly SDK-backed" in the strict programmatic sense intended by the 2026-07-06 transport plan.

### Important Partial Successes

Even though the transport goal is not fully met, several important contract changes are real and should be preserved:

- `ClaudeInteractiveSession` now passes a full Claude `resumeState` envelope into transport startup instead of only forwarding a flat `sessionId`
- approval and user-input events already flow through the shared event model
- pending interaction requests already downgrade to expired on boundary loss
- running turns already stage attach-boundary reconfigure changes instead of mutating the live turn in place

## Problem Statement

Claude interactive work now sits in an awkward middle state:

- the shared session boundary, event model, and reconfigure model largely match the intended architecture
- the transport naming is now truthful, but some docs still overstate the current backend as an official SDK integration
- the actual default bindings layer still shells out through the Claude package's `stream-json` CLI surface

That mismatch matters because it breaks three guarantees:

1. capability claims are no longer obviously trustworthy
2. future agents can wrongly assume the official SDK integration problem is solved
3. docs can claim stronger native resume semantics than the actual backend really proves

This spec resolves that by making the required end state explicit and by separating landed shared-session work from the still-open transport gap.

## Required End State

The broader future official-programmatic-SDK goal is complete only when all of the following are true:

- the product-facing Claude chat path is `interactive`
- the default Claude interactive backend is a true official SDK-backed transport
- the current package-backed `stream-json` transport has either been replaced by that verified SDK backend or has been explicitly kept as a documented compatibility path
- `runner` remains available only as an explicit compatibility fallback
- `AgentHub` does not gain new top-level Claude branches to support backend selection
- `ClaudeInteractiveSession` preserves and forwards the full Claude resume envelope honestly
- resume capability claims shown to the app match the selected backend truthfully
- approval and user-input events remain shared `AgentEvent` values, persist durably, and expire honestly on boundary loss
- attach-boundary reconfigure changes remain staged until the running turn finishes or the session detaches
- English architecture docs stop claiming Claude is SDK-backed before the bindings layer really is

## Architecture

### Layering

The Claude runtime path must stay split into four responsibilities:

1. `AgentHub`
   - owns chat state, persistence, event application, and renderer-visible truth
   - must not own transport-selection branching
2. `ClaudeInteractiveSession`
   - owns lazy attach, turn lifecycle, attachment state, stale-event rejection, and session snapshotting
   - must remain the only product-facing Claude interactive session abstraction
3. Claude transport layer
   - owns backend selection between the package-backed `stream-json` default, the `runner` fallback, and any future official programmatic SDK implementation
   - must expose one shared transport contract to the session
4. Claude bindings and event adapters
   - own raw `stream-json`, `runner`, or future official SDK protocol glue
   - normalize backend-specific events into the shared event surface

### Default Implementation Targets

The repo should continue to converge around these files and responsibilities:

- `src/main/agents/claude-interactive-session.ts`
- `src/main/agents/claude-interactive-transport.ts`
- `src/main/agents/claude-stream-json-interactive-transport.ts`
- `src/main/agents/claude-runner-interactive-transport.ts`
- `src/main/agents/claude-stream-json-bindings.ts`
- `src/main/agents/claude-stream-json-events.ts`
- `src/main/agents/claude-transport-selection.ts`
- `src/main/agents/session-reconfigure.ts`
- `src/main/agent-hub.ts`
- `src/shared/types.ts`

### Transport Contract

The shared transport contract must remain small and Claude-specific:

- current transport kinds: `"stream-json"` and `"runner"`
- `startTurn(...)`
- `interrupt()`
- `detach()`

The transport input must include:

- prompt
- cwd
- model
- full Claude `resumeState` when one exists
- one shared `onEvent(...)` callback

This contract already exists and should remain the session boundary even if the internal SDK adapter changes.

On this branch, `sdk` is a reserved future selector, not a current transport kind. Explicitly requesting it must fail until a real official programmatic backend exists.

### Future SDK-Backed Means A Real Programmatic API

For this repo, a Claude backend only counts as "SDK-backed" if:

- the backend imports an official Claude package API at runtime
- turn execution is driven through that imported programmatic API
- event streaming comes from that API rather than from parsing CLI stdout intended for a shell user

The following do not count as SDK-backed:

- depending on `@anthropic-ai/claude-code` but never importing its programmatic surface
- spawning the `claude` binary that ships inside the package
- wrapping CLI JSON output in `claude-stream-json-bindings.ts`

If the currently installed official package does not expose a verified programmatic API, then the branch must not claim the SDK goal is complete. In that case the work remains blocked on one of these outcomes:

- a verified official export from the same package
- a verified official successor package
- an explicit product decision to keep the package-backed compatibility transport as the default and update the docs accordingly

### Package Surface Verification Rule

Before claiming completion, the branch must keep a checked-in artifact that shows the official package surface it actually depends on.

That artifact must answer:

- which package name and version were inspected
- which `type`, `bin.claude`, `main`, and `exports` fields were found
- whether a verified programmatic export surface is `present` or `not verified`
- which `files[]` entries the package declares
- which top-level files are actually present

If a future official programmatic SDK backend lands, the artifact must also identify the exact verified export the bindings layer calls. Until then, the artifact must make the absence of a verified programmatic export surface explicit instead of implying that one exists.

### Runner Compatibility Transport

The `runner` transport remains valid only as a compatibility path behind the same session contract.

Rules:

- it must be selected only by an explicit override such as `CLAUDE_INTERACTIVE_TRANSPORT=runner`
- the legacy `cli` selector must stay rejected with guidance to use `runner` instead
- it must not be described as the preferred default while the package-backed `stream-json` transport remains the branch default
- its resume capability claims must stay conservative
- it may continue to use `ClaudeRunner` and CLI `--resume <sessionId>` semantics

### Capability Truthfulness

Transport selection and resume capability claims must stay in one place.

Required behavior:

- package-backed `stream-json` default path:
  - `supportsInProcessConversationResume: true`
  - `supportsResumeAfterDetach: true`
  - `supportsResumeAfterAppRestart: true`
- `runner` compatibility path:
  - `supportsInProcessConversationResume: true`
  - `supportsResumeAfterDetach: false`
  - `supportsResumeAfterAppRestart: false`
- reserved future `sdk` path:
  - must not be selectable until a verified official programmatic backend exists
  - once implemented, its resume claims must reflect its actual behavior rather than inheriting the `stream-json` defaults

The repo must not advertise stronger resume support just because the package comes from an official source or because a future selector is named `sdk`.

### Resume Metadata Model

Claude resume data is not a flat string. The transport boundary must preserve the richer Claude envelope:

- `runtimeId: "claude"`
- `native.sessionId`
- `native.projectKey` when known
- `native.subpaths` when known
- `appContext.cwd`
- `appContext.modelId`
- `appContext.claudeConfigDir` when known
- `appContext.sessionStoreRef` when known

Rules:

- `ClaudeInteractiveSession` must pass the full envelope into `startTurn(...)`
- the bindings layer must forward the transport-relevant parts into the selected backend
- if the runtime emits richer resume metadata later, the session must persist it
- the runtime must not silently discard still-valid `projectKey` or `subpaths` metadata without an explicit invalidation reason

### Event Model

Claude backend-specific signals must be normalized in two stages:

1. raw backend event -> stable Claude transport-event union (currently `ClaudeStreamJsonEvent` for the default backend)
2. stable Claude event -> shared `AgentEvent`

The rest of the app must only depend on shared events such as:

- `session`
- `delta`
- `completed`
- `error`
- `approval_request`
- `approval_response`
- `user_input_request`
- `user_input_response`

`AgentHub` remains the only place that mutates persisted chat history in response to those events.

### Approval And User-Input Lifecycle Rules

The existing structured interaction event model should remain intact and is part of the target architecture.

Required behavior:

- request events are persisted with `requestState: "live"`
- matching response events resolve the corresponding live request
- unresolved live requests downgrade to `expired` on stop, detach, or app restart
- the renderer labels pending versus expired requests explicitly

This spec does not require building the UI that sends responses back into Claude. It only requires honest surfacing and persistence.

### Reconfigure Model

Interactive reconfigure remains a shared-session concern, not a transport-specific hack.

The planner must continue to classify changes as:

- hot-safe
- attach-boundary
- identity-breaking

Rules:

- hot-safe changes may apply immediately
- attach-boundary changes must stage for the next attach when a turn is still running
- identity-breaking changes must invalidate native resume assumptions conservatively
- runtime-family changes must recreate or reset the session rather than pretending continuity survived

### Per-Chat Channel Overrides

Claude chat state may persist a per-chat `channelId` override, but the session must still resolve runtime identity through the configured agent plus the validated channel override.

Rules:

- same-runtime channel changes are allowed after a chat has started
- runtime-family changes go through configured-agent switching, not through arbitrary channel mutation
- invalid channel overrides must be normalized away on restore

## Behavioral Rules

### Lazy Attach

- opening, listing, or restoring a Claude chat must not spawn a child process
- `sendPrompt(...)` or `continue(...)` performs the first lazy attach
- after idle reclaim or app restart, the next execution-triggering action performs the next attach or resume attempt

### Attachment States

Claude interactive sessions must keep the shared vocabulary:

- `detached`
- `idle`
- `running`
- `interrupted`

The central idle sweeper may only detach Claude sessions that are:

- `idle` or `interrupted`
- older than one hour by `lastMeaningfulActivityAt`

Probe traffic must not refresh that timestamp.

### Stale Event Rejection

Late events must be rejected when:

- the attachment generation no longer matches
- the turn id no longer matches for turn-scoped events

This behavior is already part of the session layer and must be preserved.

### Restart Semantics

After app restart:

- every Claude interactive session restores as `detached`
- no in-memory attachment state is trusted
- pending requests that were still live become expired
- resume attempts remain lazy and execution-triggered

### History-Based Continuation Honesty

If the selected Claude backend cannot perform real native resume for a given boundary loss, the app may fall back to product-owned continuation rules only when that fallback is explicitly the intended path.

It must not:

- call that native resume
- pretend a live SDK or CLI turn survived restart
- treat abandoned pending requests as resolved

## Recommended Completion Order

This repo no longer needs one brand-new Claude architecture build. It needs a clean convergence pass.

### Slice 1: Correct The Transport Truth Boundary

- keep the shared transport seam
- keep the package-backed `stream-json` compatibility transport as the truthful default
- keep the `runner` compatibility transport
- keep `sdk` reserved for a future official programmatic integration
- if no verified programmatic API exists yet, downgrade the docs and default-transport claims instead of papering over the gap

### Slice 2: Preserve Full Claude Resume Semantics

- keep forwarding the full resume envelope into the transport
- stop truncating useful Claude-native metadata when the backend can provide or preserve it
- ensure capability claims stay conservative until native resume proof is real

### Slice 3: Keep Structured Interaction Events Stable

- preserve the shared approval and user-input event model
- keep lifecycle persistence in `AgentHub`
- keep expired-versus-live renderer labels honest

### Slice 4: Keep Reconfigure Conservative

- preserve queued `reconfigure(...)`
- preserve staged attach-boundary changes
- preserve explicit invalidation of resume state when identity changes

### Slice 5: Sync All Docs To Verified Reality

- update English docs
- update zh-CN docs
- update architecture overview
- remove any statement that claims Claude is SDK-backed before the bindings layer really is

## Scope Guardrails

- Do not widen this slice into PTY terminal emulation work
- Do not add new top-level Claude branches in `AgentHub`
- Do not weaken request-lifecycle honesty for the sake of smoother UI
- Do not advertise resume-after-detach or resume-after-restart support on the `runner` compatibility path
- Do not call a package-backed CLI wrapper "SDK-backed"
- Do not repurpose the reserved `sdk` selector for the current `stream-json` transport
- Do not silently retry the same user prompt across two Claude backends after one backend already streamed partial turn output

## Verification

Minimum verification for this spec:

- `npm run typecheck`
- `npm test -- src/main/agents/claude-transport-selection.test.ts src/main/agents/claude-stream-json-events.test.ts src/main/agents/claude-stream-json-interactive-transport.test.ts src/main/agents/claude-interactive-session.test.ts src/main/agent-hub.test.ts src/main/agents/session-reconfigure.test.ts src/main/agents/interactive-session-manager.test.ts src/renderer/src/pages/chat/chat-event-display.test.tsx src/main/agents/claude-runner.test.ts src/main/agents/claude-stream.test.ts`

Critical proof points:

- restoring or viewing a Claude chat does not eagerly spawn a process
- the first prompt lazily attaches a backend
- the session passes the full Claude resume envelope into transport startup
- the selected backend's advertised resume capabilities match reality
- explicit `CLAUDE_INTERACTIVE_TRANSPORT=sdk` requests fail honestly until a verified official programmatic backend exists
- approval and user-input events are normalized, persisted, and expired honestly
- running-turn reconfigure changes stage instead of mutating the live turn
- idle detach and stale-event rejection still work after the stream-json and runner truth-sync changes

## Definition Of Done

The current docs-and-artifact truth-sync slice is done only when:

- the default Claude chat backend is described truthfully as the package-backed `stream-json` compatibility transport
- the `runner` transport remains available only as an explicit compatibility fallback
- explicit `sdk` selection fails honestly and is documented as future-only
- docs no longer overstate SDK completion before the code proves it
- `ClaudeInteractiveSession` forwards and preserves full Claude resume metadata honestly
- transport selection and resume capability claims are truthful
- approval and user-input lifecycle handling remains durable and honest
- reconfigure behavior remains staged and conservative
- the focused verification set passes

The broader future official-programmatic-SDK goal is done only when the default Claude chat backend is truly official SDK-backed on this branch and the checked-in package-surface artifact identifies the exact verified export the bindings layer calls.

## Open Questions

- Which exact official Claude package export should this repo treat as the supported programmatic entry point?
- If the currently installed package exposes no usable programmatic API, should the repo switch to another official package or temporarily downgrade its default-backend claim?
- When Claude emits only a fresh `sessionId` and not richer metadata, should the session preserve previously known `projectKey` and `subpaths` until explicitly invalidated?
