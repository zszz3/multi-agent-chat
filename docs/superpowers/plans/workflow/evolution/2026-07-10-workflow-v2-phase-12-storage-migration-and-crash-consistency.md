# Workflow V2 Phase 12 Storage Migration And Crash Consistency Implementation Plan

> Requires verified Phase 11. Read the [Phase 12 spec](../../../specs/workflow/evolution/2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md).

**Status:** Proposed; not implemented.

**Goal:** Migrate schema 1 safely and prove file persistence outcomes across crashes, stale writes, corruption, compaction, and recovery.

**Primary files:**

- Extend `src/shared/workflow-v2/storage.ts`
- Create `src/shared/workflow-v2/events.ts`
- Create schema 1 fixtures under `src/main/workflows/v2/__fixtures__/storage-v1/`
- Refactor `workflow-v2-store.ts`
- Create migration, checksum/envelope, event writer/projector, compaction, and repair modules
- Integrate durability/recovery/startup reconciliation

---

## Task 1: Freeze Schema 1 Fixtures

- [ ] Check in representative completed, running, paused/intervention, reviewed, supervised/checkpointed, cached, Hook-variable, revision, and corrupt/partial fixtures.
- [ ] Verify current schema 1 reader accepts valid fixtures and rejects corrupt ones.
- [ ] Record semantic expectations for every fixture: node states, outputs, event count, control state, conversations, cache/review data.
- [ ] Never generate all fixtures dynamically from current code; retain immutable golden input.
- [ ] Commit: `test(workflow): freeze v1 storage fixtures`.

## Task 2: Schema 2 Envelopes And Manifest

- [ ] Add manifest/envelope/checksum/generation validators.
- [ ] Store workflow manifests at `workflows/<workflowId>/manifest.json`; keep the cross-workflow `locks/registry.json` in a separately authoritative root envelope.
- [ ] Define reference/generation reconciliation between manifests and run, route/capability, ledger, revision, event, receipt, and artifact records.
- [ ] Use canonical serialization for checksum; document key ordering and encoding.
- [ ] Keep payload bounds and finite-JSON checks.
- [ ] Add tests for checksum mismatch, stale generation, malformed envelope, unsafe path, unsupported newer version, and valid schema 2.
- [ ] Commit: `feat(workflow): define storage schema v2`.

## Task 3: Crash-Safe Atomic Writer

- [ ] Extract a writer with injectable filesystem/fault points.
- [ ] Implement temp create, write, file fsync, close, replacement rename, directory fsync, generation update, and cleanup in spec order.
- [ ] Implement documented Windows replacement behavior with platform tests/mocks.
- [ ] Preserve last valid target on every failure.
- [ ] Add fault injection after every step; reopen a new store and assert old/new/quarantine outcome.
- [ ] Commit: `feat(workflow): harden atomic state writes`.

## Task 4: Migration Registry And Transaction

- [ ] Implement ordered migration registry and pure v1->v2 transformations for run/cache/events plus Phase 08 capability snapshots and Script approval/launch journals, Phase 09 lock registry, Phase 10 ledgers/routes, and Phase 11 revision/lineage state where present.
- [ ] Inventory standalone artifacts before copying; fail validation if a referenced evolution artifact is omitted, orphaned, or left on an incompatible envelope.
- [ ] Migrate to staging directory with report and per-file validation.
- [ ] Implement resume/rollback for copy, validate, and commit stages.
- [ ] Preserve backup until successful next startup/retention boundary.
- [ ] Test every golden fixture, interrupted stage, repeat migration, newer schema, and rollback.
- [ ] Compare semantic expectations rather than raw formatting only.
- [ ] Commit: `feat(workflow): migrate v1 workflow storage`.

## Task 5: Typed Event Union And Writer

- [ ] Inventory every event string emitted by Workflow V2.
- [ ] Define discriminated events with bounded typed payloads and validators.
- [ ] Replace emitters/readers/projections incrementally; reject unknown current-schema types.
- [ ] Add eventId idempotency, sequence CAS, checksum/partial-line detection, and per-run serialized writer.
- [ ] Add compatibility mapping for schema 1 event strings during migration only.
- [ ] Test duplicate id, sequence gap/duplicate, competing append, partial final line, invalid payload, and redaction.
- [ ] Commit: `feat(workflow): type durable workflow events`.

## Task 6: Snapshot, Compaction, Cache And Retention

- [ ] Build deterministic event projector and snapshot with last included sequence.
- [ ] Write/validate snapshot before dropping compacted events.
- [ ] Preserve audit-critical events per retention policy.
- [ ] Validate cache artifact hashes/existence before reuse.
- [ ] Add deterministic size/age eviction excluding active/paused recovery artifacts.
- [ ] Test crash during snapshot/replace/delete, rebuild equivalence, corrupt cache isolation, and retention boundaries.
- [ ] Commit: `feat(workflow): compact workflow history safely`.

## Task 7: Generation Conflicts And Startup Repair

- [ ] Require expected generation for state/event/receipt/ledger/revision writes.
- [ ] Add typed reconciliation for stale checkpoint versus newer intervention/completion.
- [ ] Classify temp/backup/migration/corruption/newer-version cases at startup.
- [ ] Restore valid backup or quarantine only affected run/cache and project actionable public state.
- [ ] Test concurrent async writes and every startup classification.
- [ ] Commit: `feat(workflow): reconcile durable generations`.

## Task 8: Full Crash Matrix And Verification

Create a table in the completion record mapping every fault point to expected reopened outcome.

```bash
git diff --check
npm run typecheck
npm test -- --run src/shared/workflow-v2/storage.test.ts src/main/workflows/v2/workflow-v2-store.test.ts src/main/workflows/v2/workflow-v2-recovery.test.ts src/main/hub/workflow/agent-hub-workflow-restore.test.ts
npm test
npm run build
```

- [ ] All schema 1 valid fixtures migrate without semantic loss.
- [ ] Every crash fault has one asserted authoritative outcome.
- [ ] Typed events cover all emitters/projectors.
- [ ] Stale writes cannot overwrite newer state.
- [ ] Compaction/retention cannot break active recovery/audit.
- [ ] Commit/push migration and compatibility matrix before Phase 13.
