# Workflow Settings Cleanup Design

## 2026-06-17

### Goal

Clean up the Workflow UI and app chrome by reducing visual noise, making document previews easier to dismiss, and adding a basic app language preference.

### Decisions

- Hide the visible Workflow context card from the Workflow result area.
- Keep `contextDocument` and `runContextDocument` in state and execution prompts because workflow node handoff, judging, and final review still depend on shared context.
- Add Escape key dismissal for the Workflow output document preview modal.
- Replace the rail footer "clear all history" button with a settings button that navigates to a dedicated Settings page.
- Keep Configs as a separate agent/provider configuration page; do not overload it as application settings.
- Add a Settings page that uses the app resource sidebar for settings categories and shows the language section in the main content area. The language preference supports Chinese and English and persists in `localStorage`.
- Translate the main chrome, command palette, Workflow page, Settings page, and Configs primary labels through a small local dictionary. Provider names, model names, user content, agent output, file content, and raw errors remain unchanged.

### Testing

- Renderer layout tests cover the removed Workflow context card.
- Renderer layout tests cover the settings rail button and language switcher.
- Existing tests cover persisted workflow execution context and output document rendering.
