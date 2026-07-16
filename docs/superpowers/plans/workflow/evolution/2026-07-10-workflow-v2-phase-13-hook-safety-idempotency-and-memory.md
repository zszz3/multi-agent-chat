# Workflow V2 Phase 13 Hook Safety, Idempotency, And Memory Implementation Plan

> Requires verified Phase 12. Read the [Phase 13 spec](../../../specs/workflow/evolution/2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md).

**Status:** Proposed; not implemented.

**Goal:** Enforce Hook capabilities and deterministic replay through durable receipts, safe files, and scoped persisted memory.

**Primary files:**

- Extend shared Hook/storage/event contracts
- Refactor `workflow-v2-hooks.ts` registry metadata
- Refactor `workflow-v2-hook-host.ts`
- Create `workflow-v2-hook-receipt-store.ts`
- Create `workflow-v2-hook-file-adapter.ts`
- Create `workflow-v2-memory-store.ts`
- Integrate durability/cache/recovery/budget/task policy

---

## Task 1: Effect Metadata And Registry

- [ ] Add shared bounded `WorkflowV2HookJsonValue` and `WorkflowV2HookReplayResult` contracts; keep main-only handler types out of persisted/shared receipts.
- [ ] Add effect class, capability requirement, replay policy, registry version, and action hash types/validators.
- [ ] Assign immutable metadata to every built-in action.
- [ ] Reject definitions trying to override safety metadata.
- [ ] Keep lifecycle/source/failure and forbidden routing/review validation.
- [ ] Add exhaustive registry matrix tests.
- [ ] Commit: `feat(workflow): classify hook effects`.

## Task 2: Receipt State Machine

- [ ] Add receipt contract and deterministic id helper.
- [ ] Implement generation-safe reserve/running/succeeded/failed/skipped transitions in schema 2 storage.
- [ ] Reject invalid transitions, action-hash mismatch, stale generation, and cross-attempt reuse.
- [ ] Record bounded result/error hashes/payloads needed for deterministic replay.
- [ ] Persist an allowlisted inline handler result or checksummed result artifact; never rely on resultHash alone for replay.
- [ ] Adapt main-process handler output into `WorkflowV2HookReplayResult`; reject unsupported keys, non-finite/deep/oversized values, and graph/review/routing fields before persistence.
- [ ] Add transition, restart, duplicate, corruption, and crash tests.
- [ ] Commit: `feat(workflow): persist hook execution receipts`.

## Task 3: Receipt-Aware Chain Execution

- [ ] Before each action, load/reserve receipt.
- [ ] Reuse succeeded pure/read/durable-write result without repeating handler.
- [ ] Persist running before write effect and succeeded before moving to the next action.
- [ ] On ambiguous prior running write, pause for reconciliation rather than retry.
- [ ] Add effect-adapter reconciliation for applied/not_applied/conflict/unknown before any durable write replay.
- [ ] Preserve fail_node/pause_run/skip_hook semantics with receipt events.
- [ ] Test crash before/after handler and before/after receipt commit for every effect class.
- [ ] Test matching file hash, conflicting file content, memory idempotency generation, unknown effect, and stored-result replay.
- [ ] Commit: `feat(workflow): make hook replay deterministic`.

## Task 4: Enforce Isolated llmHook

- [ ] Route through Phase 10 Hook model route and budgeted task start.
- [ ] Require tools/filesystem/network/process none from Phase 08 capabilities.
- [ ] Reject runtime lacking no-tool enforcement before task creation.
- [ ] On recovery, reconcile the original TaskRun/ledger entry; never silently start a second llmHook call for one running receipt.
- [ ] Bound prompt/context/output and validate finite JSON schema.
- [ ] Keep graph/review/control fields forbidden at definition, handler, and parsed-output boundaries.
- [ ] Add negative tests with attempted tool/control outputs and capability mismatch.
- [ ] Commit: `security(workflow): isolate llm hooks`.

## Task 5: Safe File Adapter

- [ ] Implement realpath root, safe relative parsing, segment walk, symlink/reparse rejection, restrictive directory creation, no-follow target open, temp fsync, atomic rename, and final containment check.
- [ ] Bind receipt/approval to normalized path and content hash.
- [ ] Test POSIX symlink, Windows drive/UNC/reparse abstraction, parent replacement race via fault injection, existing file replacement, cancellation, permission error, and successful nested write.
- [ ] Never fall back to ordinary `writeFile` after a no-follow/platform failure.
- [ ] Commit: `security(workflow): harden hook file writes`.

## Task 6: Scoped Memory Store

- [ ] Add node/run/workflow key and value envelope with schema/generation/bounds.
- [ ] Persist node/run memory for recovery and workflow memory across runs.
- [ ] Require authored permission/approval for workflow writes.
- [ ] Use expected generation and reject stale writes.
- [ ] Remove in-process Map as authoritative memory; optional cache must invalidate from generation.
- [ ] Test isolation, persistence, concurrent writes, bounds, missing values, recovery, retention, and unauthorized workflow writes.
- [ ] Commit: `feat(workflow): persist scoped hook memory`.

## Task 7: Cache, Recovery And Failure Integration

- [ ] Add Hook definition/registry/effect/memory generation inputs to fingerprints.
- [ ] Block cache reuse for ambiguous receipts.
- [ ] Reconcile receipts before resuming node lifecycle.
- [ ] Add typed receipt/effect/memory events and public bounded diagnostics.
- [ ] Test retry/new attempt ids, resumed same attempt, cache hit/miss, failure policies, intervention resolution, and migration from Phase 06 hookVariables.
- [ ] Commit: `feat(workflow): recover hook effects safely`.

## Task 8: Verification

```bash
git diff --check
npm run typecheck
npm test -- --run src/shared/workflow-v2/hooks.test.ts src/main/workflows/v2/workflow-v2-hooks.test.ts src/main/workflows/v2/workflow-v2-hook-receipt-store.test.ts src/main/workflows/v2/workflow-v2-hook-file-adapter.test.ts src/main/workflows/v2/workflow-v2-memory-store.test.ts src/main/workflows/workflow-runtime.test.ts
npm test
npm run build
```

- [ ] Receipt crash matrix proves no duplicate durable write.
- [ ] Ambiguous effects pause instead of guessing.
- [ ] llmHook has enforced no-effect capability.
- [ ] File escape/race tests fail closed.
- [ ] Memory scopes survive/restrict exactly as specified.
- [ ] Commit/push effect/idempotency matrix before Phase 14.
