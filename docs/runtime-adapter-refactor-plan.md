# Runtime Adapter Refactor Plan

Date: 2026-07-02
Branch: `feat/claude-interactive-runtime`
Status: Phase 1 completed on this branch; Phases 2 to 4 planned
Scope: unify `codex`, `claude`, and `api` runtime startup behind one main-process adapter entry

## Goal

Create one shared main-process adapter layer so chat, task, workflow-agent, and runtime-test startup all dispatch through the same runtime registry instead of duplicating `codex` / `claude` / `api` branches in multiple places.

This is a structural refactor. The runtime behaviors and protocols should stay the same during the first phases:

- `codex` still uses `CodexRpcClient`
- `claude` still uses `ClaudeRunner`
- `api` still uses HTTP `fetch`

## Current State

### Already centralized

- `chat` and `task` execution now go through `RuntimeAgentExecutorFactory` backed by the shared registry in `src/main/runtime-adapter.ts`.

### Still duplicated

- `workflow agent` dispatch is still split inside `AgentHub.askWorkflowAgent(...)`.
- `runtime test` dispatch is still split across `testCodexAgent(...)`, `testClaudeAgent(...)`, and `testApiAgent(...)`.
- Some API request and response shaping logic is duplicated between workflow and test paths.

## Design Direction

Add a shared adapter registry in `src/main/runtime-adapter.ts` and move runtime-specific startup behavior behind a common interface.

Suggested adapter surface:

- `createExecutor(...)`: create a startable and stoppable executor for chat and task runs
- `runWorkflow(...)`: run a workflow-agent request for the selected runtime
- `testAgent(...)`: run the runtime/config test flow for the selected runtime

Suggested supporting pieces:

- `RuntimeAdapter`
- `RuntimeAdapterRegistry`
- `RuntimeExecutorContext`
- `RuntimeWorkflowContext`
- `RuntimeAgentTestContext`

`AgentHub` should keep runtime resolution, validation, and state mutation. Runtime-specific launch details should move into the adapter layer.

## Non-Goals

- No PTY work in this refactor
- No Claude protocol redesign
- No Codex app-server protocol changes
- No API provider feature expansion
- No renderer behavior change except what is required by preserved runtime semantics

## Phase Plan

## Phase 1

### Goal

Introduce the shared runtime adapter registry and route `chat` and `task` execution through it without changing behavior.

### Todo

- [x] Add `src/main/runtime-adapter.ts`
- [x] Define the shared adapter interfaces and registry
- [x] Implement `codex`, `claude`, and `api` adapters by wrapping the existing low-level launchers
- [x] Refactor `RuntimeAgentExecutorFactory` into a thin bridge over the registry
- [x] Keep existing `CodexRpcClient`, `ClaudeRunner`, and API `fetch` internals unchanged

### Acceptance Criteria

- Chat and task runs still behave exactly as before for all three runtimes
- `AgentHub.runChat(...)` no longer needs runtime-specific launch knowledge
- `RuntimeAgentExecutorFactory` stops branching on `codex` / `claude` / `api` launch details directly
- Existing focused chat execution tests still pass

### Validation

- `npm run typecheck`
- `vitest run src/main/runtime-adapter.test.ts src/main/agents/claude-runner.test.ts src/main/agents/codex-rpc.test.ts`

## Phase 2

### Goal

Move workflow-agent startup to the same adapter registry.

### Todo

- [ ] Replace `askCodexWorkflowAgent(...)`, `askClaudeWorkflowAgent(...)`, and `askApiWorkflowAgent(...)` call-site branching with one registry dispatch
- [ ] Keep workflow idle-timeout and event forwarding semantics intact
- [ ] Move shared workflow runtime glue into adapter-owned helpers where duplication exists

### Acceptance Criteria

- `AgentHub.askWorkflowAgent(...)` resolves the runtime once and then calls the adapter registry
- Workflow events still emit the same `delta`, `completed`, and `error` shapes
- Codex workflow session resume behavior is preserved
- Claude workflow session resume behavior is preserved
- API workflow requests still honor the selected model and provider request shape

## Phase 3

### Goal

Move runtime/config test execution to the same adapter registry.

### Todo

- [ ] Replace `testCodexAgent(...)`, `testClaudeAgent(...)`, and `testApiAgent(...)` dispatch branching with one registry dispatch
- [ ] Move shared request and response shaping out of `AgentHub` where appropriate
- [ ] Keep test-session cleanup behavior unchanged for Codex and Claude

### Acceptance Criteria

- Runtime test flows for `codex`, `claude`, and `api` still produce the same user-visible result shapes
- Existing cleanup behavior for temporary Codex and Claude test sessions is preserved
- API runtime tests still use the selected model and provider-specific request body
- `AgentHub` no longer owns three separate runtime-test launch implementations

## Phase 4

### Goal

Reduce remaining launch duplication and make future runtime expansion cheaper.

### Todo

- [ ] Extract shared request helpers that are still duplicated after Phases 1 to 3
- [ ] Review whether runtime detection and one-shot CLI probes should reuse the same registry or stay separate
- [ ] Add adapter-focused tests for registry dispatch and error handling
- [ ] Document the extension pattern for adding a new runtime

### Acceptance Criteria

- Adding a new runtime only requires one adapter implementation plus registry wiring
- `AgentHub` remains a business-orchestration layer rather than a runtime-launch layer
- Runtime-specific code is discoverable from one main entry instead of scattered across `AgentHub`

## Implementation Order

Recommended order:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4

This keeps the highest-traffic execution path stable first, then moves workflow and testing behind the same abstraction.

## Validation Plan

- `npm run typecheck`
- Focused vitest for:
  - `src/main/agent-hub.test.ts`
  - `src/main/agents/claude-runner.test.ts`
  - `src/main/agents/codex-rpc.test.ts`
  - new adapter-focused tests such as `src/main/runtime-adapter.test.ts`

Known repo note:

- Existing unrelated test failures outside the adapter slice should be treated separately from this refactor.
