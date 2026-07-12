# Evaluation Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the provisional MCP and evaluation screens with one polished Evaluation workbench and a visually aligned independent MCP workbench.

**Architecture:** Introduce reusable operational workbench primitives, then split Evaluation into a shell and four focused views. Keep all existing preload APIs and persistence contracts intact; this is a renderer-only information architecture and interaction redesign.

**Tech Stack:** React 19, TypeScript, Lucide React, existing CSS token system, Vitest, React DOM server rendering tests, Electron/Vite.

---

### Task 1: Navigation Contract

**Files:**
- Modify: `src/renderer/src/app/shell.ts`
- Modify: `src/renderer/src/app/text.ts`
- Modify: `src/renderer/src/app/FeatureRail.tsx`
- Modify: `src/renderer/src/app/ResourceSidebar.tsx`
- Modify: `src/renderer/src/AppShell.tsx`
- Test: `src/renderer/src/App.layout.test.tsx`

- [ ] Add a failing layout test asserting that the rail renders one Evaluation entry and does not render Dataset, Evaluator, and Experiment as top-level entries.
- [ ] Run `npm test -- --run src/renderer/src/App.layout.test.tsx` and confirm the navigation assertion fails.
- [ ] Replace the three `ActiveFeature` values with `evaluation`, add localized Evaluation text, and route the feature to one `EvaluationWorkbench`.
- [ ] Run the focused layout test and confirm it passes.

### Task 2: Shared Workbench Primitives

**Files:**
- Create: `src/renderer/src/ui/workbench/Workbench.tsx`
- Create: `src/renderer/src/ui/workbench/workbench-types.ts`
- Modify: `src/renderer/src/styles.css`
- Test: `src/renderer/src/App.layout.test.tsx`

- [ ] Add rendering assertions for a compact header, tablist, resource browser, detail toolbar, metric strip, status indicator, and actionable empty state.
- [ ] Implement typed primitives using semantic `header`, `nav`, `aside`, `section`, and `table` elements; icon-only buttons receive `aria-label` and `title`.
- [ ] Add responsive CSS based on existing `--panel`, `--line`, `--text`, `--muted`, `--accent`, and status tokens, with no nested decorative cards.
- [ ] Verify desktop and narrow layouts do not create document-level overflow.

### Task 3: Evaluation Data Controller

**Files:**
- Create: `src/renderer/src/pages/evaluation/useEvaluationWorkbench.ts`
- Create: `src/renderer/src/pages/evaluation/evaluation-workbench-types.ts`
- Test: `src/renderer/src/pages/evaluation/useEvaluationWorkbench.test.ts`

- [ ] Test initial parallel loading, selected resource fallback, dirty state, save/delete/run busy state, and error normalization.
- [ ] Move all preload calls and mutable evaluation collections out of the page component into the hook.
- [ ] Expose explicit dataset, evaluator, experiment, run, and navigation operations.
- [ ] Run the hook tests and typecheck.

### Task 4: Evaluation Views

**Files:**
- Replace: `src/renderer/src/pages/evaluation/EvaluationPage.tsx`
- Create: `src/renderer/src/pages/evaluation/EvaluationOverview.tsx`
- Create: `src/renderer/src/pages/evaluation/DatasetWorkspace.tsx`
- Create: `src/renderer/src/pages/evaluation/EvaluatorWorkspace.tsx`
- Create: `src/renderer/src/pages/evaluation/ExperimentWorkspace.tsx`
- Create: `src/renderer/src/pages/evaluation/evaluation-format.ts`
- Modify: `src/renderer/src/styles.css`
- Test: `src/renderer/src/App.layout.test.tsx`

- [ ] Test all four tabs, resource selection, dataset case rows, evaluator type-specific fields, experiment setup, metrics, case results, history, and empty states.
- [ ] Build Overview from real counts, recent runs, failed cases, and Agent summaries; hide unsupported charts.
- [ ] Build Dataset and Evaluator as resource browser plus compact form sections.
- [ ] Build Experiment around Run, current Agent revision, metric strip, dense result table, expandable output/reason detail, and history.
- [ ] Add dirty-navigation confirmation between internal tabs and resources.
- [ ] Run focused UI tests and typecheck.

### Task 5: MCP Visual Alignment

**Files:**
- Replace: `src/renderer/src/pages/mcp/McpPage.tsx`
- Create: `src/renderer/src/pages/mcp/useMcpRegistry.ts`
- Modify: `src/renderer/src/styles.css`
- Test: `src/renderer/src/App.layout.test.tsx`

- [ ] Test server browser, transport selector, connection fields, inline status, discovered tool table, busy states, and empty state.
- [ ] Move MCP loading and mutations into `useMcpRegistry` with dirty and error state.
- [ ] Rebuild MCP with the same workbench header, browser, toolbar, section, and table primitives.
- [ ] Run focused UI tests and typecheck.

### Task 6: Verification And Polish

**Files:**
- Modify: `src/renderer/src/styles.css`
- Modify tests only when an assertion reveals a real contract mismatch.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --run src/renderer/src/App.layout.test.tsx src/renderer/src/pages/evaluation/useEvaluationWorkbench.test.ts`.
- [ ] Run `npm run build`.
- [ ] Restart Electron and inspect Evaluation Overview, Datasets, Evaluators, Experiments, and MCP at 1360x860 and a narrow viewport through CDP.
- [ ] Check document and main-content scroll dimensions, long text wrapping, selected states, focus visibility, and action button stability.
- [ ] Commit renderer changes with `git commit -m "Redesign evaluation and MCP workbenches"`.
