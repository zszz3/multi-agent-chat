# Workflow Adversarial Review

## Goal

Require an independent generation-time review of every mutable Workflow revision before user confirmation.

## Agent Routing

A Workflow stores independent Manager and Reviewer routes. Each route contains configured Agent and model IDs. The user may select the same route for both roles or different routes. Reviewer routing is editable while the Workflow is a draft and any route change invalidates the current review and confirmation.

## Review Scope

The Reviewer checks missing or redundant nodes, over- or under-decomposition, topology, execution mode, deterministic work assigned to LLMs, parameter and output handoffs, prompt completion criteria, understated script risk, and practical user-experience failure paths.

Review is adversarial but pragmatic. A finding must identify a concrete execution, safety, correctness, or usability failure. Style preferences and remote theoretical edge cases cannot block approval.

## Structured Result

The result contains verdict (`approve` or `revise`), reviewed revision, summary, blocking findings with severity and failure path, per-script Reviewer risk, and optional suggestions.

The Reviewer never silently edits the Workflow. The Manager or user applies changes, producing a new revision and invalidating the previous review.

## State Machine

Review state is `not_reviewed`, `reviewing`, `approved`, `changes_requested`, or `failed`.

Confirmation requires a valid DAG, an `approved` review for the current revision, and no later mutation. Confirmation freezes the reviewed definition and effective risk decisions.

## Invariants

- Review is mandatory and cannot be disabled.
- The Reviewer run is persistent and visible in the planning Workflow.
- A stale review cannot confirm or run a newer revision.
- Reviewer failures are visible and retryable; they never become implicit approval.
