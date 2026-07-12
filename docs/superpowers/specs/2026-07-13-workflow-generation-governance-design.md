# Workflow Generation Governance

## Goal

Unify Workflow drafting, adversarial review, confirmation, permission assessment, and execution around one revisioned aggregate.

## Lifecycle

1. Manager interviews the user and materializes a mutable draft.
2. Manager assigns typed script parameters, capabilities, risk, and rationale.
3. Static analysis derives side effects and minimum risk.
4. The selected Reviewer Agent adversarially reviews the exact revision.
5. Findings appear in the same planning Workflow and revisions invalidate stale reviews.
6. An approved current review enables user confirmation.
7. Confirmation freezes the definition, routes, review, and effective permission profile.
8. Runs collect unresolved node parameters and request permission only when required by effective risk.

## Removed Architecture

- no legacy workflow input panel;
- no `approved: boolean` execution port;
- no script command allowlist policy;
- no `sandboxMode`, `script.access`, or free-form `script.input` compatibility;
- no optional or implicit Workflow review;
- no second Workflow or session for generated output;
- no runtime inference of undeclared script input.

## Prompt Responsibilities

The Manager minimizes the graph, prefers scripts for deterministic work, declares all inputs and effects, and never understates risk. The Reviewer seeks concrete failure paths and permission underestimation without blocking on cosmetic preferences. Runtime prompts distinguish draft generation, review, node execution, and final reporting.

## Completion Gate

A Workflow can be confirmed only when the definition validates, static analysis succeeds, every script has a complete typed contract, the current revision has an approved adversarial review, all effective risks are computed, and routes and review belong to the current revision.
