# Runtime Adapter Refactor Plan

Date: 2026-07-03
Branch: `feat/claude-interactive-runtime`
Status: Phases 1 to 4 completed in the working tree
Scope: unify `codex`, `claude`, and `api` runtime startup behind one main-process adapter entry

## Goal

Create one shared main-process adapter layer so chat, task, workflow-agent, and runtime-test startup all dispatch through the same runtime registry instead of duplicating `codex` / `claude` / `api` branches in multiple places.

This is a structural refactor. The runtime behaviors and protocols should stay the same during the first phases:

- `codex` still uses `CodexRpcClient`
- `claude` still uses `ClaudeRunner`
- `api` still uses HTTP `fetch`

## Current State

### Already centralized

- `chat`, `task`, `workflow agent`, and `runtime test` execution now go through `RuntimeAgentExecutorFactory` plus the shared registry in `src/main/runtime-adapter.ts`.

### Intentionally separate concerns

- Runtime detection and one-shot CLI probes stay outside the adapter registry by design.
- Runtime extension guidance and adapter-focused error-path coverage now live with this plan and `src/main/runtime-adapter.test.ts`.

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

### Delivery

- Implemented in commit `854a4ef` (`重构: 统一 chat task 运行时适配入口`)
- Pushed to `origin/feat/claude-interactive-runtime`
- Files added for Phase 1:
  - `src/main/runtime-adapter.ts`
  - `src/main/runtime-adapter.test.ts`
- Main bridge updated in:
  - `src/main/agent-executor.ts`

## Phase 2

### Goal

Move workflow-agent startup to the same adapter registry.

### Todo

- [x] Replace `askCodexWorkflowAgent(...)`, `askClaudeWorkflowAgent(...)`, and `askApiWorkflowAgent(...)` call-site branching with one registry dispatch
- [x] Keep workflow idle-timeout and event forwarding semantics intact
- [x] Move shared workflow runtime glue into adapter-owned helpers where duplication exists

### Acceptance Criteria

- `AgentHub.askWorkflowAgent(...)` resolves the runtime once and then calls the adapter registry
- Workflow events still emit the same `delta`, `completed`, and `error` shapes
- Codex workflow session resume behavior is preserved
- Claude workflow session resume behavior is preserved
- API workflow requests still honor the selected model and provider request shape

### Validation

- `npm run typecheck`
- `vitest run src/main/runtime-adapter.test.ts src/main/agent-hub.test.ts`

## Phase 3

### Goal

Move runtime/config test execution to the same adapter registry.

### Todo

- [x] Replace `testCodexAgent(...)`, `testClaudeAgent(...)`, and `testApiAgent(...)` dispatch branching with one registry dispatch
- [x] Move shared request and response shaping out of `AgentHub` where appropriate
- [x] Keep test-session cleanup behavior unchanged for Codex and Claude

### Acceptance Criteria

- Runtime test flows for `codex`, `claude`, and `api` still produce the same user-visible result shapes
- Existing cleanup behavior for temporary Codex and Claude test sessions is preserved
- API runtime tests still use the selected model and provider-specific request body
- `AgentHub` no longer owns three separate runtime-test launch implementations

### Validation

- `npm run typecheck`
- `vitest run src/main/runtime-adapter.test.ts src/main/agent-hub.test.ts`

## Phase 4

### Goal

Reduce remaining launch duplication and make future runtime expansion cheaper.

### Todo

- [x] Extract shared request helpers that are still duplicated after Phases 1 to 3
- [x] Review whether runtime detection and one-shot CLI probes should reuse the same registry or stay separate
- [x] Add adapter-focused tests for registry dispatch and error handling
- [x] Document the extension pattern for adding a new runtime

### Acceptance Criteria

- Adding a new runtime only requires one adapter implementation plus registry wiring
- `AgentHub` remains a business-orchestration layer rather than a runtime-launch layer
- Runtime-specific code is discoverable from one main entry instead of scattered across `AgentHub`

### Decision: Keep Detect And Probes Separate

`detectAgentRuntimes()` and one-shot probes such as `detectCodexModels()` stay outside the runtime adapter registry.

Reasoning:

- The adapter registry owns startable execution flows with prompts, sessions, event streams, and stop semantics.
- Runtime detection is a short availability check (`--version`) rather than an agent run.
- One-shot model or config probes are management-time utilities, not user-visible chat/task/workflow execution.
- Keeping probes separate avoids overloading `RuntimeAdapter` with lifecycle-free helper calls that do not share execution semantics.

### Extension Pattern

To add a new runtime:

1. Add the runtime identity in shared types and any preset/model metadata it needs.
2. Add a runtime-specific helper module under `src/main/agents/` only if the adapter needs custom env, CLI, or protocol glue.
3. Implement the runtime inside `src/main/runtime-adapter.ts` by supporting:
   - `createExecutor(...)`
   - `runWorkflow(...)`
   - `testAgent(...)`
4. Register the adapter in `createRuntimeAdapterRegistry(...)`.
5. Add focused coverage in `src/main/runtime-adapter.test.ts` plus any runtime-specific helper tests.
6. Only extend runtime detection or one-shot probe utilities if the new runtime actually needs machine-local availability checks or setup discovery.

### Validation

- `npm run typecheck`
- `vitest run src/main/runtime-adapter.test.ts src/main/agent-hub.test.ts src/main/agents/detect.test.ts src/main/agents/claude-runner.test.ts src/main/agents/codex-rpc.test.ts`

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
