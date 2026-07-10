# Multi Agent Chat Docs

This directory contains project documentation for the Electron desktop app.

## Languages

- English: this directory
- Simplified Chinese: `zh-CN/`

## Documents

- `architecture-overview.md`: overall architecture, runtime flow, the SDK-backed `oneshot` / `interactive` execution boundary, and data flow
- `runtime-execution-architecture-spec.md`: pointer to the canonical runtime boundary reset contract and phase specs
- `workflow-v2-design.md`: top-level workflow-v2 outline document
- `superpowers/README.md`: design-spec and implementation-plan archive, grouped by topic area
- `progress/README.md`: progress logs, refactor checkpoints, and branch-era status documents
- `modules/main.md`: Electron main process, application state hub, official Claude SDK runtime wiring, and interactive session orchestration
- `modules/preload.md`: preload bridge and renderer-facing API surface
- `modules/renderer.md`: React renderer structure, page modules, and UI state flow
- `modules/shared.md`: shared types, presets, workflow graph helpers, and bundled skill metadata
- `modules/mcp.md`: MCP server and bridge integration

## How To Use These Docs

Read `architecture-overview.md` first if you are new to the repository.

Top-level docs are intentionally kept small in number. Stable entry documents stay in `docs/`, while topic archives and detailed design sets live in subdirectories such as:

- `workflow-v2/`
- `superpowers/`
- `progress/`
If you are working on runtime execution specifically, read:

- `runtime-execution-architecture-spec.md`
- `superpowers/specs/runtime/2026-07-08-runtime-boundary-reset-design.md`
- the relevant `superpowers/specs/runtime/2026-07-08-runtime-phase-0x-*.md` file for the phase you are changing

If you are looking for historical design or plan documents, start with:

- `superpowers/README.md`
- `superpowers/specs/README.md`
- `superpowers/plans/README.md`

If you are looking for refactor or migration progress notes, start with:

- `progress/README.md`

If you are working on workflow-v2 design, start with:

- `workflow-v2-design.md`
- `workflow-v2/README.md`
If you prefer Chinese, start with `zh-CN/README.md`.

Then use the module documents based on the layer you are changing:

- changing desktop lifecycle, IPC, persistence, or runtime attachment/recovery behavior: `modules/main.md`
- changing renderer API contracts: `modules/preload.md`
- changing pages, layout, interactions, or client-side orchestration: `modules/renderer.md`
- changing cross-layer data contracts or reusable domain helpers: `modules/shared.md`
- changing external MCP exposure: `modules/mcp.md`
