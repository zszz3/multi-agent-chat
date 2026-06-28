# Renderer Architecture

The renderer is now organized as `App` entrypoint -> `AppShell` composition layer -> app-level state/service boundaries -> feature pages and controllers.

## Target Layout

```text
src/renderer/src/
  App.tsx
  AppShell.tsx
  app/
    agents.ts
    constants.ts
    shell.ts
    storage.ts
    text.ts
    app-state.ts
    providers/
      AppProviders.tsx
    services/
      multi-agent-chat-service.ts
    state/
      navigation-store.tsx
      preferences-store.tsx
      snapshot-store.tsx
  pages/
    chat/
    tasks/
    teams/
    workflow/
      WorkflowPage.tsx
      workflow-canvas-layout.ts
      workflow-domain.ts
      workflow-utils.ts
    schedules/
    skills/
    runtime/
    config/
    settings/
  ui/
    MarkdownDocument.tsx
```

## Module Rules

- `App.tsx` is a compatibility entrypoint. It should export the mounted app surface and re-export shared helpers for existing tests while migration is in progress.
- `AppShell.tsx` owns top-level composition only: page mounting, shell navigation, sidebar wiring, and provider/service assembly.
- `app/state/` owns app-level state boundaries such as snapshot, preferences, and navigation.
- `app/services/` is the only renderer layer that should touch `window.multiAgentChat`.
- `pages/<feature>/` owns feature rendering and feature-local orchestration.
- Cross-feature helpers should live in `app/` or a feature-local pure module, not inside `AppShell`.
- `ResourceSidebar` should consume feature view-models, not the whole snapshot.

## Current Migration State

1. `App` and `AppShell` are split.
2. `configuration` is now a first-class top-level feature instead of a dormant page export.
3. App-level provider/service/store skeletons exist and can absorb remaining state from `AppShell`.
4. Workflow domain prompt/judge/report helpers are separated from shell composition.
5. `ResourceSidebar` now accepts feature-scoped models instead of raw top-level state bags.

## Remaining Work

1. Move snapshot, preferences, and navigation ownership from `AppShell` local state into the new providers.
2. Extract feature controllers/hooks for workflow, runtime/config, chat, tasks, and teams.
3. Finish replacing direct `window.multiAgentChat` usage in pages/shell logic with app services.
4. Split `styles.css` by feature after JSX boundaries stabilize.
5. Reduce `App.tsx` compatibility re-exports after tests migrate off the legacy surface.
