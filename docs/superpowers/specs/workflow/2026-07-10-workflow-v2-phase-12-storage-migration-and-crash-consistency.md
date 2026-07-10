# Workflow V2 Phase 12: Storage Migration And Crash Consistency

## 2026-07-10

### Status

Proposed. Requires completed Phase 11.

### Objective

Evolve file-system-first persistence from strict schema-version rejection into a migratable, checksummed, generation-safe, typed-event store with explicit crash recovery, compaction, quarantine, and retention behavior.

### Required Preconditions

- revision records and run lineage exist
- durability is isolated behind Phase 07 service boundaries
- scheduler and budget ledger define authoritative write ordering
- version-1 fixtures for run state/cache/events are checked into tests

### Storage Manifest

Introduce a workflow-level manifest at `workflows/<workflowId>/manifest.json`:

```ts
export interface WorkflowV2StorageManifest {
  schemaVersion: 2;
  workflowId: string;
  generation: number;
  createdAt: number;
  updatedAt: number;
  lastCompactedEventSequence: number;
  activeMigration?: {
    migrationId: string;
    fromVersion: number;
    toVersion: number;
    startedAt: number;
    stage: "copy" | "validate" | "commit";
  };
}
```

The store root may also contain operational artifacts that are not owned by one workflow: the Phase 09 lock registry remains at `locks/registry.json`, has its own envelope/generation, and is included in schema-2 startup repair. Per-run Phase 08 Script approval/launch journals, Phase 10 budget ledgers, and Phase 11 revision records remain under their existing workflow/run/revision identities. Migration must discover and transform all Phase 08–11 standalone artifacts; it may not migrate run state while silently leaving their capability snapshots, Script journals, lock registry, budget ledgers, or revision lineage on incompatible envelopes.

The workflow manifest is the atomic authority for that workflow's active generation. The root lock-registry envelope is separately authoritative because it coordinates multiple workflows; no workflow manifest may claim ownership of it. Cross-artifact startup reconciliation validates references and generations and quarantines only the smallest unsafe scope.

Authoritative JSON envelopes include schema version, generation, content checksum, writtenAt, and payload. Checksums detect corruption; they are not security signatures.

### Migration Contract

```ts
export interface WorkflowV2StorageMigration {
  id: string;
  fromVersion: number;
  toVersion: number;
  migrate(input: unknown): unknown;
  validate(output: unknown): void;
}
```

Rules:

- migrations are ordered, pure for the same input, and individually tested with fixtures
- discovery covers core run/cache/event state plus Phase 08 capability snapshots and Script journals, Phase 09 lock registry, Phase 10 budget ledgers/routes, and Phase 11 revision records/lineage
- migrate into a sibling staging directory; never rewrite the only copy in place
- validate every migrated authoritative file before commit
- write a migration report with counts, warnings, checksums, and rejected paths
- commit by atomic directory/manifest generation switch where platform semantics permit
- retain the pre-migration backup until the next successful startup and configurable retention window
- interruption at copy/validate/commit resumes or rolls back deterministically
- unknown newer versions are read-only/quarantined with actionable diagnostics; never downgraded

### Atomic Write Contract

For authoritative state:

1. create unique temp file with restrictive permissions
2. write bounded serialized content
3. fsync file
4. close file
5. rename over target
6. fsync containing directory where supported
7. update generation/checksum metadata

Failure cleanup must not delete the last valid target. Windows rename behavior requires explicit tested replacement logic.

### Typed Durable Events

Replace open `type: string` with a discriminated union covering run, node, validation, review, supervision, intervention, lock, budget, revision, Hook, migration, and diagnostic events.

Every event contains:

- schemaVersion
- eventId
- sequence
- workflowId/runId as applicable
- timestamp
- typed payload
- finite JSON and bounded strings/arrays

Event append rules:

- sequence allocation is generation/CAS protected
- duplicate eventId is idempotent
- gaps/duplicates/checksum failures are detected during read
- append serialization is guarded by a per-run writer queue/lock
- a partial final line is quarantined/truncated only with a recorded repair event
- events never contain secrets or unbounded raw logs

### Snapshot And Compaction

- compact only through a typed projection with a known last included sequence
- write and validate new snapshot before replacing old snapshot
- retain events after the snapshot boundary until snapshot commit succeeds
- preserve audit-critical revision, approval, intervention, budget, and Hook receipt events according to retention policy
- compaction is interruptible and idempotent
- recovery can rebuild state from snapshot + remaining events

### Cache And Artifact Retention

- version cache metadata separately from run state
- include actual route/backend/tool/context/Hook policy inputs in fingerprints
- verify referenced artifacts exist and match recorded hash before reuse
- define max age/size and deterministic eviction; never evict artifacts required by active/paused recovery
- quarantine corrupt entries and rerun affected nodes rather than crashing the whole store

### Concurrency And CAS

Even with one Electron main process, all writers use expected generation to detect stale async writes. A stale checkpoint may not overwrite a newer intervention, budget settlement, or node completion.

On generation conflict, reload and reconcile through a typed conflict handler. Never retry a blind overwrite loop.

### Recovery And Quarantine

Startup classifies each problem as:

- recoverable temp file
- valid older generation
- migration incomplete
- corrupt authoritative state with valid backup
- corrupt non-authoritative cache
- unsupported newer schema
- unrecoverable/quarantined run

Public projection must give an actionable reason and preserve diagnostic paths without exposing raw sensitive content.

### Crash-Injection Matrix

Tests must inject process-like failure after every numbered atomic-write step, event append boundary, migration stage, snapshot stage, budget reservation/settlement, revision apply boundary, and lock/checkpoint ordering boundary.

Each test restarts a fresh store instance and proves exactly one valid outcome: old state, new state, resumed migration, or explicit quarantine. “No exception” is insufficient evidence.

### Out Of Scope

- SQLite/database rewrite
- distributed consensus
- remote object storage
- cryptographic signing/key management

### Phase Failure Conditions

- schema 1 data is simply rejected or deleted
- migration mutates the only copy
- atomic write omits required flush semantics without documented platform exception
- event names/payloads remain untyped
- stale async writes can overwrite newer generations
- compaction can lose audit events
- corruption crashes all workflows instead of isolating the affected record
- crash tests assert only that code does not throw

### Definition Of Done

- schema 1 fixtures migrate to schema 2 without semantic loss
- newer/invalid data is safely diagnosed or quarantined
- state/events/snapshots use checksums and generation control
- typed events cover all current domains
- compaction and retention are safe for active recovery/audit
- crash-injection matrix proves authoritative outcomes
- full verification and production build pass
