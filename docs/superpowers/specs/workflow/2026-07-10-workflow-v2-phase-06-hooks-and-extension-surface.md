# Workflow V2 Phase 06: Hooks And Extension Surface

## 2026-07-10

### Status

Draft on 2026-07-10.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-implementation-program.md`
- the current repository state

The agent must not assume prior chat history.

### Objective

Define how Workflow V2 inserts lightweight lifecycle behavior without widening the core graph model or inventing new node types for every small need.

This phase is responsible for one thing only:

- extension through hooks

### Required Preconditions

Before changing code, verify that the repository already satisfies all of the following:

- authoring, planning, execution, review, and persistence contracts already exist
- node lifecycle boundaries are explicit enough to expose hook insertion points
- runtime state can tolerate hook-driven pause or skip outcomes where allowed

If any precondition is false, stop and report a phase-ordering violation.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- hooks extend lifecycle boundaries rather than redefine graph semantics
- hooks execute in the main process boundary
- agent and script executors remain unaware of hook internals
- `llmHook` is read-only and low-cost by default
- hooks must not reintroduce hidden edge or routing semantics through side effects

### In Scope

- hook lifecycle points
- hook action taxonomy
- hook execution context
- hook variable accumulation rules
- hook sources and precedence
- hook guardrails and safety policy

### Out Of Scope

- full plugin ecosystem
- arbitrary remote code injection
- new graph edge types

### Required End State

#### 1. Hook Lifecycle Points Must Be Explicit

The runtime must define where hooks can run, such as:

- before execution
- after raw output capture
- after validation or completion

Hooks must not depend on hidden executor-specific timing assumptions.

#### 2. Hook Actions Must Be Taxonomized

The system must define what actions hooks may perform, such as:

- flow control
- context injection
- memory read or write
- output delivery
- lightweight read-only LLM transforms

This taxonomy must be explicit so implementation does not collapse into arbitrary custom callbacks.

#### 3. Hook Context Must Be Controlled

Hooks need access to:

- current node output
- workflow run context
- accumulated hook variables where allowed

but they must not gain uncontrolled access that bypasses role, budget, or review boundaries unintentionally.

#### 4. Hook Sources Must Compose Predictably

Hooks may originate from:

- node definition
- template defaults
- user-added configuration

The repository must define how these sources compose so runtime behavior is not ambiguous.

#### 5. Hook Failure Policy Must Be Explicit

If a hook fails, the runtime must know whether to:

- fail the node
- pause the run
- skip the hook

It must not rely on incidental exception behavior.

#### 6. Hooks Must Not Become A Second Planning System

This phase must prevent hooks from quietly taking over responsibilities that belong to:

- graph authoring
- planning
- routing
- review

Hooks are lifecycle extensions, not a covert replacement for the core workflow model.

### Phase Failure Conditions

This phase is incomplete if any of the following remain true:

- hooks require executor-specific hidden behavior
- hook composition order is undefined
- `llmHook` can mutate state or perform arbitrary side effects by default
- hooks are being used to smuggle control-edge semantics back into the system

### Definition Of Done

This phase is complete only when:

- Workflow V2 exposes explicit hook lifecycle points
- hook actions and safety boundaries are defined
- hook source precedence is predictable
- hooks extend the lifecycle without widening graph semantics
