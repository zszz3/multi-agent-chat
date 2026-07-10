# Design Specs

This directory stores reviewed design specs, implementation contracts, and active execution plans.

## Structure

- `specs/`: reviewed design documents and implementation contracts
- `plans/`: active execution plans derived from an approved spec

Specs are grouped by topic area:

- `runtime/`: runtime execution boundary, driver, routing, and onboarding work
- `windows/`: Windows packaging, platform integration, runtime certification, and release work
- `workflow/`: workflow product and UX changes

## Reading Guide

If you are working on runtime execution, start with:

1. `specs/runtime/2026-07-08-runtime-boundary-reset-design.md`
2. the relevant `specs/runtime/2026-07-08-runtime-phase-0x-*.md`
3. `../agent-integration-guide.md` for a practical onboarding sequence

If you are working on workflow product behavior, start with:

1. the relevant workflow spec under `specs/workflow/`
2. the matching design document under `../workflow-v2/`

If you are working on Windows support, start with:

1. `specs/windows/2026-07-10-windows-adaptation-program.md`
2. `plans/windows/README.md`
3. the current phase plan only

## Authoring Rule

When adding a stable contract, place it in the closest `specs/` topic folder. Active plans belong under the matching `plans/` topic folder and must be removed or converted into a stable spec when the program is complete. Temporary progress notes stay outside `docs/`.
