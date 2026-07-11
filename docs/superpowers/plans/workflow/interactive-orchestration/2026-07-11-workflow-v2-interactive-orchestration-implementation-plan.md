# Workflow V2 Interactive Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved six-phase Workflow V2 interactive orchestration contract with strict dependency settlement, frozen execution modes, durable node conversations, a node-agent floating window, safe script nodes, and event-driven leader supervision.

**Architecture:** The shared Workflow V2 definition/state modules remain authoritative contracts. The main-process scheduler and runtime own semantic transitions and durable conversations. The renderer consumes snapshots and ordered events and never advances topology. Each phase is independently tested and committed before the next phase begins.

**Tech Stack:** TypeScript, Electron, React, Vitest, existing runtime-driver and Workflow V2 persistence abstractions.

---

## Execution Ledger

### Phase 01: Strict Dependency Settlement

**Files:**
- Modify: `src/shared/workflow-v2/state.ts`
- Modify: `src/main/workflows/v2/workflow-v2-scheduler.ts`
- Modify: `src/main/workflows/v2/workflow-v2-executor.ts`
- Test: `src/main/workflows/v2/workflow-v2-scheduler.test.ts`
- Test: `src/main/workflows/v2/workflow-v2-executor.test.ts`
- Test: `src/main/workflows/workflow-runtime.test.ts`

- [x] Add failing A -> B intervention test proving B must not start while A is paused/waiting.
- [x] Add failing multi-parent and durable-recovery blocking tests.
- [x] Define one dependency-satisfaction predicate using persisted terminal state.
- [x] Revalidate readiness immediately before every node launch.
- [x] Verify scheduler, executor, runtime, typecheck, and full suite.
- [x] Commit Phase 01 and update this ledger.

### Phase 02: Frozen Execution Modes

**Files:**
- Modify: `src/shared/workflow-v2/definition.ts`
- Modify: `src/shared/workflow-v2/planning.ts`
- Modify: `src/shared/workflow-v2/validation.ts`
- Modify: `src/main/workflows/v2/workflow-v2-planner.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-v2.ts`
- Modify: renderer workflow plan/editor files under `src/renderer/src/pages/workflow/`
- Test adjacent shared, planner, hub, and renderer utilities.

- [x] Add failing validation tests for missing/incompatible execution modes.
- [x] Add `one-shot | interactive | script` mode and typed mode configuration.
- [x] Add planner mode rationale/confidence and deterministic classification guidance.
- [x] Persist user mode overrides before plan freeze.
- [x] Show mode and rationale in plan/node UI.
- [x] Verify and commit Phase 02.

### Phase 03: Durable Node Conversations

**Files:**
- Create: `src/shared/workflow-v2/conversation.ts`
- Create: `src/main/workflows/v2/workflow-v2-conversation-store.ts`
- Create: `src/main/workflows/v2/workflow-v2-conversation-manager.ts`
- Modify: runtime-driver capability and conversation request contracts.
- Modify: `src/main/workflows/workflow-runtime.ts`
- Modify: app IPC/preload/shared public types.
- Add focused tests for store, manager, runtime, IPC, and recovery.

- [ ] Add failing tests proving repeated user turns reuse one runtime conversation ID.
- [ ] Add durable conversation/message/completion-proposal contracts.
- [ ] Implement create/send/resume/interrupt/close through runtime drivers.
- [ ] Add `waiting_for_user` and `completion_proposed` semantic transitions.
- [ ] Require explicit user confirm before authoritative completion/output commit.
- [ ] Add restart recovery and typed non-resumable intervention.
- [ ] Verify and commit Phase 03.

### Phase 04: Node Agent Floating Window

**Files:**
- Create focused components/hooks under `src/renderer/src/pages/workflow/node-agent/`.
- Modify: workflow graph/node interaction and page composition.
- Modify: renderer public API typings and styles.
- Add component/state utility tests where repository patterns support them.

- [ ] Add failing projection tests for stable ordered conversation events.
- [ ] Implement node click -> independent floating window.
- [ ] Render durable history, streaming output, tools, runtime identity, and status.
- [ ] Add interactive composer bound to the same node conversation.
- [ ] Add confirm, continue, and reject completion-proposal actions.
- [ ] Preserve graph context, unread state, and window-close semantics.
- [ ] Verify typecheck/build/manual interaction and commit Phase 04.

### Phase 05: Script Execution And Approval

**Files:**
- Modify: execution-mode shared contracts and validation.
- Modify: `src/main/workflows/v2/workflow-v2-script-policy.ts`
- Modify: `src/main/workflows/v2/workflow-v2-script-runner.ts`
- Modify: workflow runtime approval/intervention handling.
- Modify: renderer script-node detail and approval UI.
- Add policy, runner, runtime, and UI projection tests.

- [ ] Add failing allowlisted read-only and workspace-write approval tests.
- [ ] Replace unrestricted/fail-all behavior with typed command/args policy.
- [ ] Validate cwd, access, timeout, output schema, and approval before side effects.
- [ ] Execute useful read-only script nodes end to end.
- [ ] Pause workspace-write scripts for durable approval and resume exactly once.
- [ ] Expose script details/output without creating Agent sessions.
- [ ] Verify and commit Phase 05.

### Phase 06: Event-Driven Supervision And Leader UX

**Files:**
- Modify: runtime event and supervision modules.
- Modify: `src/main/workflows/v2/workflow-v2-leader.ts`
- Modify: workflow runtime idle/probe integration.
- Modify: workflow renderer subscriptions and leader activity components.
- Add supervision, leader, IPC, and renderer projection tests.

- [ ] Add failing tests proving no fixed-interval status call is needed.
- [ ] Separate activity detail from semantic state.
- [ ] Implement quiet-period interrupt probes with cooldown and maximum count.
- [ ] Persist leader priorities, blockers, mode recommendations, script candidates, risk, and revisions.
- [ ] Render stable Leader Activity and user-required actions.
- [ ] Verify no probe can complete a node or release descendants.
- [ ] Run full verification, update specs/status evidence, and commit Phase 06.

## Final Verification

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Start the Electron app and manually verify A -> B user-wait blocking.
- [ ] Manually verify multi-turn node conversation and explicit completion confirmation.
- [ ] Manually verify script approval and event-driven stable UI.
- [ ] Confirm unrelated `.idea`, `memory.md`, and historical `outputs/` remain untouched.
