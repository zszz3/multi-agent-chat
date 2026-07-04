# Multi Agent Chat Docs

This directory contains project documentation for the Electron desktop app.

## Languages

- English: this directory
- Simplified Chinese: `zh-CN/`

## Documents

- `architecture-overview.md`: overall architecture, runtime flow, the one-shot vs interactive execution boundary, and data flow
- `renderer-refactor-progress-2026-06-28.md`: current progress, validation status, and remaining work for the renderer shell/provider/service refactor
- `modules/main.md`: Electron main process, application state hub, and interactive runtime/session orchestration
- `modules/preload.md`: preload bridge and renderer-facing API surface
- `modules/renderer.md`: React renderer structure, page modules, and UI state flow
- `modules/shared.md`: shared types, presets, workflow graph helpers, and bundled skill metadata
- `modules/mcp.md`: MCP server and bridge integration

## How To Use These Docs

Read `architecture-overview.md` first if you are new to the repository.

If you prefer Chinese, start with `zh-CN/README.md`.

Then use the module documents based on the layer you are changing:

- changing desktop lifecycle, IPC, persistence, or runtime attachment/recovery behavior: `modules/main.md`
- changing renderer API contracts: `modules/preload.md`
- changing pages, layout, interactions, or client-side orchestration: `modules/renderer.md`
- changing cross-layer data contracts or reusable domain helpers: `modules/shared.md`
- changing external MCP exposure: `modules/mcp.md`
