# Workflow V2 Evolution Program Implementation Plan

> Execute Phase 07–14 strictly in order. This plan coordinates phases; it does not replace any phase spec or phase plan.

**Status:** Proposed; Phase 07–14 are not implemented. Unchecked steps are required future work.

**Goal:** Evolve the completed Workflow V2 core into a capability-safe, dynamically scheduled, budget-complete, revision-aware, crash-consistent, idempotent, and observable product.

**Required contract:** [Workflow V2 Evolution Program Contract](../../../specs/workflow/evolution/2026-07-10-workflow-v2-evolution-program.md)

---

## Agent Execution Protocol

For every phase:

1. Read `AGENTS.md` and referenced instructions completely.
2. Read the evolution program spec, target phase spec, and target phase plan completely.
3. Inspect current source and tests; never rely on examples in the plan when current signatures differ.
4. Confirm upstream and user-owned working-tree changes before editing.
5. Add characterization tests before moving behavior.
6. Add failing contract tests before new behavior.
7. Implement the smallest complete behavior that satisfies the full spec, not a test-only stub.
8. Run focused tests after each task and full verification at the phase boundary.
9. Update spec/plan status with actual evidence only after tests pass.
10. Commit and push the phase before starting the next phase.

If an interface choice is not defined, stop and amend the spec. Do not invent a hidden fallback.

## Task 1: Freeze The Baseline

- [ ] Record current branch, upstream SHA, Node/npm versions, platform, and clean/dirty file ownership.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Save test counts and known environment capabilities in the Phase 07 completion record.
- [ ] Confirm Phase 01–06 specs remain implemented and are not reopened by this program.

## Task 2: Execute Serial Phases

- [ ] Complete [Phase 07 Runtime Service Boundaries](2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md).
- [ ] Complete [Phase 08 Execution Capabilities And Script Sandbox](2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md).
- [ ] Complete [Phase 09 Event-Driven Scheduling And Global Locks](2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md).
- [ ] Complete [Phase 10 Model Routing, Budget Ledger, And Context](2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md).
- [ ] Complete [Phase 11 Revision And Replan Lifecycle](2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md).
- [ ] Complete [Phase 12 Storage Migration And Crash Consistency](2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md).
- [ ] Complete [Phase 13 Hook Safety, Idempotency, And Memory](2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md).
- [ ] Complete [Phase 14 Observability, Simulation, And Workflow UX](2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md).

Do not mark a phase complete because its happy-path tests pass. Use the phase completion audit and prove every explicit invariant, failure condition, migration, IPC surface, and acceptance test.

## Task 3: Cross-Phase Compatibility Audit

- [ ] Verify legacy workflow execution still passes its existing suite.
- [ ] Load a schema-version-1 Workflow V2 fixture and migrate it without data loss.
- [ ] Resume a pre-evolution paused run or produce an explicit actionable quarantine result.
- [ ] Verify a plan using unsupported capabilities fails before run creation.
- [ ] Verify an ambiguously started Script attempt is not automatically replayed after restart.
- [ ] Verify two workflows cannot acquire conflicting global locks simultaneously.
- [ ] Verify every model-bearing control task is charged to the correct budget ledger.
- [ ] Verify approved revision creates a new graphVersion/run lineage without mutating the old run.
- [ ] Verify a crash after a Hook side effect does not repeat the effect on recovery.
- [ ] Verify renderer actions are typed IPC requests and raw storage is never exposed.

## Task 4: Final Verification

Run, in order:

```bash
git diff --check
npm run typecheck
npm test
npm run build
```

- [ ] All commands exit `0`.
- [ ] No focused test is skipped without a documented environment reason and a separate capability test.
- [ ] Document links resolve.
- [ ] Every Phase 07–14 spec is `Implemented and verified`.
- [ ] Every Phase 07–14 plan has no unchecked required step.
- [ ] The master completion matrix links each requirement to code and tests.
- [ ] Every ID in `docs/workflow-v2/program/04-evolution-requirement-matrix.md` has direct positive and failure/fault evidence.
- [ ] The branch contains the selected upstream base and is pushed.

## Final Deliverable

Create a completion section in the evolution program spec containing:

- final architecture map
- storage schema and migration matrix
- capability/backend matrix by platform
- routing and budget enforcement matrix
- scheduler/lock invariants
- revision lineage example
- Hook effect/idempotency matrix
- observability and UI surfaces
- exact test/build evidence
- remaining out-of-scope items

Do not declare the program complete while any required phase evidence is missing or indirect.
