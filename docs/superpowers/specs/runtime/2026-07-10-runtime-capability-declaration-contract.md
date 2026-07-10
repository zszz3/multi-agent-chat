# Runtime Capability Declaration Contract

## 2026-07-10

### Status

Proposed on 2026-07-10.

This file defines the capability declaration rules for every runtime.

### Purpose

The repository already has an explicit runtime request contract.

What it still needs is a strict rule for how runtimes advertise support so that new runtimes do not inherit behavior accidentally through inference, silent fallbacks, or template copying.

## Explicit Capability Declaration Is Mandatory

Every runtime must explicitly declare support for:

- surfaces
- execution modes per surface
- continuation policies per surface

Where relevant, it must also explicitly declare support for:

- interactive sessions
- runtime conversation persistence
- cleanup
- channel test
- interrupt
- continue
- approval requests
- user input requests

## Forbidden Inference

Capability support must not be inferred from:

- runtime name
- transport type
- command shape
- model naming
- similarity to another runtime
- "it worked before" behavior

The registry and router must rely on declared support, not assumptions.

## Unsupported Combinations Must Fail Explicitly

If a runtime does not support a requested combination such as:

- workflow interactive
- oneshot resume-required
- cleanup without persistent artifacts
- runtime conversation persistence without a codec

the system must fail explicitly rather than:

- silently falling back
- dropping continuation requirements
- inventing fake session state
- pretending support exists

## Runtime Conversation Rule

A runtime may persist opaque runtime conversation state only if:

- it truly has stable runtime-native continuation identity
- it has a codec or equivalent explicit validation boundary

If that condition is not true, the runtime must remain stateless at the app boundary.

This prevents fake `sessionId` fields from becoming architecture truth.

## Runtime Classification Must Precede Capability Shape

Before declaring capability support for a new runtime, first classify the runtime as one of:

- stateless one-shot
- session-capable interactive
- API-hosted

That classification must be based on evidence from the runtime itself, not on the repository's wish for symmetry.

## Example Guidance

### Hermes

Until upstream evidence proves stable interactive session and resume semantics, Hermes should declare conservative support:

- one-shot where implemented
- workflow one-shot if reused or implemented explicitly
- channel-test if implemented
- no interactive resume semantics by default

### OpenClaw

OpenClaw capability support must not be declared until its transport and session semantics are known.

If it turns out to be:

- stateless CLI: keep it stateless
- session-capable RPC: declare interactive support explicitly
- hosted API: declare only the supported API-backed surfaces

## Acceptance Criteria

This contract is satisfied only if:

- support matrices are declared explicitly
- unsupported combinations fail explicitly
- runtime conversation persistence exists only for runtimes with real continuation identity
- runtime capability shape follows runtime evidence rather than template pressure
