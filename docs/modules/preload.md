# Preload Development Guide

## Scope

`src/preload/index.ts` defines the safe browser-side API exposed to the renderer through `contextBridge`.

It is the narrow contract surface between:

- Electron main process
- React renderer

## What It Does

The preload layer:

- wraps `ipcRenderer.invoke(...)` calls into typed methods
- registers event listeners for pushed events
- exposes everything under `window.multiAgentChat`

This keeps Electron-specific details out of page components.

## Current API Categories

The current API surface includes:

- snapshot and runtime refresh
- chat operations
- model channel save/import/generate
- configured agent save and test
- runtime channel test and balance
- local file preview and path reveal
- power management
- skills search/import/install/uninstall
- workflow agent requests and workflow draft updates
- workflow run control
- scheduled workflow runner and cloud schedule operations
- task operations
- team operations
- global history clear
- push subscriptions such as snapshot updates and workflow events

## Design Rules

### Keep Preload Thin

Preload should not own business logic. Its job is translation and exposure.

Good preload code:

- forward a request to the main process
- attach or remove listeners
- keep method names clear and stable

Bad preload code:

- mutating business state locally
- transforming complex domain behavior
- duplicating validation logic from `main` or `shared`

### Keep Types Shared

Method arguments and return types should come from `src/shared/types.ts` or other shared helpers whenever possible.

This avoids contract drift between main and renderer.

### Preserve Event Symmetry

If `index.ts` sends an event like:

- `snapshot:changed`
- `workflow-agent:event`
- `scheduled-workflows:event`
- `configured-agents:test-event`

then preload should provide a matching `onXxx(...)` subscription helper with a cleanup function.

## When To Change This Layer

You should touch preload when:

- a new IPC endpoint needs to be callable from the renderer
- a pushed event needs renderer subscription support
- an existing method signature changed in the shared contract

You usually do not need to touch preload for:

- pure renderer layout changes
- purely internal main-process refactors
- new shared helper functions that are not directly invoked by the renderer

## Testing Focus

`src/preload/index.test.ts` is the main protection here.

Tests should verify:

- the right IPC channel name is used
- arguments are forwarded correctly
- event subscriptions attach and clean up properly
- the exposed API shape stays stable

## Development Advice

- keep names explicit and mirror the domain nouns used in `main`
- avoid leaking raw `ipcRenderer` usage into renderer pages
- prefer additive changes over silent method rewrites
- if a preload method starts becoming smart, the logic probably belongs elsewhere
