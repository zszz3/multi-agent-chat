# Workflow Specs

Workflow specs capture product and execution-surface design decisions for the workflow module.

## Document Roles

- `docs/workflow-v2/` contains stable explanatory design documentation.
- This directory contains normative implementation contracts and completion evidence.
- `../plans/workflow/` contains task sequencing and verification checklists.
- Historical completed specs remain useful for traceability, but they do not override the current Workflow V2 program contract.

## Current Workflow V2 Contracts

- `2026-07-10-workflow-v2-implementation-program.md`
- `2026-07-10-workflow-v2-phase-01-authoring-contract.md`
- `2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md`
- `2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md`
- `2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md`
- `2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md`
- `2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md`

## Historical Completed Specs

- [`2026-06-17-workflow-settings-cleanup-design.md`](2026-06-17-workflow-settings-cleanup-design.md): renderer-only Workflow UI cleanup. Most decisions remain active; the original general Settings page was superseded by the Runtime/Agent navigation split.

When a historical decision conflicts with a current program/phase spec, the current Workflow V2 contract wins. Update the relevant current phase spec when changing runtime semantics; update a historical spec only to correct provenance or migration status.
