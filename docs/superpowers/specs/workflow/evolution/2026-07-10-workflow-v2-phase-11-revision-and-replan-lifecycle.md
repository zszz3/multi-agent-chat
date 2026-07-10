# Workflow V2 Phase 11: Revision And Replan Lifecycle

## 2026-07-10

### Status

Proposed. Requires completed Phase 10.

### Objective

Turn the existing `replan` intervention from “record and stop” into an explicit, validated, human-approved graph revision that creates a new graphVersion and run lineage while preserving the old run and reusing only fingerprint-compatible work.

### Required Preconditions

- actual routes and budgets are frozen in plans
- the dynamic scheduler and recovery planner are stable
- existing `WorkflowV2GraphRevision` builder tests pass
- current `replan` behavior is characterized as stop-without-mutation

### Immutable History Rules

- an approved/frozen plan is never edited in place
- an old run is never resumed under a different graphVersion
- replan creates a revision draft linked to the old plan/run
- approval creates a new immutable plan and a new run
- rejection/cancellation leaves the old run stopped and unchanged
- node output reuse is a recovery decision under the new plan, not copied by UI code

### Revision Contract

```ts
export type WorkflowV2RevisionStatus =
  | "drafting"
  | "validating"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "applied"
  | "failed";

export type WorkflowV2GraphChange =
  | { kind: "add_node"; nodeId: string; summary: string }
  | { kind: "remove_node"; nodeId: string; summary: string }
  | { kind: "update_node"; nodeId: string; changedFields: string[]; summary: string }
  | { kind: "add_edge"; fromNodeId: string; toNodeId: string }
  | { kind: "remove_edge"; fromNodeId: string; toNodeId: string }
  | { kind: "update_plan_policy"; changedFields: string[]; summary: string };

export interface WorkflowV2RevisionDraft {
  schemaVersion: 1;
  revisionId: string;
  workflowId: string;
  parentRunId: string;
  basedOnGraphVersion: number;
  proposedGraphVersion: number;
  status: WorkflowV2RevisionStatus;
  reason: string;
  requestedBy: string;
  requestedAt: number;
  oldPlanHash: string;
  proposedPlan?: WorkflowV2Plan;
  proposedPlanHash?: string;
  changes: WorkflowV2GraphChange[];
  impactedNodeIds: string[];
  reusePreview: WorkflowV2NodeRecoveryDecision[];
  budgetDelta?: Record<string, number>;
  validationErrors: string[];
  approvedBy?: string;
  approvedAt?: number;
}
```

All arrays are deterministically ordered and bounded. `changedFields` uses an allowlisted path vocabulary, not arbitrary JSON pointer mutation.

### Revision State Machine

```text
replan accepted
  -> drafting
  -> validating
  -> awaiting_approval
      -> rejected
      -> approved
          -> applied (new run created)
  -> failed
```

Transitions are main-process validated and appended as typed durable events. Invalid/repeated transitions are rejected idempotently.

### Drafting

The orchestrator receives:

- old objective and frozen plan
- intervention reason
- old run summary and structured node outputs
- validation/review/progress evidence
- unresolved blockers
- current capabilities, routes, and remaining/renewed budget policy

It must return an authored definition and plan inputs, not a free-form patch. The normal template compiler, authoring validator, planner, capability resolver, route resolver, and budget checks rebuild the proposed plan.

The model cannot directly declare a revision valid or approved.

Revision drafting has a separate, explicitly approved budget because the parent run may already be exhausted:

```ts
export interface WorkflowV2RevisionDraftBudget {
  maxModelCalls: 1;
  maxPromptTokens: number;
  maxCompletionTokens: number;
  maxWallClockMs: number;
  maxCostMicros?: number;
}
```

The replan request records this bounded budget and the Phase 10 orchestrator route before drafting. Main validates/approves it and reserves a revision-scoped ledger entry linked to `revisionId` and `parentRunId`. It never spends unapproved capacity from the exhausted parent run or the not-yet-approved proposed run. Malformed output/retry requires a new approved drafting attempt/budget entry; it cannot silently make a second model call.

### Mechanical Diff And Impact

Compute graph/plan changes from normalized old/new plans. Do not trust model-authored change summaries for identity or impact.

Impact analysis marks:

- directly changed nodes
- descendants whose upstream fingerprints change
- nodes whose route/capability/context/review policy changes
- nodes reusable under exact new fingerprints

Removed-node outputs remain in old-run history but are never injected into the new plan unless a new node explicitly consumes an approved artifact.

### Approval Boundary

The approval request shows:

- old/new graphVersion and plan hashes
- normalized graph/policy diff
- capabilities and effective routes
- budget delta
- impacted/rerun/reuse nodes and reasons
- validation warnings/errors

Approval is bound to `revisionId + proposedPlanHash + capability hashes + route revisions`. Any change invalidates approval and returns to validation.

Phase 11 provides a minimal typed approval surface. Phase 14 may improve visualization but may not alter approval authority.

### Applying A Revision

On approval:

1. persist approved revision
2. persist new immutable plan
3. materialize recovery/reuse checkpoint under the new graphVersion
4. create a new run with `parentRunId` and `revisionId`
5. append lineage events to old and new run histories
6. start only after all authoritative writes succeed
7. mark revision `applied` with newRunId

If new run creation/start fails, the revision remains approved but not applied and can be retried idempotently. It must not create duplicate runs.

### Storage Layout Before Phase 12

Store revision records separately under the Workflow V2 workflow directory, for example:

```text
workflows/<workflowId>/revisions/<revisionId>/revision.json
```

Use existing atomic write helpers. Do not silently change run-state schema version before Phase 12 migration support exists.

### IPC Surface

Typed requests:

- request replan
- read revision draft
- approve revision with expected plan hash
- reject revision with reason
- apply approved revision

Renderer receives a sanitized projection; it never writes revision files or sends arbitrary plan JSON as approval.

### Out Of Scope

- collaborative graph merge
- editing an applied revision
- automatic approval
- arbitrary graph JSON patch API
- rich diff visualization beyond the minimal approval surface

### Phase Failure Conditions

- old plan/run is mutated
- graphVersion is reused
- model output bypasses normal validation/planning
- approval is not hash/capability/route bound
- new run starts before revision/plan persistence
- reuse ignores new fingerprints
- applying twice creates duplicate runs
- UI directly supplies authoritative proposed plan state

### Definition Of Done

- replan produces a durable revision draft and deterministic diff
- proposed plans pass every normal plan-time gate
- approval is typed, hash-bound, and main-process enforced
- approved revision creates one new graphVersion/run lineage
- old history remains immutable
- reuse/rerun decisions are explicit and fingerprint-safe
- failure/retry/apply idempotency is tested
- full verification passes
