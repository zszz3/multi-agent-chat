# Workflow Settings Cleanup Design

## 2026-06-17

### Status

Historical and completed. This document was restored on 2026-07-10 for traceability after a documentation reorganization removed the file but left its plan index entry behind.

This is a renderer UI cleanup design, not a Workflow V2 execution contract. The authoritative Workflow V2 architecture starts at `2026-07-10-workflow-v2-implementation-program.md`.

### Original Goal

Reduce Workflow UI noise, make output previews easier to dismiss, remove a destructive global-history action from the rail, and add a basic Chinese/English preference.

### Decision Status

| Original decision | Current status | Current implementation evidence |
| --- | --- | --- |
| Hide the visible Workflow context card | Retained | `WorkflowPage` consumes context for execution/output assembly but does not render the context text as a standalone card. |
| Preserve `contextDocument` and `runContextDocument` | Retained and expanded | Workflow draft, runtime, history, recovery, and Workflow V2 planning continue to carry these fields. |
| Close Workflow output preview with Escape | Retained | `WorkflowPage` installs an Escape handler while `filePreview` is open. |
| Replace the destructive rail action | Retained | The app rail no longer exposes the old clear-all-history action. |
| Add a dedicated general Settings page | Superseded | Later navigation work intentionally removed the general Settings page and split configuration into Runtime and Agent surfaces. |
| Keep provider configuration separate from agent profiles | Retained and clarified | Runtime owns provider/channel configuration; Agent owns configured agent profiles. |
| Persist Chinese/English language preference | Retained | `Language` remains `"zh" | "en"`; `AppShell` loads and writes `LANGUAGE_STORAGE_KEY` through `localStorage`. |
| Translate primary application chrome | Retained and expanded | Shared text and feature-level language mappings now cover the app shell and multiple product surfaces. |

### Current Invariants

- Workflow context remains control/data-plane input even though it is not rendered as a dedicated result card.
- Closing a preview changes only renderer state; it must not alter workflow artifacts or execution state.
- Runtime provider configuration and Agent profile configuration remain separate product concerns.
- Language preference affects application-owned labels, not provider/model names, user content, agent output, file content, or raw errors.
- No destructive clear-all-history action may be reintroduced as a replacement for navigation or settings.

### Verification

Current coverage lives primarily in:

- `src/renderer/src/App.layout.test.tsx`
- `src/renderer/src/pages/workflow/WorkflowPage.tsx`
- `src/renderer/src/AppShell.tsx`
- `src/renderer/src/app/language.ts`
- `src/renderer/src/app/storage.ts`

The repository-wide production build and test suite passed after the latest `origin/main` synchronization: 91 test files and 766 tests.

### Historical Provenance

- Original documentation lineage: commits `8e831ab` and `fe91616`.
- The document was removed during later documentation streamlining and is intentionally restored as a completed historical record.
- New Workflow V2 behavior must update the Workflow V2 program/phase specs, not this historical design.
