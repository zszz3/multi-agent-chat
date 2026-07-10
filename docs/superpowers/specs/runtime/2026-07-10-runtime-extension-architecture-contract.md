# Runtime Extension Architecture Contract

## 2026-07-10

### Status

Implemented on 2026-07-10. Runtime-local builders, capability ownership, onboarding tests, and the Hermes one-shot/interactive bundle satisfy the contract on the current branch.

This file defines the architectural contract for extending the runtime system after the runtime boundary reset landed.

### Purpose

This file answers one question:

How should this repository keep onboarding new runtimes such as Hermes, OpenClaw, and future CLI, SDK, RPC, or API-backed runtimes without reopening product-layer boundaries or regrowing a central integration blob?

This file is not an implementation plan.

### Relationship To Existing Runtime Specs

This contract builds on the already-established runtime boundary reset.

The following prior files remain authoritative for the explicit request contract, router-only routing semantics, codec ownership, and strict upper-layer boundaries:

- `2026-07-08-runtime-boundary-reset-design.md`
- `2026-07-08-runtime-phase-01-request-and-state-reset.md`
- `2026-07-08-runtime-phase-02-router-driver-codec-cutover.md`
- `2026-07-08-runtime-phase-03-runtime-driver-conformance.md`
- `2026-07-08-runtime-phase-04-surface-wiring-and-proof.md`

This file does not replace those documents.

Instead, it adds the next layer of constraints:

- how new runtimes are packaged
- how central registration must stay small
- how runtime capabilities must be declared
- how onboarding proof must be evaluated

### Source Material

This contract is derived from:

- `docs/agent-integration-guide.md`
- current repository runtime architecture and driver registry layout

### This File Is Self-Contained

A fresh agent may use this file plus the current repository state to reason about runtime extension work.

The agent must not assume prior chat history.

## Objective

Keep runtime onboarding sustainable as the repository grows beyond Codex, Claude, API, and the integrated Hermes runtime.

The desired end state is not "one more abstraction layer."

The desired end state is:

- upper-layer product code stays runtime-agnostic
- the registry layer stays small and readable
- each runtime owns its own implementation bundle
- new runtimes enter through one explicit builder function
- capability support is declared, not inferred

## Non-Goals

This contract does not:

- prescribe a one-shot migration plan
- require an immediate directory-wide rewrite
- require every runtime to support interactive execution
- require every runtime to support resume, cleanup, or persistent conversation state
- force future runtimes into the Codex or Claude implementation shape

## Non-Negotiable Constraints

### 1. Business Layers Must Stay Runtime-Agnostic

`AgentHub`, chat orchestration, task orchestration, workflow execution, and team execution must not regain runtime-specific branching.

Upper layers may choose:

- surface
- execution mode
- continuation policy
- runtime config

Upper layers may not encode:

- `if runtimeId === "codex"`
- `if runtimeId === "hermes"`
- `if runtimeId === "openclaw"`

Upper layers also may not silently downgrade unsupported runtime requests into different modes or continuation policies.

### 2. The Central Registry Layer Must Be Minimal

The central runtime registration file may know which drivers exist.

It may not grow into a file that permanently expands runtime-specific implementation details such as:

- transport setup
- workflow execution internals
- session attach/resume logic
- cleanup behavior
- runtime-local codec rules

The target shape is:

```ts
return new RuntimeDriverRegistry([
  createCodexDriver(options),
  createClaudeDriver(options),
  createApiDriver(options),
  createHermesDriver(options),
  createOpenClawDriver(options),
])
```

This file is allowed to aggregate.

It is not allowed to be the long-term home for runtime internals.

### 3. Every Runtime Must Own A Local Bundle

Each runtime must own its own bundle of implementation responsibilities.

At minimum, a runtime bundle must own:

- its driver builder
- its one-shot executor if it supports one-shot execution

Depending on capability, it may also own:

- interactive session implementation
- workflow entrypoint
- channel test
- cleanup
- runtime conversation codec

The important invariant is:

Adding a runtime should look like "add a bundle and register it once," not "edit many central files to thread runtime-specific logic through the system."

### 4. Capability Support Must Be Declared Explicitly

No runtime may rely on implicit capability assumptions based on:

- runtime name
- transport type
- similarity to Codex or Claude
- historical behavior
- accidental behavior of prior implementations

Each runtime must declare:

- supported surfaces
- supported execution modes per surface
- supported continuation policies per surface
- whether it supports interactive sessions
- whether it supports runtime conversation persistence
- whether it supports cleanup
- whether it supports channel testing
- whether it supports interrupt, continue, approval requests, or user input requests

Unsupported combinations must fail explicitly.

## Target Extension Model

### Builder Entry

Every runtime must expose one stable builder entry:

```ts
export function createXxxDriver(
  options: RuntimeAgentExecutorFactoryOptions,
): RuntimeDriver
```

This builder is the single integration seam between central registration and runtime-local implementation.

### Runtime Bundle Ownership

The builder owns runtime-local assembly such as:

- which executor class to use
- whether workflow execution reuses one-shot execution
- whether an interactive session exists
- whether a codec exists
- whether cleanup exists
- whether channel-test support exists

The builder must hide those details from the registry layer.

### Recommended Target Layout

This layout is the architectural target, not an all-at-once rewrite demand:

```text
src/main/hub/runtime/executor/
  agent-executor.ts
  agent-executor-types.ts

  codex/
    create-codex-driver.ts
    codex-executor.ts
    codex-workflow.ts
    codex-cleanup.ts
    codex-session.ts

  claude/
    create-claude-driver.ts
    claude-executor.ts
    claude-workflow.ts
    claude-cleanup.ts
    claude-session.ts

  api/
    create-api-driver.ts
    api-executor.ts

  hermes/
    create-hermes-driver.ts
    hermes-executor.ts
    hermes-workflow.ts
    hermes-test.ts

  openclaw/
    create-openclaw-driver.ts
    openclaw-executor.ts
    openclaw-workflow.ts
    openclaw-session.ts
    openclaw-cleanup.ts
```

Equivalent module grouping is acceptable if the same ownership boundary is preserved.

## Runtime Classification Model

This repository must stop assuming every runtime fits the same shape.

Future runtimes must first be classified by actual capability evidence.

### Type A: Stateless One-Shot Runtime

Characteristics:

- no stable interactive session contract
- no reliable resume identity
- chat, task, and workflow can be modeled as one-shot requests

Typical implementation:

- one-shot executor
- optional workflow helper
- optional channel test
- no interactive session
- no runtime conversation codec

### Type B: Session-Capable Interactive Runtime

Characteristics:

- supports persistent thread or session identity
- supports multi-turn attach/send semantics
- resume meaning is stable enough to persist opaquely

Typical implementation:

- one-shot executor or workflow helper
- interactive session implementation
- runtime conversation codec
- optional cleanup

### Type C: API-Hosted Runtime

Characteristics:

- runtime is reached through HTTP, SSE, RPC gateway, or external service boundary
- the service may still be stateless or session-capable

Typical implementation:

- API executor
- optional API workflow helper
- optional API-backed session layer
- optional codec if session identity exists

Classification must happen before implementation shape is chosen.

## Runtime-Specific Guidance

### Hermes

Hermes should be treated as a lightweight runtime template, not as proof that every future runtime looks like Codex or Claude.

Until upstream support proves otherwise, Hermes should be treated conservatively:

- one-shot first
- channel-test if needed
- no forced interactive support
- no forced runtime conversation persistence
- no fake session semantics

### OpenClaw

OpenClaw must not be forced into a Codex-like or Claude-like shape before capability evidence exists.

Before implementation, answer:

1. Is it CLI, SDK, RPC, or API hosted?
2. Does it support one-shot, interactive, or both?
3. Does it expose stable session identity?
4. Is workflow equivalent to one-shot or distinct?
5. Does it require cleanup?

Only then may its runtime type and bundle shape be selected.

## Acceptance Criteria

This contract is satisfied only if runtime extension work preserves all of the following:

- product layers remain runtime-agnostic
- the central registry layer only aggregates runtime builders
- each runtime owns its own bundle boundary
- capability support is declared explicitly
- unsupported combinations fail explicitly
- future runtime onboarding is guided by runtime classification rather than template copying

## Child Specs

The following child specs define the concrete sub-contracts under this master contract:

1. `2026-07-10-runtime-driver-registration-contract.md`
2. `2026-07-10-runtime-driver-bundle-contract.md`
3. `2026-07-10-runtime-capability-declaration-contract.md`
4. `2026-07-10-runtime-onboarding-validation-contract.md`

These child specs are architectural sub-contracts, not serial implementation phases.
