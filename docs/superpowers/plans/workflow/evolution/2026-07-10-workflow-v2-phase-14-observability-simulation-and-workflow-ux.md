# Workflow V2 Phase 14 Observability, Simulation, And Workflow UX Implementation Plan

> Requires verified Phase 13. Read the [Phase 14 spec](../../../specs/workflow/evolution/2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md).

**Status:** Proposed; not implemented.

**Goal:** Build safe projections, timeline, metrics, simulation, approval UX, and diagnostics over authoritative typed Workflow V2 state.

**Primary files:**

- Create shared public DTO/request/result contracts
- Create `src/main/workflows/v2/workflow-v2-projector.ts`
- Create `src/main/workflows/v2/workflow-v2-simulator.ts`
- Create `src/main/workflows/v2/workflow-v2-diagnostics.ts`
- Extend AgentHub/main IPC/preload workflow service/controller
- Add focused renderer components under `src/renderer/src/pages/workflow/`

---

## Task 1: Projection Contracts And Redaction

- [ ] Add overview/node/timeline/budget/cache/lock/revision/diagnostic DTOs with validators and bounds.
- [ ] Define explicit redaction policy for prompts, environment, credentials, user files, runtime conversations, errors, and artifacts.
- [ ] Implement pure projector from schema 2 snapshot + typed events.
- [ ] Detect sequence gaps, duplicates, unsupported payloads, and partial history.
- [ ] Add fixture tests for every event variant, redaction, bounds, ordering, and stable output.
- [ ] Commit: `feat(workflow): project observable run state`.

## Task 2: Paginated Timeline IPC

- [ ] Add typed list/read requests with run identity, stable sequence cursor, limit, and request id.
- [ ] Main validates run access/identity and projects bounded pages.
- [ ] Preload exposes narrow methods; no raw file/event API.
- [ ] Renderer service/controller cancels stale requests and deduplicates by eventId/sequence.
- [ ] Test pagination, cursor edges, gaps, run switch races, missing/quarantined history, and preload compatibility.
- [ ] Commit: `feat(workflow): expose typed run timeline`.

## Task 3: Deterministic Metrics

- [ ] Compute queue/lock/execution/validation/review/intervention durations from typed timestamps.
- [ ] Compute attempts/probes/extensions, ledger usage/cost, context actions, cache reasons, Hook replay, and recovery source.
- [ ] Define incomplete/unknown semantics; never invent zero for missing evidence.
- [ ] Add deterministic fixture tests and aggregation bounds.
- [ ] Keep metrics read-only; add a test proving no runtime dependency on metric module.
- [ ] Commit: `feat(workflow): derive run metrics`.

## Task 4: Authoritative Dry-Run Simulator

- [ ] Compose existing template compiler, validators, planner, capability resolver, route resolver, budget estimator, context assembler, lock analyzer, and cache/recovery preview.
- [ ] Stub/forbid worker, Script, reviewer, Hook write, and external side effects.
- [ ] Return typed report with plan hash, deterministic failures/warnings, critical path, parallelism, locks, budget/context, reuse, and approvals.
- [ ] Add parity tests showing deterministic simulation failures equal plan-freeze failures.
- [ ] Test no task/process/file/memory side effect occurs.
- [ ] Commit: `feat(workflow): simulate plans without effects`.

## Task 5: Plan And Revision Approval UX

- [ ] Add plan approval panel showing graph, acceptance, capabilities, routes, budget, locks, Script/effect policy, simulation results, and approval hashes.
- [ ] Add revision panel showing normalized diff, impact, reuse/rerun, route/capability/budget changes, warnings, and status.
- [ ] Submit only typed approve/reject requests with expected hash/generation.
- [ ] Handle loading, stale, changed, conflict, error, and success states.
- [ ] Add keyboard/focus/non-color/a11y tests and main rejection tests for stale UI state.
- [ ] Commit: `feat(workflow): add plan and revision approval ux`.

## Task 6: Run Timeline And Diagnostics UX

- [ ] Add virtualized/paginated timeline grouped by node/attempt with stable sequence.
- [ ] Show locks, route, bounded usage, validation/review, probe/supervisor, budget, cache/recovery, Hooks, intervention, migration/quarantine.
- [ ] Show incomplete-history warning on sequence gaps.
- [ ] Implement redacted diagnostic bundle generation in main and save/reveal through existing safe file APIs.
- [ ] Exclude secrets, full prompts/files, and native conversations by default; add explicit manifest of omitted fields.
- [ ] Test bundle contents/redaction and timeline large-data behavior.
- [ ] Commit: `feat(workflow): add timeline and diagnostics`.

## Task 7: End-To-End And Performance Proof

- [ ] Add cross-layer tests for plan approval, unsupported Script, global lock wait, budget intervention, summarization, revision approval/apply, migrated run, Hook replay, and quarantine.
- [ ] Add large bounded history fixture and assert projection/page/render timing threshold selected for CI stability.
- [ ] Test old preload compatibility or provide a version-gated actionable failure.
- [ ] Verify renderer never imports store/event/receipt implementation modules.
- [ ] Run accessibility checks available in project; add mechanical aria/focus tests where full tooling is absent.
- [ ] Commit: `test(workflow): prove observable workflow ux`.

## Task 8: Verification And Evolution Program Final Audit

Run:

```bash
git diff --check
npm run typecheck
npm test
npm run build
```

- [ ] All commands exit `0`.
- [ ] Every Phase 07–14 spec requirement maps to current code and a direct test.
- [ ] Every phase plan has exact command/commit evidence.
- [ ] Schema migration, capability backend, route/budget, scheduler/locks, revision lineage, Hook idempotency, projection/redaction, and platform matrices are complete.
- [ ] Document links resolve and indexes reflect current/proposed/completed status.
- [ ] Upstream synchronization and pushed branch are verified.
- [ ] Update evolution program spec to `Implemented and verified` only after the requirement-by-requirement audit succeeds.
