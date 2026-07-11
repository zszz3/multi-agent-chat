# Job-Tailored Resume Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only official workflow that turns a master resume and target job description into factual HTML/Markdown resumes plus an explainable match report.

**Architecture:** Follow the existing directory-per-workflow asset convention under `src/shared/bundled-workflows`. Keep all behavior in prompts and fixed assets so the workflow runtime and persistence model remain unchanged. Extend loader tests to verify multi-asset injection and validate the real bundled workflow graph and safety constraints.

**Tech Stack:** Electron, TypeScript, Vitest, JSON workflow manifests, static HTML/Markdown assets.

---

### Task 1: Define executable template expectations

**Files:**
- Modify: `src/main/workflows/bundled-workflows.test.ts`
- Test: `src/main/workflows/bundled-workflows.test.ts`

- [ ] **Step 1: Add a failing real-catalog test**

Load `src/shared/bundled-workflows`, locate `bundled-job-tailored-resume`, and assert its six agent nodes, eight DAG edges, output filenames, fact-preservation rule, Gate instruction, and absence of unresolved `__...__` asset tokens.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/workflows/bundled-workflows.test.ts`

Expected: FAIL because `bundled-job-tailored-resume` does not exist.

### Task 2: Add the official workflow and fixed assets

**Files:**
- Create: `src/shared/bundled-workflows/job-tailored-resume/workflow.json`
- Create: `src/shared/bundled-workflows/job-tailored-resume/resume-template.html`
- Create: `src/shared/bundled-workflows/job-tailored-resume/tailoring-guidelines.md`
- Create: `src/shared/bundled-workflows/job-tailored-resume/review-checklist.md`

- [ ] **Step 1: Add the workflow manifest**

Define parallel `analyze-job` and `extract-resume` nodes, then `match-evidence`, `clarify-gaps`, `tailor-resume`, and `review`. Inject the three fixed assets only into nodes that consume them and require `tailored-resume.html`, `tailored-resume.md`, and `match-report.md` outputs.

- [ ] **Step 2: Add the writing and review assets**

Provide a single-column printable HTML shell, evidence-based tailoring rules, and a deterministic final review checklist. Assets must contain no personal data and must prohibit invented facts and opaque ATS scores.

- [ ] **Step 3: Run focused tests**

Run: `npx vitest run src/main/workflows/bundled-workflows.test.ts`

Expected: all bundled workflow tests pass.

### Task 3: Verify production packaging

**Files:**
- Verify: `electron.vite.config.ts`
- Verify: `out/shared/bundled-workflows/job-tailored-resume/*`

- [ ] **Step 1: Build the application**

Run: `npm run build`

Expected: typecheck and all three Electron Vite bundles succeed.

- [ ] **Step 2: Verify copied assets**

Assert all four new files exist under `out/shared/bundled-workflows/job-tailored-resume` and the built catalog loader can resolve the manifest assets.

- [ ] **Step 3: Run regression tests**

Run: `npx vitest run src/main/workflows/bundled-workflows.test.ts src/main/official-catalog-store.test.ts src/renderer/src/App.layout.test.tsx`

Expected: all selected tests pass.

### Task 4: Commit the implementation

**Files:**
- Add: `src/shared/bundled-workflows/job-tailored-resume/*`
- Modify: `src/main/workflows/bundled-workflows.test.ts`
- Add: `docs/superpowers/plans/2026-07-11-job-tailored-resume-workflow.md`

- [ ] **Step 1: Check the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only the planned files are changed.

- [ ] **Step 2: Commit**

Run: `git add <planned files> && git commit -m "Add tailored resume workflow"`

Expected: one implementation commit on the current branch; pushing is excluded unless separately requested.
