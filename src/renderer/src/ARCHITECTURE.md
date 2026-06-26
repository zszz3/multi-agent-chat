# Renderer Architecture

The renderer is organized around the left navigation features. Each feature owns its page surface and then splits its internal helpers by responsibility.

## Target Layout

```text
src/renderer/src/
  app/
    language.ts
    shell.ts
    storage.ts
  pages/
    chat/
    tasks/
    teams/
    workflow/
      WorkflowPage.tsx
      workflow-canvas-layout.ts
      workflow-run-prompts.ts
    schedules/
    skills/
      SkillsPage.tsx
      find-skill.ts
    runtime/
    config/
    settings/
      SettingsPage.tsx
  ui/
    MarkdownDocument.tsx
    controls/
```

## Module Rules

- `App.tsx` owns process-level state, app shell navigation, IPC wiring, and page composition.
- `pages/<feature>/` owns feature page rendering and feature-specific helper modules.
- `app/` owns cross-feature primitives such as language, storage keys, shell class names, and capability guards.
- Shared helper modules should expose narrow interfaces that tests can call directly.
- Existing `App.tsx` exports may remain temporarily as compatibility re-exports while tests and imports are migrated.

## Migration Order

1. Extract pure helpers with existing tests.
2. Move independent pages such as settings.
3. Move larger pages one feature at a time, starting with their local helper modules.
4. Split `styles.css` by the same feature folders after JSX modules are no longer colocated in `App.tsx`.
