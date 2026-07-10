# Workflow Settings Cleanup Implementation Plan

> Historical completed plan. Do not use this file as the implementation plan for Workflow V2.

**Original goal:** Clean up Workflow UI noise, support Escape dismissal for output previews, remove the destructive rail action, and add a Chinese/English preference.

**Current status:** Completed, with the original general Settings page decision superseded by the later Runtime/Agent navigation split.

**Authoritative design:** [Workflow Settings Cleanup Design](../../specs/workflow/2026-06-17-workflow-settings-cleanup-design.md)

---

### Task 1: Preserve Workflow Context Without Rendering A Dedicated Card

- [x] Keep `contextDocument` and `runContextDocument` in workflow state and execution inputs.
- [x] Do not render context text as a standalone Workflow result card.
- [x] Keep output extraction, validation, review, and recovery consumers independent from card visibility.
- [x] Cover the visible behavior in `src/renderer/src/App.layout.test.tsx`.

### Task 2: Keep Output Preview Dismissal Local To The Renderer

- [x] Close Workflow file preview when Escape is pressed.
- [x] Register the keyboard listener only while a preview is open.
- [x] Remove the listener during cleanup.
- [x] Do not mutate workflow artifacts or runtime state when closing the preview.

### Task 3: Preserve Preference And Configuration Boundaries

- [x] Persist `Language = "zh" | "en"` through `LANGUAGE_STORAGE_KEY` in `localStorage`.
- [x] Keep application-owned translations separate from user/provider/model content.
- [x] Remove the destructive clear-all-history rail action.
- [x] Keep Runtime provider configuration separate from Agent profile configuration.
- [x] Record that the original dedicated general Settings page was superseded by the Runtime/Agent navigation split.

### Task 4: Verification And Closure

- [x] Verify the renderer behavior through `src/renderer/src/App.layout.test.tsx`.
- [x] Run repository-wide type checking and production build.
- [x] Run the full test suite.
- [x] Confirm that this historical UI plan does not define Workflow V2 graph, runtime, persistence, intervention, or hook semantics.

Final verification after the latest synchronized base:

```text
npm run build: passed
npm test: 91 files passed, 766 tests passed
```

For current Workflow V2 work, use `2026-07-10-workflow-v2-implementation-program.md` and its six phase plans.
