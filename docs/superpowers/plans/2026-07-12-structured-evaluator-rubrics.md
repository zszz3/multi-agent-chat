# Structured Evaluator Rubrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-line LLM Judge prompts with structured, source-traceable, five-level rubrics compiled into stable Judge prompts.

**Architecture:** Add shared rubric types and a pure compiler, persist rubrics as JSON on evaluator rows, and render structured rubric sections in the existing Evaluator workbench. Built-in templates own complete rubric data; the runner only includes declared inputs and parses structured feedback.

**Tech Stack:** TypeScript, React, Electron IPC, Node SQLite, Vitest, electron-vite.

---

### Task 1: Rubric Types, Validation, and Compiler

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/evaluation-rubric.ts`
- Create: `src/shared/evaluation-rubric.test.ts`

- [ ] **Step 1: Write failing compiler tests**

Cover five anchors, required-input filtering, stable section ordering, custom instructions, missing required values, and score normalization.

```ts
expect(compileEvaluationRubric(rubric, values)).toContain("## Score anchors");
expect(compiled).toContain("Input: question");
expect(compiled).not.toContain("Ground truth:");
expect(validateRubric(invalidRubric)).toContain("five score anchors");
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run: `npm test -- --run src/shared/evaluation-rubric.test.ts`

Expected: FAIL because `evaluation-rubric.ts` does not exist.

- [ ] **Step 3: Add shared types and pure helpers**

Define `EvaluationRubricInput`, `EvaluationRubricScore`, `EvaluationRubric`, `EvaluationRubricSource`, and optional `rubric` on `EvaluationEvaluator`. Implement:

```ts
export function validateEvaluationRubric(rubric: EvaluationRubric): string[];
export function compileEvaluationRubric(
  rubric: EvaluationRubric,
  values: Partial<Record<EvaluationRubricInput, string>>,
  customInstructions?: string,
): { prompt: string; missingInputs: EvaluationRubricInput[] };
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --run src/shared/evaluation-rubric.test.ts`

Expected: PASS.

### Task 2: Built-In Rubric Library

**Files:**
- Modify: `src/shared/evaluation-templates.ts`
- Modify: `src/shared/evaluation-templates.test.ts`

- [ ] **Step 1: Strengthen template tests**

Require every LLM Judge template to include a rubric with version `1`, at least two checks, at least two steps, exactly five ordered anchors, and source metadata.

```ts
for (const template of llmTemplates) {
  expect(template.rubric?.anchors.map((anchor) => anchor.score)).toEqual([
    0, 0.25, 0.5, 0.75, 1,
  ]);
  expect(template.rubric?.source?.url).toMatch(/^https:\/\//);
}
```

- [ ] **Step 2: Run tests and verify current templates fail**

Run: `npm test -- --run src/shared/evaluation-templates.test.ts`

Expected: FAIL because templates only have prompt strings.

- [ ] **Step 3: Replace template prompts with complete rubrics**

Create helpers for five-anchor rubrics and adapt the current dimensions using licensed framework patterns. Add supported dimensions for laziness, fairness, PII leakage, and injection resistance. Do not add Plan Adherence without trace data.

- [ ] **Step 4: Run rubric and template tests**

Run: `npm test -- --run src/shared/evaluation-rubric.test.ts src/shared/evaluation-templates.test.ts`

Expected: PASS.

### Task 3: Persistence and Runner Contract

**Files:**
- Modify: `src/main/hub/persisted/sqlite-schema.ts`
- Modify: `src/main/evaluation-store.ts`
- Modify: `src/main/evaluation-store.test.ts`
- Modify: `src/main/evaluation-runner.ts`
- Modify: `src/main/evaluation-runner.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write failing persistence and runner tests**

Verify rubric JSON round-trips through SQLite. Verify the runner omits undeclared inputs, fails explicitly when required data is missing, snaps scores to a five-level anchor, and preserves `evidence` and `failedCriteria`.

```ts
expect(saved.rubric).toEqual(rubric);
expect(judgePrompt).not.toContain("Ground truth:");
expect(score).toMatchObject({ score: 0.75, evidence: ["quoted span"] });
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/main/evaluation-store.test.ts src/main/evaluation-runner.test.ts`

Expected: FAIL on missing columns and old prompt assembly.

- [ ] **Step 3: Add normalized persistence columns**

Add `rubric_json` to `evaluation_evaluators`, plus `evidence_json` and `failed_criteria_json` to `evaluation_scores`. Use `ensureColumn` for existing databases and JSON parse/stringify only at the store boundary.

- [ ] **Step 4: Compile rubrics and parse structured Judge output**

Use `compileEvaluationRubric` in the runner. Return a score of zero with an explicit reason when required values are absent. Parse:

```json
{"score":0.75,"reason":"Minor redundancy","evidence":["The answer is..."],"failedCriteria":["no-redundancy"]}
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/main/evaluation-store.test.ts src/main/evaluation-runner.test.ts`

Expected: PASS.

### Task 4: Structured Evaluator Editor

**Files:**
- Create: `src/renderer/src/pages/evaluation/EvaluatorRubricEditor.tsx`
- Modify: `src/renderer/src/pages/evaluation/EvaluatorWorkspace.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `src/renderer/src/App.layout.test.tsx`

- [ ] **Step 1: Write failing renderer assertions**

Render a built-in rubric and require visible Objective, Inputs, Checks, Evaluation steps, Score anchors, Special rules, Source, and Prompt preview sections.

- [ ] **Step 2: Run the layout test and verify failure**

Run: `npm test -- --run src/renderer/src/App.layout.test.tsx`

Expected: FAIL because the editor is still a single textarea.

- [ ] **Step 3: Build the structured editor**

Use compact workbench sections, checkboxes for required inputs, editable text rows for checks/steps/rules, fixed score labels for the five anchors, source metadata, and a collapsed compiled-prompt preview. Keep custom instructions in a separate textarea.

- [ ] **Step 4: Add scoped styles**

Match existing workbench spacing, typography, borders, and controls. Avoid nested cards; anchors render as a compact table-like list.

- [ ] **Step 5: Run renderer tests**

Run: `npm test -- --run src/renderer/src/App.layout.test.tsx`

Expected: PASS.

### Task 5: Verification and Commit

**Files:**
- Verify all files above.

- [ ] **Step 1: Run focused evaluation tests**

Run: `npm test -- --run src/shared/evaluation-rubric.test.ts src/shared/evaluation-templates.test.ts src/main/evaluation-store.test.ts src/main/evaluation-runner.test.ts src/renderer/src/App.layout.test.tsx`

Expected: all tests pass.

- [ ] **Step 2: Run typecheck and production build**

Run: `npm run typecheck && npm run build`

Expected: both commands exit successfully.

- [ ] **Step 3: Inspect the diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors and only rubric-related files are modified.

- [ ] **Step 4: Commit without pushing**

```bash
git add src/shared src/main src/renderer/src docs/superpowers/plans/2026-07-12-structured-evaluator-rubrics.md
git commit -m "Add structured Evaluator rubrics"
```
