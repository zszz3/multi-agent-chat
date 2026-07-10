# Workflow Specs

Workflow specs capture product and execution-surface design decisions for the workflow module.

## Document Roles

- `docs/workflow-v2/` contains stable explanatory design documentation.
- This directory contains normative implementation contracts and completion evidence.
- `../plans/workflow/` contains task sequencing and verification checklists.
- Historical completed specs remain useful for traceability, but they do not override the current Workflow V2 program contract.

## Completed Workflow V2 Foundation Contracts

- `2026-07-10-workflow-v2-implementation-program.md`
- `2026-07-10-workflow-v2-phase-01-authoring-contract.md`
- `2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md`
- `2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md`
- `2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md`
- `2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md`
- `2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md`

## Proposed Workflow V2 Evolution Contracts

Read and implement strictly in this order:

1. [`2026-07-10-workflow-v2-evolution-program.md`](2026-07-10-workflow-v2-evolution-program.md)
2. [`Phase 07: Runtime Service Boundaries`](2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md)
3. [`Phase 08: Execution Capabilities And Script Sandbox`](2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md)
4. [`Phase 09: Event-Driven Scheduling And Global Locks`](2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md)
5. [`Phase 10: Model Routing, Budget Ledger, And Context`](2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md)
6. [`Phase 11: Revision And Replan Lifecycle`](2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md)
7. [`Phase 12: Storage Migration And Crash Consistency`](2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md)
8. [`Phase 13: Hook Safety, Idempotency, And Memory`](2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md)
9. [`Phase 14: Observability, Simulation, And Workflow UX`](2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md)

All Phase 07–14 documents are proposed until their requirement-by-requirement completion evidence is written. Never treat an unchecked plan as implemented behavior.

## Historical Completed Specs

- [`2026-06-17-workflow-settings-cleanup-design.md`](2026-06-17-workflow-settings-cleanup-design.md): renderer-only Workflow UI cleanup. Most decisions remain active; the original general Settings page was superseded by the Runtime/Agent navigation split.

When a historical decision conflicts with a current program/phase spec, the current Workflow V2 contract wins. Update the relevant current phase spec when changing runtime semantics; update a historical spec only to correct provenance or migration status.
