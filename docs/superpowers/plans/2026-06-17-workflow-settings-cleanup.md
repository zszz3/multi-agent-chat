# Workflow Settings Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up Workflow UI noise, add Escape dismissal for output document previews, replace the destructive rail action with settings navigation, and add a basic Chinese/English language preference.

**Architecture:** Keep the change in the renderer. Use a small `Language` state and translation helper in `App.tsx`, route the rail footer settings button to a dedicated Settings page, keep Configs as a separate provider configuration page, and keep Workflow execution context data untouched while hiding its dedicated visual card.

**Tech Stack:** Electron, React, TypeScript, Vitest renderer layout tests.

---

### Task 1: Renderer Tests

**Files:**
- Modify: `src/renderer/src/App.layout.test.tsx`

- [x] Add failing tests that assert the Workflow result no longer renders the visible Workflow context card.
- [x] Add failing tests that assert Settings renders a language selector and Configs does not own app settings.
- [x] Add failing tests that assert the app rail footer contains a settings action instead of a destructive clear-history action.
- [x] Run `npm test -- --run src/renderer/src/App.layout.test.tsx` and verify the new tests fail.

### Task 2: UI Implementation

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/CommandPalette.tsx`

- [x] Add `Language = "zh" | "en"` state persisted to `localStorage`.
- [x] Add a small translation dictionary for main chrome, command palette, Configs primary labels, and Workflow primary labels.
- [x] Replace the rail footer delete-all button with a settings button that navigates to a dedicated Settings page.
- [x] Remove the visible Workflow context card while preserving context data for output document extraction and execution.
- [x] Add Escape key handling to close Workflow output document preview.
- [x] Pass language labels into `SettingsPage`, `ConfigPage`, and `CommandPalette`.
- [x] Run the focused renderer layout tests and verify they pass.

### Task 3: Verification

**Files:**
- Modify: none expected

- [x] Run `npm run typecheck`.
- [x] Run `npm test -- --run`.
- [x] Inspect `git diff` for accidental broad rewrites or sensitive data.
