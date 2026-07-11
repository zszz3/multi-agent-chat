# Workflow V2 Interactive Phase 06: Event-Driven Supervision And Leader UX

## Status

Approved design. Not implemented.

## Objective

Remove fixed-interval agent-status polling and make leader coordination materially visible and useful.

## Event-Driven Supervision

Backend runtime events update messages, tools, activity timestamps, and semantic state. The frontend subscribes and renders these events; it does not poll agent status every second.

Each active interactive/agent node has an idle policy:

```ts
export interface WorkflowV2IdleProbePolicy {
  quietPeriodMs: number;
  probeCooldownMs: number;
  maxConsecutiveProbes: number;
  hardTimeoutMs?: number;
}
```

After `quietPeriodMs` with no runtime event, the backend may send one interrupt/status probe using the same runtime conversation, following the runtime adapter capability contract. A probe requests structured progress only. It must not change execution mode, mark completion, release descendants, or create a replacement session. Cooldown and maximum count prevent polling behavior.

## Stable Projection

Activity detail and semantic node state are separate. A progress message may update detail such as “reading files” while the node remains `running`. The renderer must not alternate among queued/running/waiting solely because snapshots arrive.

## Leader Contract

The leader produces durable decisions with reasons:

```ts
export interface WorkflowV2LeaderDecision {
  at: number;
  planHealth: "healthy" | "at-risk" | "blocked";
  priorityNodeIds: string[];
  blockedNodes: Array<{ nodeId: string; reason: string }>;
  executionModeRecommendations: Array<{ nodeId: string; mode: WorkflowV2ExecutionMode; reason: string }>;
  scriptCandidates: Array<{ nodeId: string; reason: string }>;
  risks: string[];
  revisionProposal?: WorkflowV2GraphRevisionProposal;
}
```

The leader may prioritize runnable nodes within frozen policy, explain blocking, recommend mode changes for a future revision, identify script candidates, summarize risk, and propose revision. It may not directly mutate the frozen graph or confirm an interactive node on behalf of the user.

## Leader UX

Add a Leader Activity surface showing current plan health, active priorities, blocked-node explanations, user actions required, recent decisions, and revision proposals. The user must be able to distinguish these behaviors from the main branch’s simple runnable-node execution.

## Required Tests

- Runtime events update UI without periodic status IPC calls.
- Quiet nodes receive bounded probes only after the threshold.
- Probe cooldown and maximum count are enforced.
- Probe responses update detail but never topology state.
- Leader decisions are persisted and rendered with reasons.
- Leader cannot mutate a frozen plan without approved revision.

## Forbidden Moves

- Fixed-interval status IPC or model calls.
- Using a probe response to mark a node completed or release descendants.
- Letting the leader confirm interactive completion for the user.
- Letting the leader mutate the frozen graph outside revision flow.

## Fail Fast

Stop if runtime activity cannot be distinguished from semantic node state, or if the event channel cannot guarantee ordered per-node projection without falling back to polling.
## Acceptance Criteria

Normal active execution uses no fixed-interval status polling. Node presentation is stable. Idle probes are bounded and interrupt-based. Leader decisions create observable scheduling, blocking, risk, and revision value beyond returning runnable nodes unchanged.
