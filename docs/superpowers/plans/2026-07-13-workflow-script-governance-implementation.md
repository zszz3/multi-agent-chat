# Workflow Script Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary script allowlist with typed script inputs, risk-based permission decisions, mandatory adversarial Workflow review, and a unified node-window UI.

**Architecture:** Workflow definitions own the authored script contract and Manager risk. Static analysis and the selected Reviewer Agent produce revision-bound assessments; confirmation freezes their maximum as the executable permission profile. Runtime resolves declared parameters, pauses only for missing user values or required permission, and executes through one authorization-aware runner.

**Tech Stack:** TypeScript, Electron IPC, React, Vitest, Workflow V2 planner/scheduler/runtime, Codex and Claude configured-agent routing.

---

## Phase 1: Delete Temporary Script Policy

### Task 1: Replace legacy script vocabulary

**Files:**
- Modify: `src/shared/workflow-v2/definition.ts`
- Modify: `src/shared/workflow-v2/validation.ts`
- Modify: `src/shared/workflow-v2/templates.ts`
- Modify: `src/main/workflows/workflow-runtime-ports.ts`
- Delete: `src/main/workflows/v2/workflow-v2-script-policy.ts`
- Delete: `src/main/workflows/v2/workflow-v2-script-policy.test.ts`
- Test: `src/shared/workflow-v2/validation.test.ts`

- [ ] Add failing contract tests proving `sandboxMode`, `script.access`, `script.input`, and `approved: boolean` no longer exist.
- [ ] Introduce canonical risk, capability, executable, parameter, analysis, and authorization types.
- [ ] Update definition validation and template expansion to accept only the new contract.
- [ ] Replace the runtime port boolean with a frozen authorization object.
- [ ] Delete the command allowlist policy and all legacy error paths.
- [ ] Run focused validation and runtime type tests.
- [ ] Commit as `refactor(workflow): remove legacy script policy`.

## Phase 2: Typed Script Parameters

### Task 2: Resolve declared parameter sources

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-script-input.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-input.test.ts`
- Modify: `src/shared/workflow-v2/definition.ts`
- Modify: `src/shared/workflow-v2/packets.ts`
- Modify: `src/shared/workflow/run.ts`
- Modify: `src/main/workflows/v2/workflow-v2-run-executor.ts`
- Modify: `src/main/workflows/workflow-runtime.ts`

- [ ] Add failing tests for literal, workflow, direct-upstream, and user parameter resolution.
- [ ] Add type validation and redacted secret value representation.
- [ ] Persist run-scoped resolved node input separately from authored contracts.
- [ ] Move script nodes with missing required user values to `awaiting_input`.
- [ ] Route submitted values through the existing node conversation command surface.
- [ ] Freeze resolved values when execution begins.
- [ ] Commit as `feat(workflow): add typed script inputs`.

## Phase 3: Risk and Permission Engine

### Task 3: Analyze side effects and authorize execution

**Files:**
- Create: `src/main/workflows/v2/workflow-v2-script-analysis.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-analysis.test.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-permission.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-permission.test.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-executor.ts`
- Create: `src/main/workflows/v2/workflow-v2-script-executor.test.ts`
- Modify: `src/main/workflows/workflow-runtime-ports.ts`
- Modify: `src/main/workflows/v2/workflow-v2-script-runner.ts`
- Modify: `src/main/workflows/v2/workflow-v2-run-executor.ts`
- Modify: `src/main/hub/agent-hub.ts`

- [ ] Add failing tests for each semantic capability and minimum risk.
- [ ] Compute effective risk as the maximum of Manager, Reviewer, and static assessments.
- [ ] Scope grants to workflow revision, run, node, and capability digest.
- [ ] Auto-allow `safe` and `read`; pause `write` and `dangerous` for confirmation.
- [ ] Execute restricted in-process transforms without shell and spawn external executables only with declared capabilities.
- [ ] Persist permission requests, decisions, and redacted audit records.
- [ ] Commit as `feat(workflow): add script permission engine`.

## Phase 4: Mandatory Adversarial Review

### Task 4: Add revision-bound Reviewer state

**Files:**
- Create: `src/shared/workflow-v2/generation-review.ts`
- Create: `src/main/workflows/v2/workflow-v2-generation-review.ts`
- Create: `src/main/workflows/v2/workflow-v2-generation-review.test.ts`
- Modify: `src/shared/workflow/draft.ts`
- Modify: `src/shared/workflow/commands.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-draft.ts`
- Modify: `src/main/hub/agent-hub.ts`
- Modify: `src/main/app/index.ts`
- Modify: `src/preload/index.ts`

- [ ] Add failing state tests for route changes, stale reviews, failed reviews, and draft mutations.
- [ ] Store independent Manager and Reviewer Agent/model routes.
- [ ] Run the Reviewer through the same configured-agent runtime boundary used by planning conversations.
- [ ] Parse and validate the structured approve/revise result and per-script risk.
- [ ] Persist review activity and expose retry commands.
- [ ] Require an approved current review before confirmation.
- [ ] Commit as `feat(workflow): require adversarial draft review`.

### Task 5: Strengthen Manager and Reviewer prompts

**Files:**
- Modify: `src/shared/workflow-agent.ts`
- Modify: `src/main/hub/runtime/executor/workflow/agent-executor-workflow-shared.ts`
- Create: `src/main/workflows/v2/workflow-v2-generation-review-prompt.ts`
- Create: `src/main/workflows/v2/workflow-v2-generation-review-prompt.test.ts`

- [ ] Add prompt tests for minimum sufficient decomposition, typed parameters, capabilities, risk rationale, concrete failure paths, and anti-nitpicking rules.
- [ ] Update Manager prompt to author the complete new script contract.
- [ ] Add dedicated Reviewer system and user prompts.
- [ ] Remove obsolete sandbox and approval wording.
- [ ] Commit as `refactor(workflow): separate manager and reviewer prompts`.

## Phase 5: Node Window and Workflow Controls

### Task 6: Add Reviewer selection and report UI

**Files:**
- Modify: `src/renderer/src/pages/workflow/workflow-controller.ts`
- Modify: `src/renderer/src/pages/workflow/hooks/useWorkflowFeatureController.ts`
- Modify: `src/renderer/src/pages/workflow/WorkflowPage.tsx`
- Modify: `src/renderer/src/pages/workflow/workflow-text.ts`
- Test: `src/renderer/src/pages/workflow/WorkflowPage.test.tsx`

- [ ] Add failing tests for independent Reviewer selection and confirmation gating.
- [ ] Add Reviewer Agent/model selectors beside Manager routing.
- [ ] Display review status, blocking findings, and retry action.
- [ ] Disable confirmation for missing, stale, failed, or revise reviews.
- [ ] Commit as `feat(workflow): add adversarial review controls`.

### Task 7: Build Apifox-style script node editor

**Files:**
- Create: `src/renderer/src/pages/workflow/WorkflowScriptNodePanel.tsx`
- Create: `src/renderer/src/pages/workflow/WorkflowScriptNodePanel.test.tsx`
- Modify: `src/renderer/src/pages/workflow/WorkflowNodeAgentWindow.tsx`
- Modify: `src/renderer/src/pages/workflow/WorkflowNodeAgentWindow.test.tsx`
- Modify: `src/renderer/src/pages/workflow/WorkflowCanvasBoard.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] Add failing rendering tests for parameter groups and type-specific controls.
- [ ] Add Activity, Inputs, Contract, Permissions, Script, and Output tabs.
- [ ] Add key-value editors for argument, header, query, and environment values.
- [ ] Add JSON/body, stdin, secret, file, directory, and boolean controls.
- [ ] Keep authored contract and run-time input state separate.
- [ ] Render structured JSON outputs instead of escaped text.
- [ ] Prove no legacy workflow-level input surface remains.
- [ ] Commit as `feat(workflow): add script node request editor`.

## Phase 6: Completion Audit

### Task 8: Verify the complete architecture

**Files:**
- Update tests adjacent to every changed module.
- Update: `docs/superpowers/plans/2026-07-13-workflow-script-governance-implementation.md`

- [ ] Run focused tests after every phase.
- [ ] Run `npm test -- --run` and require all tests to pass.
- [ ] Run `npm run typecheck` and require zero errors.
- [ ] Run `npm run build` and require a successful production build.
- [ ] Run `git diff --check`.
- [ ] Search production code for `sandboxMode`, `script.access`, `script.input`, `approved: boolean`, command allowlist symbols, and legacy workflow input panels; require zero matches except migration-free documentation assertions.
- [ ] Manually verify a safe echo script, a read script, a write script requiring confirmation, a dangerous script requiring per-run confirmation, missing user parameters, Reviewer revise, Reviewer approve, and stale-review invalidation.
- [ ] Commit final verification ledger and push the branch.
