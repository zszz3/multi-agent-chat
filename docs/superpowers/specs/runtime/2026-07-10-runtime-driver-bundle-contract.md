# Runtime Driver Bundle Contract

## 2026-07-10

### Status

Proposed on 2026-07-10.

This file defines what belongs inside a runtime-local bundle.

### Purpose

A runtime bundle is the unit of ownership for one runtime.

Its job is to keep runtime-specific behavior cohesive so that the rest of the repository does not need to know how that runtime actually works.

## Required Entry Point

Each runtime bundle must expose one stable builder entry:

```ts
export function createXxxDriver(
  options: RuntimeAgentExecutorFactoryOptions,
): RuntimeDriver
```

This builder is the only thing the central registration layer should need.

## Minimum Bundle Contents

Every runtime bundle must own:

- the builder entry
- the runtime's one-shot executor, if the runtime supports one-shot execution

## Optional Bundle Contents

A runtime bundle may also own:

- an interactive session implementation
- a workflow execution helper
- a channel-test helper
- a cleanup helper
- a runtime conversation codec
- runtime-local detection or environment helpers

Optional means optional.

The contract does not require runtimes to implement surfaces they do not actually support.

## Ownership Rules

Runtime-local code should answer questions like:

- how this runtime launches
- how this runtime streams events
- how this runtime resumes or refuses to resume
- how this runtime tests a channel
- how this runtime cleans up persistent artifacts

Shared layers should not answer those questions on behalf of a runtime.

## Naming Guidance

The repository should prefer runtime-local names shaped like:

- `create-hermes-driver.ts`
- `hermes-executor.ts`
- `hermes-session.ts`
- `hermes-workflow.ts`
- `hermes-test.ts`
- `hermes-cleanup.ts`
- `hermes-runtime-state-codec.ts`

Exact file names may vary if the same ownership boundary is preserved.

## Cross-Runtime Imports

Runtime bundles may import shared abstractions.

They should not import another runtime's local implementation classes as a shortcut for "almost the same" behavior.

Examples:

- Good: Hermes and OpenClaw both import a shared `spawnCli` helper
- Bad: OpenClaw reuses a Hermes session class because both happen to be CLI-driven today

## Incremental Migration Rule

If an existing runtime is still partially assembled in a central file, new work should carve out a runtime-local bundle instead of adding more local complexity to the central file.

The contract does not require a directory migration before useful progress can happen, but it does require the direction of travel to be toward runtime-local ownership.

## Acceptance Criteria

This contract is satisfied only if:

- each runtime has one builder entry
- runtime-local implementation responsibilities live behind that builder
- optional surfaces are implemented only where capability evidence justifies them
- shared layers do not directly own runtime-local behavior
