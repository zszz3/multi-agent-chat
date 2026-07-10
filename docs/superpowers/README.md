# Design Specs

This directory stores reviewed design specs and implementation contracts.

## Structure

- `specs/`: reviewed design documents and implementation contracts

Specs are grouped by topic area:

- `runtime/`: runtime execution boundary, driver, routing, and onboarding work
- `workflow/`: workflow product and UX changes

## Reading Guide

If you are working on runtime execution, start with:

1. `specs/runtime/2026-07-08-runtime-boundary-reset-design.md`
2. the relevant `specs/runtime/2026-07-08-runtime-phase-0x-*.md`
3. `../agent-integration-guide.md` for a practical onboarding sequence

If you are working on workflow product behavior, start with:

1. the relevant workflow spec under `specs/workflow/`
2. the matching design document under `../workflow-v2/`

## Authoring Rule

When adding a stable contract, place it in the closest topic folder instead of the `superpowers/` root. Temporary progress notes and one-off implementation plans should stay outside `docs/`.
