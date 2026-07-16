# Workflow V2 Phase 11 Revision And Replan Lifecycle Implementation Plan

> Requires verified Phase 10. Read the [Phase 11 spec](../../../specs/workflow/evolution/2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md).

**Status:** Proposed; not implemented.

**Goal:** Convert replan into a durable, validated, hash-bound revision approval flow that creates one new graphVersion and run lineage.

**Primary files:**

- Create shared revision contracts/validators under `src/shared/workflow-v2/`
- Create `src/main/workflows/v2/workflow-v2-revision-service.ts`
- Create `src/main/workflows/v2/workflow-v2-revision-store.ts`
- Create pure graph/plan diff and impact modules
- Modify intervention service, planner, recovery, coordinator, AgentHub, shared IPC, preload, renderer controller/page

---

## Task 1: Characterize Existing Replan

- [ ] Keep/add a test proving current replan records an intervention, stops the old run, does not mutate plan, and starts no task.
- [ ] Capture old plan/run hashes before and after.
- [ ] Run runtime/intervention tests and record baseline.
- [ ] Do not remove this behavior until revision drafting persistence is available.

## Task 2: Revision Contracts And State Machine

- [ ] Add revision status/change/draft/approval/apply request types and validators from the spec.
- [ ] Bound every string/array and validate graphVersion monotonicity, identity, hashes, timestamps, and status-specific fields.
- [ ] Implement a pure transition function rejecting invalid/repeated transitions.
- [ ] Add exhaustive transition-table tests and finite-JSON clone tests.
- [ ] Reuse `WorkflowV2GraphRevision` where compatible; avoid two contradictory revision identities.
- [ ] Commit: `feat(workflow): define revision lifecycle contracts`.

## Task 3: Separate Revision Store

- [ ] Implement `workflows/<workflowId>/revisions/<revisionId>/revision.json` layout with safe path segments and existing atomic writer.
- [ ] Add create/read/update-by-expected-status/hash/list methods.
- [ ] Make create/apply idempotent by revision id and proposed plan hash.
- [ ] Add corruption, missing, duplicate, stale update, atomic failure, and restart tests.
- [ ] Do not bump run-state schema before Phase 12.
- [ ] Commit: `feat(workflow): persist revision drafts`.

## Task 4: Drafting Through Normal Planning Gates

- [ ] Build orchestrator input from old frozen plan, intervention reason, structured outputs, reviews/progress/blockers, capabilities, routes, and budget policy.
- [ ] Add/validate a one-call revision drafting budget and approved orchestrator route bound to revisionId/parentRunId.
- [ ] Reserve/settle a revision-scoped Phase 10 ledger entry; do not charge an exhausted parent run or unapproved proposed run.
- [ ] Start drafting through the Phase 10 routed/budgeted task API.
- [ ] Parse only authored definition/plan inputs; reject free-form patches and model-claimed approval/validity.
- [ ] Run template compilation, authoring validation, planner, capability resolution, route resolution, and budget checks.
- [ ] Persist each state transition and typed failure.
- [ ] Test malformed model output, invalid DAG, unsupported capability, route drift, budget failure, and successful draft.
- [ ] Test attempted silent second draft call, stale route, exhausted revision budget, and approval binding.
- [ ] Commit: `feat(workflow): draft revisions through planner`.

## Task 5: Deterministic Diff, Impact, And Reuse Preview

- [ ] Normalize old/new plans before diffing.
- [ ] Implement allowlisted node/edge/policy changes with deterministic order.
- [ ] Compute directly changed nodes and descendant/fingerprint impact.
- [ ] Reuse the recovery planner to preview reuse/rerun, but do not materialize or mutate state yet.
- [ ] Compute integer budget deltas and route/capability changes.
- [ ] Ignore model-provided diff identity; use it only as optional bounded explanation.
- [ ] Add tests for add/remove/update, edge changes, indirect descendants, route/review/context changes, and removed outputs.
- [ ] Commit: `feat(workflow): compute revision impact`.

## Task 6: Typed Approval Surface

- [ ] Add shared requests/results for read, approve, reject, and apply revision.
- [ ] Wire AgentHub/main IPC/preload/service/controller and a minimal renderer approval panel.
- [ ] Show old/new graphVersion, normalized diff, impacted/reuse/rerun nodes, capability/route/budget changes, hashes, warnings/errors.
- [ ] Bind approval to revisionId, proposed plan hash, capability hashes, and route revisions.
- [ ] Main revalidates expected status/hash/generation; renderer cannot provide authoritative proposed plan JSON.
- [ ] Test stale/cross-workflow/cross-revision/changed-plan/replayed approvals and rejection.
- [ ] Commit: `feat(workflow): approve graph revisions`.

## Task 7: Apply Revision And Start New Run

- [ ] Persist approved revision and immutable proposed plan before run creation.
- [ ] Materialize fingerprint-safe checkpoint/reuse under proposed graphVersion.
- [ ] Create one new run with parentRunId/revisionId lineage.
- [ ] Append lineage events to old/new histories.
- [ ] Start only after writes succeed; mark applied with newRunId afterward.
- [ ] On start failure, leave approved/unapplied and make retry idempotent.
- [ ] Test crash/failure after every boundary and double apply.
- [ ] Remove the old stop-only terminal behavior only when this full path passes; replan still leaves old run stopped.
- [ ] Commit: `feat(workflow): apply approved revisions`.

## Task 8: Verification

```bash
git diff --check
npm run typecheck
npm test -- --run src/shared/workflow-v2 src/main/workflows/v2 src/main/workflows/workflow-runtime.test.ts src/main/hub/agent-hub.test.ts src/preload/index.test.ts src/renderer/src/App.layout.test.tsx
npm test
npm run build
```

- [ ] Old plan/run immutability is proven by hash assertions.
- [ ] Every revision transition and failure boundary is tested.
- [ ] Approval is hash/capability/route bound.
- [ ] Double apply cannot create duplicate runs.
- [ ] New graphVersion lineage and reuse reasons are visible.
- [ ] Commit/push completion evidence before Phase 12.
