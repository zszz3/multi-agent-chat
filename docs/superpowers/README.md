# Specs And Plans

This directory separates normative contracts from implementation sequencing.

## Structure

- `specs/`: normative behavior contracts and completion evidence
- `plans/`: implementation order, verification commands, and completion records

Specs are grouped by topic area:

- `runtime/`: runtime execution boundary, driver, routing, and onboarding work
- `workflow/`: workflow contracts split into Foundation, Evolution, and History

## Reading Guide

If you are working on runtime execution, start with:

1. `specs/runtime/2026-07-08-runtime-boundary-reset-design.md`
2. the relevant `specs/runtime/2026-07-08-runtime-phase-0x-*.md`
3. `../agent-integration-guide.md` for a practical onboarding sequence

If you are working on workflow product behavior, start with:

1. [Workflow documentation router](../workflow-v2/README.md)
2. the relevant authoritative spec under `specs/workflow/`
3. the matching plan under `plans/workflow/` only when implementing

## Authoring Rule

When adding a stable contract, place it in the closest `specs/` topic/status folder. Put executable task sequencing in the matching `plans/` folder. Explanatory design and unapproved proposals belong under `docs/workflow-v2/design/` and `docs/workflow-v2/proposals/`, never inside specs.
