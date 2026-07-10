# Workflow V2 Phase 10 Model Routing, Budget Ledger, And Context Implementation Plan

> Requires verified Phase 09. Read the [Phase 10 spec](../../../specs/workflow/evolution/2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md).

**Status:** Proposed; not implemented.

**Goal:** Freeze actual routes, charge every model task, enforce all budgets, and complete context overflow policies.

**Primary files:**

- Extend shared planning/storage/error contracts
- Create `workflow-v2-model-router.ts`
- Create `workflow-v2-budget-ledger.ts`
- Create `workflow-v2-tokenizer.ts`
- Create/refine `workflow-v2-context-service.ts`
- Modify planner/coordinator/task service/reviewer/supervisor/hook host/recovery/cache
- Add minimal budget/context intervention projection cross-layer

---

## Task 1: Resolved Model Routes

- [ ] Add `WorkflowV2ResolvedModelRoute` validation and stable hash helpers.
- [ ] Implement a pure router from role/profile + configured agents/channels/models + capabilities to one actual route.
- [ ] Fail on zero or ambiguous route; no default-model fallback.
- [ ] Resolve worker/reviewer/supervisor/summarizer/hook routes during plan freeze.
- [ ] Persist route revision/capability hash in plan/task packets and fingerprints.
- [ ] Revalidate route at run/node start and produce typed configuration intervention on drift.
- [ ] Add tests for defaults, overrides, missing agent/channel/model, ambiguous mappings, capability mismatch, drift, and escalation.
- [ ] Commit: `feat(workflow): freeze executable model routes`.

## Task 2: Ledger Contracts And Atomic Reservation

- [ ] Add ledger/entry/call-kind/summary types with finite integer counters and integer cost micros.
- [ ] Create durable ledger adapter behind durability coordinator.
- [ ] Store the self-versioned ledger at `workflows/<workflowId>/runs/<runId>/budget-ledger.json`; do not bump core run-state schema before Phase 12.
- [ ] Reserve with stable entry id and expected generation before task creation.
- [ ] Mark started after TaskRun identity is known; settle from usage metadata; release only when creation provably never started.
- [ ] Reconcile ambiguous started entries against persisted TaskRun/runtime conversation during recovery.
- [ ] Add tests for duplicate reserve, crash at each transition, retry, resume, cleanup failure, and conservative unknown usage.
- [ ] Commit: `feat(workflow): add durable budget ledger`.

## Task 3: Charge Every Model Call

- [ ] Route worker, reviewer, progress probe, supervisor, summarizer, and llmHook starts through one budgeted task-start API.
- [ ] Remove direct model task starts that bypass reservation.
- [ ] Add call-kind and node/attempt identity to events/projections.
- [ ] Test exact call counts for simple run, reviewed run, supervised extension, summarization, Hook, retry, and recovery.
- [ ] Verify zero remaining budget prevents task creation.
- [ ] Commit: `refactor(workflow): centralize budgeted model tasks`.

## Task 4: Token And Cost Enforcement

- [ ] Define tokenizer interface keyed by runtime/provider/model/version.
- [ ] Add provider/runtime usage metadata plumbing without leaking raw provider responses.
- [ ] Enforce prompt count before create and completion limit through provider option or reliable stream interruption.
- [ ] Mark routes incapable when strict completion control cannot be enforced.
- [ ] Version cost tables and calculate integer micros.
- [ ] Include cleanup/control time in wall-clock enforcement.
- [ ] Test Unicode, tool/schema tokens, boundary-equal limits, one-token overflow, unsupported tokenizer/control, and recovery accounting.
- [ ] Commit: `feat(workflow): enforce token and cost budgets`.

## Task 5: Structured Context Assembly

- [ ] Convert task packet/context inputs into attributed segments with required/priority/truncatable metadata.
- [ ] Preserve objective, acceptance, constraints, output schema, and safety segments unconditionally.
- [ ] Deduplicate and trim optional segments deterministically.
- [ ] Count the fully rendered prompt, not only source fragments.
- [ ] Return assembly result with omitted/summarized provenance.
- [ ] Add unit/property tests for deterministic ordering, required preservation, direct-upstream only, evidence limits, Unicode, and exact fit.
- [ ] Commit: `feat(workflow): assemble attributed bounded context`.

## Task 6: Summarize And Ask-Human Policies

- [ ] Add one structured summarizer request/response schema and route.
- [ ] Reserve summarizer budget before call; never recursively summarize.
- [ ] Validate summary provenance and bounded output, then reassemble/recount.
- [ ] Convert unresolved `summarize` overflow and `ask_human` directly into typed `context_budget` intervention.
- [ ] Extend the typed resolution request with hash-bound `contextResolution`; permit only optional omissions/truncation that main recomputes within the frozen budget.
- [ ] Limit `budget_exhausted` to skip/replan and reject continue/escalate/budget mutation.
- [ ] Add renderer text/action projection through existing unified intervention surface.
- [ ] Remove generic “fallback unavailable” error branches only after tests prove replacements.
- [ ] Test summarizer failure, malformed output, budget exhaustion, still-too-large result, ask-human continue/replan, and no transcript leakage.
- [ ] Test stale assembly hash, required-segment omission, renderer-invented token counts, and attempted budget/route mutation.
- [ ] Commit: `feat(workflow): complete context overflow policies`.

## Task 7: Cache And Recovery Integration

- [ ] Include actual route, tokenizer/version, policy, summarized-input hash, and relevant ledger policy in fingerprints.
- [ ] Persist ledger and context assembly evidence required for recovery.
- [ ] Reconcile started tasks and avoid double reservation/charge.
- [ ] Invalidate cache on route/policy/context behavior changes.
- [ ] Add recovery/cache tests for every changed fingerprint dimension.
- [ ] Commit: `feat(workflow): recover route and budget state`.

## Task 8: Verification

```bash
git diff --check
npm run typecheck
npm test -- --run src/shared/workflow-v2 src/main/workflows/v2 src/main/workflows/workflow-runtime.test.ts src/main/hub/agent-hub.test.ts src/preload/index.test.ts src/renderer/src/App.layout.test.tsx
npm test
npm run build
```

- [ ] Every model call kind appears in ledger tests.
- [ ] Every budget field is mechanically enforced.
- [ ] Route drift/failure never silently falls back.
- [ ] `summarize` and `ask_human` are real flows, not generic errors.
- [ ] Required context and packet boundaries remain intact.
- [ ] Commit/push with route/budget/context matrices before Phase 11.
