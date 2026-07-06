# Claude Approval And User-Input Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared chat event model so Claude interactive chat can surface structured approval and user-input requests, persist committed outcomes honestly, and downgrade abandoned pending requests on detach or restart instead of pretending they stayed live.

**Architecture:** Keep `AgentHub` as the only place that mutates persisted chat history and runtime session snapshots. Add shared `AgentEvent` and `ChatEvent` variants for approval and user-input lifecycles, normalize Claude SDK interaction signals into those variants in a dedicated adapter, and mark any unresolved live requests as expired whenever the attachment boundary is lost.

**Tech Stack:** Electron main process, TypeScript, Vitest, Claude SDK transport/bindings, React renderer chat event formatting.

**Prerequisite:** Execute [2026-07-06-claude-sdk-interactive-transport.md](/C:/Users/29768/Desktop/multi-agent-chat/docs/superpowers/plans/2026-07-06-claude-sdk-interactive-transport.md) first. This plan assumes `ClaudeSdkInteractiveTransport` exists on the branch and is the default Claude interactive backend.

---

### Task 1: Extend The Shared Event Model And Renderer Surface

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/pages/chat/chat-event-display.tsx`
- Create: `src/renderer/src/pages/chat/chat-event-display.test.tsx`

- [ ] **Step 1: Add failing renderer tests for approval, response, and expired input events**

```tsx
import { describe, expect, test } from "vitest";
import { chatEventDisplayContent } from "./chat-event-display";

describe("chatEventDisplayContent", () => {
  test("renders approval requests and responses with explicit state", () => {
    expect(
      chatEventDisplayContent({
        id: "evt-1",
        type: "approval_request",
        content: "Allow Bash to run `git status`?",
        requestId: "approval-1",
        requestState: "live",
        timestamp: 0,
        metadata: { toolName: "Bash" },
      }),
    ).toBe("approval pending\nAllow Bash to run `git status`?");

    expect(
      chatEventDisplayContent({
        id: "evt-2",
        type: "approval_response",
        content: "Approved by user",
        requestId: "approval-1",
        decision: "approved",
        timestamp: 1,
      }),
    ).toBe("approval approved\nApproved by user");
  });

  test("renders expired user-input requests honestly", () => {
    expect(
      chatEventDisplayContent({
        id: "evt-3",
        type: "user_input_request",
        content: "Provide PROD_API_KEY",
        requestId: "input-1",
        requestState: "expired",
        timestamp: 2,
      }),
    ).toBe("input request expired\nProvide PROD_API_KEY");
  });
});
```

- [ ] **Step 2: Run the renderer-focused test and verify it fails because the new event variants do not exist yet**

Run: `npm test -- src/renderer/src/pages/chat/chat-event-display.test.tsx`

Expected: FAIL with type errors or unreachable branches because `approval_request`, `approval_response`, `user_input_request`, and `user_input_response` are not part of `ChatEvent`.

- [ ] **Step 3: Extend the shared event unions and formatter without introducing request-handling UI yet**

```ts
// src/shared/types.ts
export type InteractionRequestState = "live" | "resolved" | "expired";
export type ApprovalDecision = "approved" | "rejected";

export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; content: string }
  | { type: "meta"; content: string }
  | { type: "system"; content: string; metadata?: Record<string, unknown> }
  | { type: "tool_call"; content: string; name?: string; metadata?: Record<string, unknown> }
  | { type: "tool_result"; content: string; name?: string; metadata?: Record<string, unknown> }
  | { type: "handoff"; content: string; fromAgentId?: AgentId; toAgentId?: AgentId; metadata?: Record<string, unknown> }
  | { type: "approval_request"; requestId: string; content: string; metadata?: Record<string, unknown> }
  | { type: "approval_response"; requestId: string; decision: ApprovalDecision; content?: string; metadata?: Record<string, unknown> }
  | { type: "user_input_request"; requestId: string; content: string; metadata?: Record<string, unknown> }
  | { type: "user_input_response"; requestId: string; content: string; metadata?: Record<string, unknown> }
  | { type: "completed"; content?: string }
  | { type: "error"; error: string };

export interface ChatEvent {
  id: string;
  type:
    | "meta"
    | "system"
    | "tool_call"
    | "tool_result"
    | "handoff"
    | "approval_request"
    | "approval_response"
    | "user_input_request"
    | "user_input_response"
    | "error";
  content: string;
  timestamp: number;
  agentId?: AgentId;
  name?: string;
  fromAgentId?: AgentId;
  toAgentId?: AgentId;
  requestId?: string;
  requestState?: InteractionRequestState;
  decision?: ApprovalDecision;
  metadata?: Record<string, unknown>;
}
```

```tsx
// src/renderer/src/pages/chat/chat-event-display.tsx
export function chatEventDisplayContent(event: ChatEvent): string {
  if (event.type === "approval_request") {
    const label = event.requestState === "expired" ? "approval expired" : "approval pending";
    return event.content ? `${label}\n${event.content}` : label;
  }
  if (event.type === "approval_response") {
    const label = event.decision === "rejected" ? "approval rejected" : "approval approved";
    return event.content ? `${label}\n${event.content}` : label;
  }
  if (event.type === "user_input_request") {
    const label = event.requestState === "expired" ? "input request expired" : "input request";
    return event.content ? `${label}\n${event.content}` : label;
  }
  if (event.type === "user_input_response") {
    return event.content ? `input provided\n${event.content}` : "input provided";
  }
  // keep the existing branches below unchanged
}
```

- [ ] **Step 4: Re-run the renderer test and typecheck**

Run: `npm test -- src/renderer/src/pages/chat/chat-event-display.test.tsx`

Expected: PASS with the new formatter output.

Run: `npm run typecheck`

Expected: PASS with the shared type changes flowing through the renderer and main process.

- [ ] **Step 5: Commit the shared event surface**

```bash
git add src/shared/types.ts src/renderer/src/pages/chat/chat-event-display.tsx src/renderer/src/pages/chat/chat-event-display.test.tsx
git commit -m "feat: add structured approval and input event types"
```

### Task 2: Normalize Claude SDK Interaction Signals Into Shared Agent Events

**Files:**
- Create: `src/main/agents/claude-sdk-events.ts`
- Create: `src/main/agents/claude-sdk-events.test.ts`
- Modify: `src/main/agents/claude-sdk-bindings.ts`
- Modify: `src/main/agents/claude-sdk-interactive-transport.ts`
- Modify: `src/main/agents/claude-sdk-interactive-transport.test.ts`

- [ ] **Step 1: Add failing tests for approval and input event normalization**

```ts
import { describe, expect, test } from "vitest";
import { normalizeClaudeSdkEvent } from "./claude-sdk-events";

describe("normalizeClaudeSdkEvent", () => {
  test("maps approval and input events into shared AgentEvent values", () => {
    expect(
      normalizeClaudeSdkEvent({
        type: "approval_request",
        requestId: "approval-1",
        prompt: "Allow Bash to run `git status`?",
        toolName: "Bash",
      }),
    ).toEqual([
      {
        type: "approval_request",
        requestId: "approval-1",
        content: "Allow Bash to run `git status`?",
        metadata: { toolName: "Bash" },
      },
    ]);

    expect(
      normalizeClaudeSdkEvent({
        type: "approval_response",
        requestId: "approval-1",
        decision: "approved",
        reason: "User accepted",
      }),
    ).toEqual([
      {
        type: "approval_response",
        requestId: "approval-1",
        decision: "approved",
        content: "User accepted",
      },
    ]);

    expect(
      normalizeClaudeSdkEvent({
        type: "user_input_request",
        requestId: "input-1",
        prompt: "Provide PROD_API_KEY",
      }),
    ).toEqual([
      {
        type: "user_input_request",
        requestId: "input-1",
        content: "Provide PROD_API_KEY",
      },
    ]);
  });
});
```

```ts
test("forwards normalized approval and input events from the SDK binding", async () => {
  const emitted: AgentEvent[] = [];
  const transport = new ClaudeSdkInteractiveTransport({
    executable: "claude",
    envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
    sdkModelForTurn: (modelId) => modelId,
    loadBindings: async () => ({
      startTurn: async (input) => {
        input.onSdkEvent({ type: "approval_request", requestId: "approval-1", prompt: "Allow Bash?" });
        input.onSdkEvent({ type: "approval_response", requestId: "approval-1", decision: "approved", reason: "ok" });
        input.onSdkEvent({ type: "user_input_request", requestId: "input-1", prompt: "Provide token" });
        return { interrupt: async () => undefined, stop: async () => undefined };
      },
    }),
  });

  await transport.startTurn({
    prompt: "hello",
    modelId: "claude-sonnet-4-6",
    cwd: "C:/repo",
    onEvent: (event) => emitted.push(event),
  });

  expect(emitted).toEqual([
    { type: "approval_request", requestId: "approval-1", content: "Allow Bash?" },
    { type: "approval_response", requestId: "approval-1", decision: "approved", content: "ok" },
    { type: "user_input_request", requestId: "input-1", content: "Provide token" },
  ]);
});
```

- [ ] **Step 2: Run the focused Claude SDK tests and verify they fail because the normalizer and stable SDK event union do not exist yet**

Run: `npm test -- src/main/agents/claude-sdk-events.test.ts src/main/agents/claude-sdk-interactive-transport.test.ts`

Expected: FAIL with module-not-found or type errors for `normalizeClaudeSdkEvent(...)` and the new SDK event shapes.

- [ ] **Step 3: Introduce a stable Claude SDK event union at the bindings layer and normalize it in one place**

```ts
// src/main/agents/claude-sdk-bindings.ts
export type ClaudeSdkEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; content: string }
  | { type: "completed"; content?: string }
  | { type: "error"; error: string }
  | { type: "approval_request"; requestId: string; prompt: string; toolName?: string }
  | { type: "approval_response"; requestId: string; decision: "approved" | "rejected"; reason?: string }
  | { type: "user_input_request"; requestId: string; prompt: string }
  | { type: "user_input_response"; requestId: string; content: string };

export interface ClaudeSdkBindingTurnInput {
  // keep the existing fields
  onSdkEvent: (event: ClaudeSdkEvent) => void;
}
```

```ts
// src/main/agents/claude-sdk-events.ts
import type { AgentEvent } from "../../shared/types";
import type { ClaudeSdkEvent } from "./claude-sdk-bindings";

export function normalizeClaudeSdkEvent(event: ClaudeSdkEvent): AgentEvent[] {
  if (event.type === "session") return [{ type: "session", sessionId: event.sessionId }];
  if (event.type === "delta") return [{ type: "delta", content: event.content }];
  if (event.type === "completed") return event.content ? [{ type: "completed", content: event.content }] : [{ type: "completed" }];
  if (event.type === "error") return [{ type: "error", error: event.error }];
  if (event.type === "approval_request") {
    return [
      {
        type: "approval_request",
        requestId: event.requestId,
        content: event.prompt,
        ...(event.toolName ? { metadata: { toolName: event.toolName } } : {}),
      },
    ];
  }
  if (event.type === "approval_response") {
    return [
      {
        type: "approval_response",
        requestId: event.requestId,
        decision: event.decision,
        ...(event.reason ? { content: event.reason } : {}),
      },
    ];
  }
  if (event.type === "user_input_request") {
    return [{ type: "user_input_request", requestId: event.requestId, content: event.prompt }];
  }
  return [{ type: "user_input_response", requestId: event.requestId, content: event.content }];
}
```

```ts
// src/main/agents/claude-sdk-interactive-transport.ts
import { normalizeClaudeSdkEvent } from "./claude-sdk-events";

onSdkEvent: (event) => {
  for (const sharedEvent of normalizeClaudeSdkEvent(event)) input.onEvent(sharedEvent);
},
```

Inside `loadClaudeSdkBindings()`, translate the real raw SDK events into this stable `ClaudeSdkEvent` union before they leave the bindings layer. Keep that raw-to-stable mapping local to `claude-sdk-bindings.ts` so the transport and `AgentHub` never depend on undocumented SDK object shapes directly.

- [ ] **Step 4: Re-run the focused Claude SDK tests and typecheck**

Run: `npm test -- src/main/agents/claude-sdk-events.test.ts src/main/agents/claude-sdk-interactive-transport.test.ts`

Expected: PASS for the new approval and input normalization cases.

Run: `npm run typecheck`

Expected: PASS with `ClaudeSdkInteractiveTransport` forwarding the new `AgentEvent` variants.

- [ ] **Step 5: Commit the Claude event adapter**

```bash
git add src/main/agents/claude-sdk-events.ts src/main/agents/claude-sdk-events.test.ts src/main/agents/claude-sdk-bindings.ts src/main/agents/claude-sdk-interactive-transport.ts src/main/agents/claude-sdk-interactive-transport.test.ts
git commit -m "feat: normalize claude approval and input events"
```

### Task 3: Persist Request Lifecycles And Expire Abandoned Pending Requests

**Files:**
- Modify: `src/main/agent-hub.ts`
- Modify: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing `AgentHub` tests for persisted request lifecycles and restart degradation**

```ts
test("stores approval request and response pairs and resolves the pending request", () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  const chat = (hub as any).createChatState("default-agent");

  (hub as any).handleAgentEvent(chat, {
    type: "approval_request",
    requestId: "approval-1",
    content: "Allow Bash?",
  });
  (hub as any).handleAgentEvent(chat, {
    type: "approval_response",
    requestId: "approval-1",
    decision: "approved",
    content: "Allowed",
  });

  const assistant = chat.messages.find((message: { role: string }) => message.role === "assistant");
  expect(assistant?.events).toEqual([
    expect.objectContaining({
      type: "approval_request",
      requestId: "approval-1",
      requestState: "resolved",
    }),
    expect.objectContaining({
      type: "approval_response",
      requestId: "approval-1",
      decision: "approved",
    }),
  ]);
});

test("downgrades pending approval and input requests to expired on restore", () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  const restored = (hub as any).restoreChatState({
    id: "chat-1",
    title: "Chat",
    configuredAgentId: "default-agent",
    modelId: "default",
    runtimeSession: {
      executionStyle: "interactive",
      attachmentState: "running",
      attachmentGeneration: 9,
      capabilities: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: false,
        supportsResumeAfterAppRestart: false,
        supportsTurnResume: false,
        supportsInterrupt: true,
        supportsContinue: true,
        supportsApprovalRequests: true,
        supportsUserInputRequests: true,
      },
    },
    messages: [
      {
        id: "msg-1",
        role: "assistant",
        content: "",
        timestamp: 0,
        events: [
          { id: "evt-1", type: "approval_request", content: "Allow Bash?", requestId: "approval-1", requestState: "live", timestamp: 1 },
          { id: "evt-2", type: "user_input_request", content: "Provide token", requestId: "input-1", requestState: "live", timestamp: 2 },
        ],
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  });

  expect(restored?.messages[0]?.events).toEqual([
    expect.objectContaining({ type: "approval_request", requestState: "expired" }),
    expect.objectContaining({ type: "user_input_request", requestState: "expired" }),
  ]);
});
```

- [ ] **Step 2: Run the focused `AgentHub` slice and verify it fails before the lifecycle helpers exist**

Run: `npm test -- src/main/agent-hub.test.ts`

Expected: FAIL because `handleAgentEvent(...)`, `restoreEvent(...)`, and `restoreChatState(...)` do not yet know about the new request lifecycle fields.

- [ ] **Step 3: Persist the new event types, resolve matching requests, and expire live ones on boundary loss**

```ts
// src/main/agent-hub.ts
private appendStructuredAssistantEvent(run: RunState, event: ChatEvent): void {
  this.appendEventToAssistant(run, event);
}

private resolvePendingRequest(run: RunState, requestId: string, type: "approval_request" | "user_input_request"): void {
  for (const message of [...run.messages].reverse()) {
    const existing = [...(message.events ?? [])].reverse().find(
      (item) => item.type === type && item.requestId === requestId && item.requestState === "live",
    );
    if (existing) {
      existing.requestState = "resolved";
      return;
    }
  }
}

private expirePendingInteractionEvents(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    ...(message.events
      ? {
          events: message.events.map((event) =>
            event.type === "approval_request" || event.type === "user_input_request"
              ? event.requestState === "live"
                ? { ...event, requestState: "expired" as const }
                : event
              : event,
          ),
        }
      : {}),
  }));
}
```

```ts
// src/main/agent-hub.ts inside handleAgentEvent(...)
if (event.type === "approval_request" || event.type === "user_input_request") {
  touchRuntimeSession("running");
  this.appendStructuredAssistantEvent(run, {
    id: randomUUID(),
    type: event.type,
    content: event.content,
    requestId: event.requestId,
    requestState: "live",
    timestamp: Date.now(),
    ...(event.metadata ? { metadata: event.metadata } : {}),
  });
  run.updatedAt = Date.now();
  this.emit();
  return;
}

if (event.type === "approval_response" || event.type === "user_input_response") {
  touchRuntimeSession("running");
  this.resolvePendingRequest(run, event.requestId, event.type === "approval_response" ? "approval_request" : "user_input_request");
  this.appendStructuredAssistantEvent(run, {
    id: randomUUID(),
    type: event.type,
    content: event.content ?? "",
    requestId: event.requestId,
    ...(event.type === "approval_response" ? { decision: event.decision } : {}),
    timestamp: Date.now(),
    ...(event.metadata ? { metadata: event.metadata } : {}),
  });
  run.updatedAt = Date.now();
  this.emit();
  return;
}
```

```ts
// src/main/agent-hub.ts inside restoreChatState(...)
chat.messages = this.expirePendingInteractionEvents(this.normalizeRestoredMessages(messages));
```

Also update `restoreEvent(...)` so it round-trips `requestId`, `requestState`, and `decision`, and call the same `expirePendingInteractionEvents(...)` helper from `stopChat(...)` before appending `"Stopped"` so unresolved live requests are not left looking actionable after an interrupt.

- [ ] **Step 4: Re-run the focused lifecycle tests plus the renderer and Claude adapter slices**

Run:

```bash
npm run typecheck
npm test -- src/main/agent-hub.test.ts src/main/agents/claude-sdk-events.test.ts src/main/agents/claude-sdk-interactive-transport.test.ts src/renderer/src/pages/chat/chat-event-display.test.tsx
```

Expected:

- `npm run typecheck`: PASS
- `npm test -- src/main/agent-hub.test.ts src/main/agents/claude-sdk-events.test.ts src/main/agents/claude-sdk-interactive-transport.test.ts src/renderer/src/pages/chat/chat-event-display.test.tsx`: PASS

- [ ] **Step 5: Commit the lifecycle persistence slice**

```bash
git add src/main/agent-hub.ts src/main/agent-hub.test.ts
git commit -m "feat: persist approval and input request lifecycles"
```

### Task 4: Sync Runtime Docs And Re-Verify The Claude Event Slice

**Files:**
- Modify: `docs/superpowers/specs/2026-07-04-runtime-execution-architecture-design.md`
- Modify: `docs/zh-CN/runtime-execution-architecture-spec.md`
- Modify: `docs/architecture-overview.md`

- [ ] **Step 1: Update the design doc and zh-CN spec so approval and user-input events are no longer just an open question**

```md
Status wording to apply in the existing docs:
- Claude SDK transport is implemented on this branch
- approval and user-input events now exist as structured shared `AgentEvent` values
- pending approval and pending user-input requests downgrade to non-live on detach or restart
```

- [ ] **Step 2: Refresh the architecture overview to mention the shared structured interaction event surface**

```md
- `AgentHub` now persists structured approval and user-input request lifecycles alongside tool and handoff events
- Claude SDK events are normalized in `src/main/agents/claude-sdk-events.ts` before they reach shared chat state
```

- [ ] **Step 3: Run the final focused verification set**

Run:

```bash
npm run typecheck
npm test -- src/main/agent-hub.test.ts src/main/agents/claude-sdk-events.test.ts src/main/agents/claude-sdk-interactive-transport.test.ts src/renderer/src/pages/chat/chat-event-display.test.tsx
```

Expected: PASS for typecheck and the focused approval/input event coverage.

- [ ] **Step 4: Commit the docs sync**

```bash
git add docs/superpowers/specs/2026-07-04-runtime-execution-architecture-design.md docs/zh-CN/runtime-execution-architecture-spec.md docs/architecture-overview.md
git commit -m "docs: sync structured approval event architecture"
```

### Scope Guardrails

- Do not build approval submission UI or user-input reply UI in this slice. This plan only introduces event surfacing, persistence, and honest degradation semantics.
- Do not mark a pending approval or user-input request as resolved unless a matching explicit response event arrived with the same `requestId`.
- Do not claim turn-level resume for pending requests after stop, idle detach, or app restart.
- Do not widen Codex or API runtime behavior beyond accepting the new shared `AgentEvent` variants.

### Definition Of Done

- `AgentEvent` and `ChatEvent` support structured approval and user-input request lifecycles.
- `ClaudeSdkInteractiveTransport` forwards normalized approval and input events from the bindings layer.
- `AgentHub` persists committed approval and input outcomes and marks abandoned live requests as expired on restart or stop.
- The renderer displays approval and input events with honest pending/expired status labels.
- Focused typecheck and tests pass.

