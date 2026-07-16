# Workflow V2 Phase 10: Model Routing, Budget Ledger, And Context

## 2026-07-10

### Status

Proposed. Requires completed Phase 09.

### Objective

Resolve logical model profiles into frozen executable routes, charge every model-bearing operation to one durable budget ledger, enforce all declared cost limits, and complete context overflow handling without transcript leakage or string-error fallbacks.

### Required Preconditions

- Runtime capability contracts can express token-limit and no-tool support.
- Task starts/finishes are isolated in the task service.
- Event-driven scheduler checkpoints each node independently.

### Resolved Route Contract

```ts
export interface WorkflowV2ResolvedModelRoute {
  profile: WorkflowV2ModelProfile;
  role: WorkflowV2NodeRole | "supervisor" | "summarizer" | "hook";
  configuredAgentId: string;
  runtimeId: string;
  channelId: string;
  modelId: string;
  routeRevision: string;
  capabilityHash: string;
}
```

At plan freeze:

- resolve every LLM node and control-plane role
- verify the configured agent/channel/model still exists and supports required tools/token controls
- persist the route snapshot in the plan
- include the route in node/cache fingerprints
- show effective routes during approval

At run start/node start, a missing or changed route pauses with a typed capability/configuration intervention. It does not silently fall back to the workflow default or another model.

### Durable Budget Ledger

```ts
export type WorkflowV2ModelCallKind =
  | "worker"
  | "reviewer"
  | "progress_probe"
  | "supervisor"
  | "summarizer"
  | "llm_hook";

export interface WorkflowV2BudgetLedgerEntry {
  entryId: string;
  workflowId: string;
  runId: string;
  nodeId?: string;
  attempt?: number;
  kind: WorkflowV2ModelCallKind;
  route: WorkflowV2ResolvedModelRoute;
  reservedPromptTokens: number;
  reservedCompletionTokens: number;
  actualPromptTokens?: number;
  actualCompletionTokens?: number;
  estimatedCostMicros?: number;
  status: "reserved" | "started" | "settled" | "released";
  createdAt: number;
  settledAt?: number;
}
```

Rules:

- reserve budget atomically before task creation
- use a stable entry id so retries/recovery cannot double-charge one start
- settle actual usage from runtime/provider metadata when available
- if task creation fails before start, release the reservation
- if actual usage is unavailable, retain the conservative reservation as charged usage
- every call kind uses the same ledger
- wall-clock budget uses monotonic elapsed time during one process and durable timestamps for recovery policy
- cost tables are versioned inputs, not hard-coded scattered constants

Before Phase 12, persist the ledger as a self-versioned per-run file at `workflows/<workflowId>/runs/<runId>/budget-ledger.json` with `schemaVersion: 1`, generation, and atomic writes. Resolved routes/capability hashes are backward-compatible optional frozen-plan fields. Pre-evolution plans may omit them; new plans may not. Do not bump core run-state schema in this phase.

### Limit Enforcement

- `maxModelCalls`: reserve one call before any model task
- `maxPromptTokens`: exact tokenizer count when the route has a tokenizer; otherwise reject strict plans or use an explicitly approved conservative estimator
- `maxCompletionTokens`: pass provider/runtime limit when supported; otherwise enforce stream interruption if reliable, or reject the route as incapable
- `maxWallClockMs`: includes workers, reviewers, probes, supervisors, summarizers, Hooks, cleanup, and approved extensions
- optional monetary budget uses integer micros, never floating-point currency

Budget exhaustion creates a typed `budget_exhausted` intervention when recovery choices exist; otherwise it fails before starting another task. It never starts and hopes usage remains under budget.

Budget/intervention rules preserve the frozen plan:

- `budget_exhausted` allows `skip` or `replan`; it does not allow `continue`, `escalate`, or any action that spends beyond the frozen budget.
- `context_budget` allows `skip`, `replan`, or `continue` only with a typed `contextResolution` that selects already-optional segment omissions/truncation and mechanically fits the existing budget.
- `contextResolution` contains expected plan hash, context assembly hash, strategy, and approved optional segment ids. Main recomputes the assembly; renderer/model-provided token counts are not authoritative.
- increasing budget, changing route/context window, or making a required segment optional requires Phase 11 revision; it is never an intervention mutation of the old plan.

### Context Assembly Contract

Represent context as bounded, attributed segments:

```ts
export interface WorkflowV2ContextSegment {
  id: string;
  kind: "objective" | "acceptance" | "constraints" | "upstream" | "recovery" | "hook" | "storage";
  priority: number;
  required: boolean;
  content: string;
  sourceNodeId?: string;
}

export interface WorkflowV2ContextAssemblyResult {
  segments: WorkflowV2ContextSegment[];
  promptTokens: number;
  omittedSegmentIds: string[];
  summarizedSegmentIds: string[];
  policy: "fit" | "truncate" | "summarize" | "ask_human";
}
```

Required objective, acceptance, constraint, output-schema, and safety segments may not be dropped. Upstream packets are selected by direct dependency and budget before text rendering.

### Overflow Policy

1. deduplicate identical evidence and repeated summaries
2. trim optional low-priority segments deterministically
3. truncate only segments explicitly marked truncatable
4. for `summarize`, reserve exactly one summarizer call with a fixed input/output budget
5. validate the summary as structured output with provenance; never recursively summarize
6. reassemble and recount
7. if still too large, create `context_budget` intervention
8. for `ask_human`, create the intervention immediately; do not throw a generic error

Summarizer output is context, never worker completion, review verdict, or graph navigation.

### Cache And Recovery

- route snapshot, tokenizer/version, context policy, summarized input hash, and budget policy participate in fingerprints where they affect output
- ledger reservations and settlements survive restart
- recovery reconciles a started entry with the matching TaskRun/runtime conversation before deciding whether to charge/retry

### Out Of Scope

- model marketplace/UI configuration redesign
- automatic model benchmarking
- replan graph lifecycle
- storage schema migration mechanics, except adding data behind Phase 12-compatible version gates

### Phase Failure Conditions

- profile remains prompt text only
- a missing route silently falls back
- any reviewer/probe/supervisor/summarizer/hook call is absent from the ledger
- completion limits remain informational only
- `summarize` or `ask_human` throws a generic boundary error
- required context can be dropped
- raw transcript becomes fallback context
- retries/recovery double-charge a call

### Definition Of Done

- all model roles have frozen, validated actual routes
- every model task is reserved/settled in one durable ledger
- every declared budget has explicit enforcement
- context overflow policies are implemented and produce structured evidence/interventions
- route/budget/context changes invalidate affected cache entries
- recovery reconciles ledger state correctly
- full typecheck, tests, and build pass
