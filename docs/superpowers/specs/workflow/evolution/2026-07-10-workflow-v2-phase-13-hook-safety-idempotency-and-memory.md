# Workflow V2 Phase 13: Hook Safety, Idempotency, And Memory

## 2026-07-10

### Status

Proposed. Requires completed Phase 12.

### Objective

Make Hook effects capability-enforced, path-safe, durable, replay-aware, and idempotent across retries/restarts while preserving the rule that Hooks cannot become graph, routing, or review semantics.

### Required Preconditions

- task effect policies can enforce no-tool/no-filesystem/no-network LLM calls
- storage schema 2 supports typed events, generations, and receipts
- runtime Hook host is isolated behind Phase 07 boundary
- current Hook lifecycle/source/failure tests pass

### Effect Classification

```ts
export type WorkflowV2HookEffectClass =
  | "pure"
  | "read"
  | "durable_write"
  | "external_write";
```

Required classification:

- `setVariable`, `injectContext`, `llmHook`: pure (`llmHook` is computational but effect-restricted)
- `readMemory`: read
- `writeMemory`, `writeFile`: durable_write
- no external network/message action is added in this phase
- `pause`, `skip`: control signals, not side effects

The registry declares effect class, allowed lifecycles, required capabilities, replay semantics, and handler. Definitions cannot override registry safety metadata.

### Durable Receipt Contract

```ts
export type WorkflowV2HookJsonValue =
  | null
  | boolean
  | number
  | string
  | WorkflowV2HookJsonValue[]
  | { [key: string]: WorkflowV2HookJsonValue };

export interface WorkflowV2HookReplayResult {
  variables?: Record<string, WorkflowV2HookJsonValue>;
  injectedContext?: string[];
  control?: { action: "pause" | "skip"; reason: string };
}

export interface WorkflowV2HookReceipt {
  receiptId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  attempt: number;
  lifecycle: WorkflowV2HookLifecycle;
  actionOrder: number;
  actionHash: string;
  effectClass: WorkflowV2HookEffectClass;
  status: "reserved" | "running" | "succeeded" | "failed" | "skipped";
  idempotencyKey?: string;
  result?: WorkflowV2HookReplayResult;
  resultArtifactRef?: string;
  resultHash?: string;
  error?: WorkflowV2ErrorEnvelope;
  createdAt: number;
  updatedAt: number;
}
```

`WorkflowV2HookReplayResult` is a shared persisted contract in `src/shared/workflow-v2/hooks.ts`; it does not import the main-process handler implementation. The main handler must adapt its internal result into this allowlisted contract before the receipt store sees it. Unsupported keys, non-finite numbers, excessive depth/size, and graph/review/routing fields fail validation.

`receiptId` is deterministic from run/node/attempt/lifecycle/order/actionHash. Source changes produce a different action hash and invalidate stale approval/cache.

Exactly one of inline `result` or `resultArtifactRef` may be present for a succeeded receipt. Inline results remain finite/bounded JSON and contain only the existing handler allowlist (`variables`, `injectedContext`, `control`). Larger permitted results use a checksummed artifact reference. `resultHash` alone is insufficient for replay.

Execution rules:

1. validate action and capabilities
2. create/resume receipt with generation CAS
3. for an already succeeded receipt, reuse the recorded result/control outcome without repeating the effect
4. mark running before invoking a write effect
5. execute through the effect-specific adapter
6. persist result and succeeded receipt before continuing lifecycle
7. on ambiguous crash after external effect, pause for reconciliation; never guess

Every durable-write adapter implements reconciliation:

```ts
type WorkflowV2HookEffectReconciliation =
  | { status: "not_applied" }
  | { status: "applied"; result: WorkflowV2HookReplayResult }
  | { status: "conflict"; reason: string }
  | { status: "unknown"; reason: string };
```

For `writeFile`, matching normalized target/content hash means applied; mismatched content is conflict. For memory, idempotency key/generation proves applied or not applied. `unknown`/`conflict` pauses for human reconciliation. It does not automatically repeat the write.

### LLM Hook Isolation

- task policy is tools/filesystem/network/process `none`
- runtime capability must prove enforcement
- model route is the Phase 10 Hook route
- prompt/context/output budgets use the ledger
- JSON output is schema validated and bounded
- response cannot include control/edge/review fields
- prompt instructions remain defense-in-depth only
- recovery first reconciles the original TaskRun/ledger entry; if completion is ambiguous or unavailable, apply the authored failure policy rather than silently starting a second llmHook call in the same receipt

### File Safety

`writeFile` rules:

- resolve workspace root through `realpath`
- reject absolute paths, `..`, empty segments, NUL, drive/UNC escapes, and overlong paths
- walk existing parents and reject symbolic links/reparse points unless an explicit safe policy exists
- create missing directories one segment at a time with restrictive permissions
- open target with no-follow/exclusive semantics where supported
- write temp + fsync + atomic rename for replacement
- revalidate containment immediately before commit
- bind approval/receipt to normalized target and content hash
- never inherit a broader filesystem capability than the Hook action requires

Platform-specific limitations must fail closed and have tests.

### Memory Scopes

```ts
export type WorkflowV2MemoryScope = "node" | "run" | "workflow";

export interface WorkflowV2MemoryKey {
  scope: WorkflowV2MemoryScope;
  namespace: string;
  key: string;
}
```

- node memory is keyed by run/node and normally cleared with run retention
- run memory is shared by nodes in one run and persisted for recovery
- workflow memory survives runs and requires explicit authored permission/approval
- values are finite bounded JSON with schema/version and generation
- writes use expected generation; stale writes fail explicitly
- reads expose only requested namespace/key
- secrets require a separate secret-store contract and are out of scope

### Failure Policies With Receipts

- `fail_node`: persist failed receipt, then fail node
- `pause_run`: persist failed receipt and structured Hook intervention
- `skip_hook`: persist skipped receipt with reason and continue
- control signals persist their receipt/outcome before scheduler transition
- retry does not erase prior receipts; a new attempt receives new receipt ids

### Cache Interaction

Hook definition hash, registry version, effect policy, relevant memory generation, and pure Hook outputs participate in fingerprints. Nodes with unreconciled write receipts are never reusable from cache.

### Out Of Scope

- arbitrary remote/webhook/email/Slack effects
- secret storage
- general plugin marketplace
- exactly-once semantics for third-party systems without idempotency support

### Phase Failure Conditions

- no-tool LLM remains prompt-only
- a succeeded write Hook repeats after restart
- symlink/reparse point can escape the workspace
- Hook memory remains an in-process Map for durable scopes
- stale memory writes overwrite newer values
- ambiguous write outcome automatically retries
- Hook result can smuggle graph/review semantics

### Definition Of Done

- every Hook action has registry-owned effect/capability/replay metadata
- receipts make lifecycle replay deterministic
- LLM Hook isolation is runtime enforced and budgeted
- file writes are containment-safe and atomic
- node/run/workflow memory scopes are durable and generation-safe
- failure policy, cache, retry, crash, and negative security behavior are tested
- full verification passes
