# Runtime Driver Registration Contract

## 2026-07-10

### Status

Proposed on 2026-07-10.

This file defines what the central runtime registration layer may and may not do.

### Purpose

The repository needs one place where all runtime drivers are registered.

That place must stay small enough to read, stable enough to extend, and narrow enough that adding one more runtime does not require threading transport-specific details through a central file.

## Required Role Of The Central Registration Layer

The central registration layer may:

- import shared runtime executor types
- import the runtime driver registry
- import one builder entry per runtime
- instantiate the registry with those builder entries

It may also keep tiny shared adapter wiring that is genuinely cross-runtime and not runtime-specific.

## Forbidden Responsibilities

The central registration layer must not become the long-term home for:

- runtime-specific subprocess invocation details
- runtime-specific SDK setup
- runtime-specific session attach or resume behavior
- runtime-specific workflow execution details
- runtime-specific cleanup logic
- runtime-specific codec logic

If a line of code exists only because runtime `X` behaves differently than runtime `Y`, that logic belongs in a runtime-local bundle unless it is a shared abstraction extracted for multiple runtimes.

## Required Shape

The desired shape is:

```ts
return new RuntimeDriverRegistry([
  createCodexDriver(options),
  createClaudeDriver(options),
  createApiDriver(options),
  createHermesDriver(options),
  createOpenClawDriver(options),
])
```

Equivalent formatting is acceptable.

The essential invariant is that the registry file remains an aggregator.

## Allowed Shared Dependencies

The central registration layer may depend on:

- shared runtime driver types
- shared registry implementation
- shared environment or channel helpers that are not runtime-owned

It must not depend directly on runtime-local low-level classes such as:

- raw RPC clients
- raw SDK wrappers
- raw session classes
- raw workflow helper implementations

Those must be consumed through runtime-local builders.

## Incremental Migration Rule

Existing code does not need to be moved all at once.

However, new work must move the repository toward the target shape, not away from it.

Examples:

- Good: move `createHermesDriver(...)` into a dedicated runtime-local builder and keep the central file to one builder call
- Bad: add a new runtime by inserting a large block of runtime-specific setup into the central registry file

## Acceptance Criteria

This contract is satisfied only if:

- each runtime enters the registry through one builder entry
- the registry file does not expand runtime-local implementation code over time
- runtime-local implementation details are hidden behind the builder boundary
