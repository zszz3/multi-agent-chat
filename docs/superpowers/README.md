# Superpowers Docs

This directory stores design specs and implementation plans that are written during agent-driven product and architecture work.

## Structure

- `specs/`: reviewed design documents and architectural contracts
- `plans/`: implementation plans derived from approved specs

Both `specs/` and `plans/` are grouped by topic area:

- `runtime/`: runtime architecture, execution boundary, driver, routing, and onboarding work
- `workflow/`: workflow product and UX changes

## Reading Guide

If you are working on runtime execution architecture, start with:

1. `specs/runtime/2026-07-08-runtime-boundary-reset-design.md`
2. the relevant `specs/runtime/2026-07-08-runtime-phase-0x-*.md`
3. any related runtime plan under `plans/runtime/`

If you are working on workflow product behavior, start with:

1. the relevant workflow spec under `specs/workflow/`
2. the corresponding workflow plan under `plans/workflow/`

## Authoring Rule

When adding new docs here, place them in the closest topic folder instead of the `superpowers/` root.
