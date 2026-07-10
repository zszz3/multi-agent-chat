# Runtime Onboarding Validation Contract

## 2026-07-10

### Status

Implemented on 2026-07-10. The registry/router onboarding harness and Hermes protocol/session tests provide the current proof.

This file defines how a new runtime must be validated when it is onboarded.

### Purpose

A runtime onboarding is not complete just because the code compiles.

The repository needs proof that the runtime:

- was classified correctly
- declared capabilities correctly
- exposes only supported surfaces
- rejects unsupported combinations explicitly

## Required Onboarding Sequence

Every new runtime onboarding should follow this order:

1. classify the runtime shape
2. define the support matrix
3. implement the runtime-local bundle
4. register the runtime once
5. validate only the surfaces the runtime actually declares

The onboarding sequence must not start by copying another runtime template and hoping the support matrix can be corrected afterward.

## Required Validation Categories

Validation must cover every declared capability and every intentionally unsupported category that matters at the router boundary.

### 1. Detection Or Construction Proof

If the runtime is locally detected, prove:

- detection works when the runtime exists
- detection fails explicitly when it does not exist

If the runtime is not locally detected, prove the construction path is still explicit and testable.

### 2. One-Shot Proof

If the runtime declares one-shot support, validate:

- request dispatch reaches the correct runtime entrypoint
- success produces expected completed output
- runtime-local errors surface explicitly

### 3. Interactive Proof

If the runtime declares interactive support, validate:

- session creation
- attach and send behavior
- interrupt behavior if declared
- continuation behavior if declared
- detach or cleanup behavior if declared

If interactive is not supported, validate that the router rejects interactive requests explicitly.

### 4. Workflow Proof

If workflow support is declared, validate:

- workflow dispatch reaches the declared runtime path
- workflow output is returned through the explicit runtime contract

If workflow is unsupported, validate explicit rejection.

### 5. Channel-Test And Cleanup Proof

If channel-test or cleanup support is declared, validate those paths directly.

If unsupported, validate explicit rejection where the router or driver contract requires it.

### 6. Runtime Conversation Proof

If the runtime declares runtime conversation persistence, validate:

- codec-owned validation
- opaque persistence boundary
- rejection of malformed or foreign runtime envelopes

If the runtime does not declare runtime conversation persistence, validate that upper layers do not depend on fake session fields.

## Hermes And OpenClaw Guidance

### Hermes

Hermes is validated against its two documented surfaces:

- `hermes -z` one-shot argument construction and output/error handling
- `hermes acp` session creation, event streaming, model selection, approvals, interrupt, detach, and resume
- codec validation and persisted runtime conversation restoration
- native session cleanup command construction

The protocol tests use a fake ACP subprocess. A release smoke test with a real authenticated Hermes installation remains an environment-level check.

### OpenClaw

OpenClaw validation must follow whatever type it actually is.

The validation shape must not be selected before the runtime classification is proven.

## Acceptance Criteria

A runtime onboarding is complete only if:

- its classification is explicit
- its support matrix is explicit
- its declared surfaces work
- its unsupported surfaces fail explicitly
- its runtime conversation behavior matches its declared persistence support
