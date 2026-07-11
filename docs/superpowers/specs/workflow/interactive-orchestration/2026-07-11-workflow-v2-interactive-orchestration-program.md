# Workflow V2 Interactive Orchestration Program Contract

## Status

Approved design. Not implemented.

## Audience And Use

This contract is written for a fresh implementation agent with no chat history. Read this file, the target phase spec, the current repository instructions, and the current code before editing. Execute phases in declared order.

## Objective

Evolve Workflow V2 from one-shot task orchestration into strict topology-aware orchestration with durable node-level agent conversations, deterministic script nodes, event-driven supervision, and a visible leader coordination surface.

## Required End State

- Downstream nodes never start until every required predecessor reaches an allowed successful terminal state.
- Every frozen node declares `executionMode: "one-shot" | "interactive" | "script"`.
- Interactive nodes retain one durable runtime conversation across multiple user and agent turns.
- An interactive node does not release descendants when the agent merely stops speaking or asks a question.
- The agent proposes completion; the user explicitly confirms before the node becomes `completed`.
- Clicking a node opens a dedicated node-agent window with history, streaming output, tools, runtime identity, status, and an input composer when interaction is allowed.
- Script nodes execute through an explicit capability and approval policy instead of silently falling back to an agent.
- Frontend state is event-driven. Idle status checks use bounded interrupt probes after a quiet interval, never fixed-interval polling.
- Leader decisions are persisted and visible: priorities, blocking explanations, execution-mode recommendations, script candidates, risk, and revision proposals.

## Global Invariants

### Frozen Plan

Execution mode, node kind, dependencies, acceptance criteria, capability requirements, and completion policy are frozen with the graph version. Runtime retries and conversations do not mutate the plan. Changes require explicit revision and approval.

### Dependency Settlement

Only `completed` and policy-approved `skipped` predecessors satisfy a dependency. `queued`, `ready`, `running`, `waiting_for_user`, `completion_proposed`, `awaiting_approval`, `paused`, and `failed` do not satisfy dependencies.

### Conversation Identity

A node conversation is identified by `workflowId + runId + nodeId`. Closing UI, pausing a run, or restarting the app must not create a replacement conversation when the runtime supports resume.

### Completion Authority

An interactive agent may submit a structured completion proposal. Only explicit user confirmation commits the authoritative node output and releases descendants. Rejection returns the same conversation to active interaction.

### Capability Safety

Unsupported runtime conversation capabilities and unsafe script capabilities fail before execution. Prompt text is not permission enforcement. No shell command is assembled from an untrusted free-form string.

### Event Authority

Durable backend events are the source of truth. UI timers may affect presentation only. A timer may request a bounded status probe but may not change semantic node state or advance the graph.

## Phase Order

1. Strict dependency settlement fixes correctness before new execution modes.
2. Execution-mode planning creates the frozen contract consumed by later phases.
3. Durable node conversations add backend interactive semantics.
4. Node-agent window exposes the conversation safely in the renderer.
5. Script execution enables deterministic nodes under capability and approval policy.
6. Event-driven supervision and leader UX remove polling and make orchestration value visible.

## Forbidden Moves

- Treating task process settlement as node completion.
- Re-running an interactive node as repeated one-shot tasks.
- Releasing descendants on `waiting_for_user` or `completion_proposed`.
- Reusing the legacy gate textarea as the node conversation UI.
- Letting the renderer own authoritative conversation or scheduler state.
- Enabling unrestricted shell strings to make script nodes appear functional.
- Calling a progress model on a fixed interval.
- Allowing the leader to mutate a frozen graph without revision approval.

## Program Definition Of Done

All six phases are implemented in order; migration and recovery are tested; node conversations survive UI close and app restart where supported; script safety fails closed; no dependency bypass remains; no fixed-interval agent-status polling remains; and the leader surface provides observable decisions beyond the main branch behavior.
