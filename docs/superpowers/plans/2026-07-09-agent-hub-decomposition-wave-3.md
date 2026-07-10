# Agent Hub Decomposition Wave 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue shrinking `src/main/hub/agent-hub.ts` by moving large coordination blocks into focused helper modules without changing behavior.

**Architecture:** Keep `AgentHub` as the orchestration facade, but move workflow-draft state transitions, interactive chat session dispatch, and team-step task startup into responsibility-aligned helpers under `workflow/`, `chat/`, and `team/`. Prefer pure or dependency-injected helpers so the main class wires collaborators instead of owning each flow inline.

**Tech Stack:** TypeScript, Vitest, Node.js main-process runtime

---

### Task 1: Workflow Draft Reply State Helpers

**Files:**
- Modify: `src/main/hub/workflow/agent-hub-workflow-draft.ts`
- Modify: `src/main/hub/agent-hub.ts`
- Test: `src/main/hub/agent-hub.test.ts`

- [ ] **Step 1: Add helper functions for workflow-draft reply lifecycle**

```ts
export function beginWorkflowDraftReply(...) { ... }
export function abandonWorkflowDraftReplyState(...) { ... }
export function resetWorkflowDraftSessionState(...) { ... }
```

- [ ] **Step 2: Replace inline state reshaping in `AgentHub.sendWorkflowDraftReply`, `abandonWorkflowDraftReply`, and `resetWorkflowDraftSession`**

```ts
const started = beginWorkflowDraftReply(...)
this.workflows.set(started.next.workflowId, started.next)
this.activeWorkflowDraftRequests.set(started.next.workflowId, started.request)
```

- [ ] **Step 3: Verify workflow tests still pass through the existing hub suite**

Run: `npx vitest run src/main/hub/agent-hub.test.ts`
Expected: `101 passed` or the current total for the file with 0 failures

### Task 2: Interactive Chat Prompt Dispatch Helper

**Files:**
- Create: `src/main/hub/chat/agent-hub-chat-prompt.ts`
- Modify: `src/main/hub/agent-hub.ts`
- Test: `src/main/hub/agent-hub.test.ts`

- [ ] **Step 1: Add a helper that encapsulates the interactive `sendPrompt` branch**

```ts
export async function dispatchInteractiveChatPrompt(...) { ... }
```

- [ ] **Step 2: Keep `sendPrompt` focused on validation and top-level branching**

```ts
if (supportsInteractiveChat) {
  await dispatchInteractiveChatPrompt(...)
  return
}
```

- [ ] **Step 3: Run focused regression checks**

Run: `npm run typecheck`
Expected: exit code `0`

### Task 3: Team Step Startup Helper

**Files:**
- Modify: `src/main/hub/team/agent-hub-team-run.ts`
- Modify: `src/main/hub/agent-hub.ts`
- Test: `src/main/hub/agent-hub.test.ts`

- [ ] **Step 1: Extract task creation and state mutation for queued team steps**

```ts
export function beginTeamRunStep(...) { ... }
```

- [ ] **Step 2: Reuse the helper inside `startTeamRunStep` so `AgentHub` mainly wires resolution, emit, and execution**

```ts
const prepared = beginTeamRunStep(...)
if (!prepared) return
```

- [ ] **Step 3: Run full verification for this wave**

Run: `npm run typecheck`
Expected: exit code `0`

Run: `npx vitest run src/main/hub/agent-hub.test.ts`
Expected: `101 passed` or the current total for the file with 0 failures
