# Renderer Development Guide

## Scope

`src/renderer/src/` contains the React application rendered inside Electron.

This layer is responsible for:

- app shell and navigation
- page-level feature UI
- local presentation state
- user interaction flow
- calling preload APIs and rendering snapshot data

## Structure

Current structure:

```text
src/renderer/src/
  app/
  pages/
  ui/
  App.tsx
  main.tsx
  styles.css
```

### `main.tsx`

Bootstraps the React app, loads fonts, loads global styles, and mounts `App`.

### `App.tsx`

This is still the composition root and the largest renderer file.

It currently owns:

- initial snapshot loading
- app-wide state wiring
- active feature selection
- theme and some local preference behavior
- feature page composition
- integration with `window.multiAgentChat`

Even though page extraction has started, `App.tsx` remains the renderer hotspot. Expect many cross-feature changes to pass through it.

### `app/`

Cross-feature UI helpers and shared renderer utilities live here.

Examples:

- `FeatureRail.tsx`: left feature navigation
- `ResourceSidebar.tsx`: resource and contextual sidebar
- `format.ts`: display formatting
- `language.ts`: language helpers
- `storage.ts`: local storage keys and helpers
- `shell.ts`, `text.ts`, `agents.ts`, `composer.ts`: shell-level or cross-page helpers

### `pages/`

Feature-oriented page modules live here.

Main page groups:

- `chat/`
- `config/`
- `runtime/`
- `skills/`
- `tasks/`
- `teams/`
- `workflow/`
- `schedules/`
- `settings/`

Each page folder contains:

- the page component
- feature-local helper files
- feature-specific types or utilities

### `ui/`

Reusable presentational pieces that are not tied to one feature.

Current notable example:

- `MarkdownDocument.tsx`

## Renderer State Strategy

The renderer is not the authoritative business-state owner.

Main rules:

- backend-owned state comes from `AppSnapshot`
- user actions call preload methods
- updated snapshots are pushed from the main process
- renderer keeps only UI-local state locally

Good local renderer state:

- panel open or closed
- drag interactions
- active tab
- form draft not yet submitted

Main-process state should stay in the snapshot:

- chats
- tasks
- configured agents
- workflow records
- scheduled workflow runner status

## Page Responsibilities

### Chat

Files under `pages/chat/` handle:

- chat transcript display
- chat controls
- slash command suggestions
- chat configuration lock behavior

Slash suggestion rendering in the renderer should stay declarative:

- ask main for grouped slash completions
- render the groups in the chat UI
- avoid reconstructing runtime-native command catalogs from `AppSnapshot`

That boundary matters because native suggestions depend on runtime metadata and learned native history that only exist in main. For example, Codex may expose current model/plugin/skill metadata, while API runtimes should never show learned native CLI suggestions.

### Config and Runtime

These pages handle:

- configured agents
- provider channels
- presets
- model choices
- agent testing
- provider balance checks

Runtime and configuration are related but distinct:

- config focuses on reusable agent definitions
- runtime focuses on executable channel/provider setup and diagnostics

### Skills

`pages/skills/` handles:

- bundled skill browsing
- imported skill listing
- online skill search
- install/import actions

The page should stay thin over main-process filesystem behavior.

### Tasks and Teams

These pages surface long-running execution state and coordination state. They mostly render snapshot domains produced by `AgentHub`.

### Workflow and Schedules

These are the richest feature areas in the renderer.

Workflow files handle:

- draft authoring
- graph display
- board layout
- run history and context

Schedule files handle:

- scheduled workflow editing
- due event handling UI
- runner configuration and cloud-synced schedules

## Styling

Global styling currently lives in `src/renderer/src/styles.css`.

This means:

- style changes can still have wide blast radius
- page extraction is ahead of style extraction

When changing styles:

- prefer adding feature-oriented class naming
- avoid broad selectors that accidentally affect unrelated pages
- keep visual behavior consistent with the existing desktop shell

## Testing Focus

Renderer tests are colocated near the relevant areas.

Examples:

- `App.layout.test.tsx`

Because `App.tsx` is still the integration root, renderer regressions often surface there first. If you split logic into feature helpers, try to make the helpers directly testable and reduce pressure on giant integration tests.

## Development Advice

- prefer changing page folders over growing `App.tsx` further
- keep business rules out of JSX when shared helpers can express them more clearly
- if a page helper is reusable across pages, move it to `app/` or `ui/`
- when a change spans renderer and backend, update shared types first so the boundary stays explicit
- keep slash completion intelligence in main; renderer should render the result, not infer native runtime behavior
