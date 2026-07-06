# Interactive Session Reconfigure And Resume Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement controlled chat reconfiguration after a conversation has started so model, channel, and runtime changes no longer depend on the old `!sessionId && !history` shortcut, while native resume handles are cleared or retained honestly according to the actual boundary that changed.

**Architecture:** Separate chat configuration state from attachment lifecycle state. Add a small shared reconfigure planner that classifies context diffs into hot-safe, attach-boundary, and identity-breaking changes; let interactive sessions stage attach-boundary changes until the running turn completes; and have `AgentHub` persist per-chat channel overrides plus explicit session-reset metadata instead of pretending old native handles are still valid.

**Tech Stack:** Electron main process, TypeScript, Vitest, persisted app snapshot state, shared interactive session manager.

**Prerequisite:** Execute [2026-07-05-runtime-execution-architecture.md](/C:/Users/29768/Desktop/multi-agent-chat/docs/superpowers/plans/2026-07-05-runtime-execution-architecture.md) first. This plan assumes interactive chats already flow through `InteractiveSessionManager`.

---

### Task 1: Persist Per-Chat Channel Overrides And Resolve Chat Context From Them

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/agent-hub.ts`
- Modify: `src/main/agent-hub.test.ts`
- Modify: `src/preload/index.test.ts`

- [ ] **Step 1: Add failing tests for persisted chat channel overrides and restore-time normalization**

```ts
test("setChatChannel stores a same-runtime channel override even after the first prompt", async () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  (hub as any).channels = [
    {
      id: "codex-openai",
      agentId: "codex",
      label: "Codex OpenAI",
      models: [{ id: "default", label: "Default" }, { id: "gpt-5.5", label: "GPT-5.5" }],
    },
    {
      id: "codex-openrouter",
      agentId: "codex",
      label: "Codex OpenRouter",
      models: [{ id: "default", label: "Default" }, { id: "gpt-5.5", label: "GPT-5.5" }],
    },
  ];

  const chat = hub.createChat();
  const raw = (hub as any).chats.get(chat.id);
  raw.messages.push({ id: "m-1", role: "user", content: "hello", timestamp: 1 });

  hub.setChatChannel(chat.id, "codex-openrouter");

  expect(hub.snapshot().chats.find((item) => item.id === chat.id)).toMatchObject({
    id: chat.id,
    channelId: "codex-openrouter",
  });
});

test("restoreChatState keeps a stored channel override only when it still matches the configured runtime", () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  const restored = (hub as any).restoreChatState({
    id: "chat-1",
    title: "Chat",
    configuredAgentId: "default-agent",
    channelId: "codex-openai",
    modelId: "default",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  });

  expect(restored?.channelId).toBe("codex-openai");
});
```

- [ ] **Step 2: Run the focused `AgentHub` tests and verify they fail because `ChatSession` has no `channelId` and `setChatChannel(...)` is a no-op**

Run: `npm test -- src/main/agent-hub.test.ts src/preload/index.test.ts`

Expected: FAIL with missing `channelId` fields and no observable effect from `setChatChannel(...)`.

- [ ] **Step 3: Add persisted `channelId` support and resolve chat context through it when present**

```ts
// src/shared/types.ts
export interface ChatSession {
  id: string;
  title: string;
  configuredAgentId: string;
  modelId: string;
  channelId?: string;
  sessionId: string | undefined;
  runtimeSession?: ChatRuntimeSessionState;
  running: boolean;
  messages: ChatMessage[];
  pendingAssistantMessageId: string | undefined;
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}
```

```ts
// src/main/agent-hub.ts
private resolveConfiguredAgent(
  configuredAgentId: string | undefined,
  modelIdOverride?: string,
  channelIdOverride?: string,
): ResolvedConfiguredAgent | undefined {
  const agent = this.configuredAgentOrDefault(configuredAgentId);
  if (!agent) return undefined;

  const preferredChannel =
    channelIdOverride && this.channelById(channelIdOverride)?.agentId === agent.runtimeAgentId
      ? this.channelById(channelIdOverride)
      : this.channelById(agent.channelId);

  const channel =
    preferredChannel ??
    this.channels.find((item) => item.agentId === agent.runtimeAgentId) ??
    this.channels[0];
  if (!channel) return undefined;

  const runtimeAgentId = channel.agentId;
  const override = modelIdOverride?.trim();
  const modelId =
    override && isModelForChannel(runtimeAgentId, channel.id, override, this.channels)
      ? override
      : isModelForChannel(runtimeAgentId, channel.id, agent.modelId, this.channels)
        ? agent.modelId
        : defaultModelForAgent(runtimeAgentId);

  return {
    agent,
    runtimeAgentId,
    channel,
    modelId,
    runtime: this.runtimes.get(runtimeAgentId),
  };
}
```

Use `chat.channelId` everywhere chat context is resolved, persist it in `buildPersistedPayload()`, restore it in `restoreChatState(...)`, and add a preload typing assertion that `ChatSession["channelId"]` is `string | undefined`.

- [ ] **Step 4: Re-run the focused `AgentHub` and preload tests**

Run: `npm test -- src/main/agent-hub.test.ts src/preload/index.test.ts`

Expected: PASS for persisted `channelId` support and restore-time normalization.

- [ ] **Step 5: Commit the chat channel override foundation**

```bash
git add src/shared/types.ts src/main/agent-hub.ts src/main/agent-hub.test.ts src/preload/index.test.ts
git commit -m "feat: persist chat channel overrides"
```

### Task 2: Add A Shared Reconfigure Planner For Hot-Safe, Attach-Boundary, And Identity-Breaking Changes

**Files:**
- Create: `src/main/agents/session-reconfigure.ts`
- Create: `src/main/agents/session-reconfigure.test.ts`
- Modify: `src/main/agents/runtime-driver.ts`

- [ ] **Step 1: Add failing tests that classify model, workDir, and runtime changes correctly**

```ts
import { describe, expect, test } from "vitest";
import { planSessionReconfigure } from "./session-reconfigure";

const current = {
  chatId: "chat-1",
  configuredAgentId: "codex-agent",
  runtimeId: "codex",
  runtime: { id: "codex", label: "Codex", command: "codex", version: "test", available: true },
  channelId: "codex-openai",
  workDir: "C:/repo",
  modelId: "gpt-5.5",
  developerInstructions: "test",
  emit: () => undefined,
} as const;

describe("planSessionReconfigure", () => {
  test("treats a model change as attach-boundary but not identity-breaking", () => {
    const plan = planSessionReconfigure(current, { ...current, modelId: "default" });
    expect(plan.invalidateResume).toBe(false);
    expect(plan.requiresSessionRecreate).toBe(false);
    expect(plan.applyOnNextAttach).toMatchObject({ modelId: "default" });
  });

  test("treats a workDir change as identity-breaking for native resume", () => {
    const plan = planSessionReconfigure(current, { ...current, workDir: "C:/other-repo" });
    expect(plan.invalidateResume).toBe(true);
    expect(plan.applyOnNextAttach).toMatchObject({ workDir: "C:/other-repo" });
  });

  test("treats a runtime family change as session recreation", () => {
    const plan = planSessionReconfigure(current, {
      ...current,
      runtimeId: "claude",
      runtime: { id: "claude", label: "Claude", command: "claude", version: "test", available: true },
      channelId: "claude-code",
    });
    expect(plan.requiresSessionRecreate).toBe(true);
    expect(plan.invalidateResume).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new reconfigure planner test slice and verify it fails because the planner file does not exist yet**

Run: `npm test -- src/main/agents/session-reconfigure.test.ts`

Expected: FAIL with module-not-found errors for `planSessionReconfigure(...)`.

- [ ] **Step 3: Implement a conservative reconfigure planner that never preserves a native handle across identity-breaking changes**

```ts
// src/main/agents/session-reconfigure.ts
import type { InteractiveSessionContext } from "./runtime-driver";

export interface SessionReconfigurePlan {
  applyNow: Partial<InteractiveSessionContext>;
  applyOnNextAttach: Partial<InteractiveSessionContext>;
  invalidateResume: boolean;
  requiresSessionRecreate: boolean;
}

export function planSessionReconfigure(
  current: InteractiveSessionContext,
  next: InteractiveSessionContext,
): SessionReconfigurePlan {
  const applyNow: Partial<InteractiveSessionContext> = {
    configuredAgentId: next.configuredAgentId,
    emit: next.emit,
    syncState: next.syncState,
  };

  const applyOnNextAttach: Partial<InteractiveSessionContext> = {};
  if (current.modelId !== next.modelId) applyOnNextAttach.modelId = next.modelId;
  if (current.channelId !== next.channelId) applyOnNextAttach.channelId = next.channelId;
  if (current.developerInstructions !== next.developerInstructions) applyOnNextAttach.developerInstructions = next.developerInstructions;
  if (current.workDir !== next.workDir) applyOnNextAttach.workDir = next.workDir;
  if (current.runtime.command !== next.runtime.command) applyOnNextAttach.runtime = next.runtime;

  const runtimeChanged = current.runtimeId !== next.runtimeId;
  const workDirChanged = current.workDir !== next.workDir;
  const channelChanged = current.channelId !== next.channelId;

  return {
    applyNow,
    applyOnNextAttach,
    invalidateResume: runtimeChanged || workDirChanged || channelChanged,
    requiresSessionRecreate: runtimeChanged,
  };
}
```

Keep this planner intentionally conservative: when in doubt, clear the native handle rather than reusing a resume contract that may now be invalid.

- [ ] **Step 4: Re-run the planner tests and typecheck**

Run: `npm test -- src/main/agents/session-reconfigure.test.ts`

Expected: PASS for the classification cases above.

Run: `npm run typecheck`

Expected: PASS with the new planner types wired into `runtime-driver.ts`.

- [ ] **Step 5: Commit the shared planner**

```bash
git add src/main/agents/session-reconfigure.ts src/main/agents/session-reconfigure.test.ts src/main/agents/runtime-driver.ts
git commit -m "feat: classify interactive session reconfigure changes"
```

### Task 3: Serialize Reconfigure Through The Session Manager And Stage Attach-Boundary Changes Inside Interactive Sessions

**Files:**
- Modify: `src/main/agents/interactive-session-manager.ts`
- Modify: `src/main/agents/interactive-session-manager.test.ts`
- Modify: `src/main/agents/codex-interactive-session.ts`
- Modify: `src/main/agents/codex-interactive-session.test.ts`
- Modify: `src/main/agents/claude-interactive-session.ts`
- Modify: `src/main/agents/claude-interactive-session.test.ts`

- [ ] **Step 1: Add failing tests for queued reconfigure, staged model changes, and honest resume invalidation**

```ts
const runtimeSessionCapabilities = () => ({
  supportsInProcessConversationResume: true,
  supportsResumeAfterDetach: true,
  supportsResumeAfterAppRestart: true,
  supportsTurnResume: false,
  supportsInterrupt: true,
  supportsContinue: true,
  supportsApprovalRequests: true,
  supportsUserInputRequests: true,
});

const baseClaudeContext = () => ({
  chatId: "chat-1",
  configuredAgentId: "claude-agent",
  runtimeId: "claude",
  runtime: { id: "claude", label: "Claude", command: "claude", version: "test", available: true },
  channelId: "claude-code",
  workDir: "C:/repo",
  modelId: "claude-sonnet-4-6",
  developerInstructions: "test",
  emit: () => undefined,
  syncState: () => undefined,
});

const baseCodexContextWithResume = () => ({
  chatId: "chat-1",
  configuredAgentId: "codex-agent",
  runtimeId: "codex",
  runtime: { id: "codex", label: "Codex", command: "codex", version: "test", available: true },
  channelId: "codex-openai",
  workDir: "C:/repo",
  modelId: "gpt-5.5",
  developerInstructions: "test",
  resumeState: { runtimeId: "codex" as const, native: { threadId: "thread-1" } },
  emit: () => undefined,
  syncState: () => undefined,
});

const codexSessionOptions = () => ({
  capabilities: runtimeSessionCapabilities(),
  now: () => 1000,
  createCodexClient: () =>
    ({
      start: async () => undefined,
      request: async (method: string) =>
        method === "thread/resume"
          ? { thread: { id: "thread-1" } }
          : method === "turn/start"
            ? { turn: { id: "turn-1" } }
            : {},
      interruptTurn: async () => undefined,
      shutdown: async () => undefined,
    }) as any,
});

test("dispatch reconfigures the existing session inside the queue before the next send", async () => {
  const seen: string[] = [];
  const manager = new InteractiveSessionManager({
    createSession: () =>
      ({
        reconfigure: (context: { modelId: string }) => seen.push(`reconfigure:${context.modelId}`),
        ensureAttached: async () => undefined,
        sendPrompt: async (prompt: string) => seen.push(`prompt:${prompt}`),
        interrupt: async () => undefined,
        detach: async () => undefined,
        detachIfStillExpired: async () => undefined,
        snapshot: () => ({ executionStyle: "interactive", attachmentState: "detached", attachmentGeneration: 0, capabilities: runtimeSessionCapabilities() }),
      }) as any,
    now: () => 1000,
  });

  manager.getOrCreate("chat-1", { modelId: "old-model" } as any);
  await manager.dispatch("chat-1", { modelId: "new-model" } as any, (session) => session.sendPrompt("hello"));

  expect(seen).toEqual(["reconfigure:new-model", "prompt:hello"]);
});
```

```ts
test("stages a Claude model change until the running turn finishes", async () => {
  const session = new ClaudeInteractiveSession(
    baseClaudeContext(),
    {
      capabilities: runtimeSessionCapabilities(),
      now: () => 1000,
      createTransport: () => ({
        startTurn: async (input) => {
          input.onEvent({ type: "session", sessionId: "claude-session-1" });
          return { stop: async () => undefined };
        },
        interrupt: async () => undefined,
        detach: async () => undefined,
      }),
    },
  );

  await session.sendPrompt("first");
  session.reconfigure({ ...baseClaudeContext(), modelId: "claude-opus-4-6" });

  expect(session.snapshot()).toMatchObject({
    attachmentState: "running",
    resumeState: { runtimeId: "claude", native: { sessionId: "claude-session-1" } },
  });
});

test("clears the Codex native resume handle when workDir changes", async () => {
  const session = new CodexInteractiveSession(baseCodexContextWithResume(), codexSessionOptions());
  session.reconfigure({ ...baseCodexContextWithResume(), workDir: "C:/other-repo" });
  expect(session.snapshot().resumeState).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused session-manager and interactive-session tests and verify they fail before the queue carries context and the sessions stage updates**

Run: `npm test -- src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/claude-interactive-session.test.ts`

Expected: FAIL because `InteractiveSessionManager.dispatch(...)` does not accept a context argument and both interactive sessions apply `reconfigure(...)` immediately and shallowly.

- [ ] **Step 3: Move reconfigure into the serialized dispatch path and let sessions keep pending attach-boundary context**

```ts
// src/main/agents/interactive-session-manager.ts
private getOrCreateManaged(chatId: string, context: InteractiveSessionContext): ManagedInteractiveSession {
  const existing = this.sessions.get(chatId);
  if (existing) return existing;

  const session = this.options.createSession(context);
  const managed = {
    session,
    queue: Promise.resolve(),
    lease: new ProcessLease(session.snapshot().attachmentGeneration),
  };
  this.sessions.set(chatId, managed);
  return managed;
}

async dispatch(
  chatId: string,
  context: InteractiveSessionContext,
  work: (session: InteractiveSession, lease: ProcessLease) => Promise<void>,
): Promise<void> {
  const managed = this.getOrCreateManaged(chatId, context);

  const run = managed.queue.catch(() => undefined).then(async () => {
    managed.session.reconfigure(context);
    await work(managed.session, managed.lease);
  });

  managed.queue = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
}
```

```ts
// src/main/agents/codex-interactive-session.ts and claude-interactive-session.ts
private pendingContext: InteractiveSessionContext | undefined;

reconfigure(context: InteractiveSessionContext): void {
  const plan = planSessionReconfigure(this.context, context);
  this.context = { ...this.context, ...plan.applyNow };
  if (plan.invalidateResume) this.resumeState = undefined;

  const nextContext = { ...this.context, ...plan.applyOnNextAttach };
  if (this.attachmentState === "running" && Object.keys(plan.applyOnNextAttach).length > 0) {
    this.pendingContext = nextContext;
    this.context.syncState?.(this.snapshot());
    return;
  }

  this.context = nextContext;
  this.pendingContext = undefined;
  this.context.syncState?.(this.snapshot());
}

private applyPendingContextIfIdle(): void {
  if (!this.pendingContext) return;
  if (this.attachmentState === "running") return;
  this.context = this.pendingContext;
  this.pendingContext = undefined;
}
```

Call `applyPendingContextIfIdle()` after `completed`, after `error`, and after `detach(...)` so the next attach uses the staged context. Keep any running turn on its original attachment; do not mutate the live turn in place.

- [ ] **Step 4: Re-run the focused session-manager and interactive-session slices**

Run: `npm test -- src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/claude-interactive-session.test.ts`

Expected: PASS for queued reconfigure ordering, staged model changes, and conservative resume invalidation.

- [ ] **Step 5: Commit the serialized reconfigure behavior**

```bash
git add src/main/agents/interactive-session-manager.ts src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/claude-interactive-session.ts src/main/agents/claude-interactive-session.test.ts
git commit -m "feat: stage interactive session reconfigure changes"
```

### Task 4: Wire `AgentHub` Chat Setters Through The New Reconfigure Rules

**Files:**
- Modify: `src/main/agent-hub.ts`
- Modify: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing integration tests for model, channel, and cross-runtime agent changes after chat history exists**

```ts
function createHubWithTwoCodexChannels(): AgentHub {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  (hub as any).channels = [
    {
      id: "codex-openai",
      agentId: "codex",
      label: "Codex OpenAI",
      models: [{ id: "default", label: "Default" }, { id: "gpt-5.5", label: "GPT-5.5" }],
    },
    {
      id: "codex-openrouter",
      agentId: "codex",
      label: "Codex OpenRouter",
      models: [{ id: "default", label: "Default" }, { id: "gpt-5.5", label: "GPT-5.5" }],
    },
    {
      id: "claude-code",
      agentId: "claude",
      label: "Claude Code",
      models: [{ id: "default", label: "Default" }],
    },
  ];
  return hub;
}

function createHubWithCodexAndClaudeAgents(): AgentHub {
  const hub = createHubWithTwoCodexChannels();
  addConfiguredAgents(hub, [
    configuredAgent("codex-agent", { runtimeAgentId: "codex", channelId: "codex-openai", modelId: "gpt-5.5" }),
    configuredAgent("claude-agent", { runtimeAgentId: "claude", channelId: "claude-code", modelId: "default" }),
  ]);
  return hub;
}

test("setChatChannel updates the stored override for same-runtime channels after history exists", () => {
  const hub = createHubWithTwoCodexChannels();
  const chat = hub.createChat();
  const raw = (hub as any).chats.get(chat.id);
  raw.messages.push({ id: "m-1", role: "assistant", content: "hello", timestamp: 1 });

  hub.setChatChannel(chat.id, "codex-openrouter");

  expect(hub.snapshot().chats.find((item) => item.id === chat.id)?.channelId).toBe("codex-openrouter");
});

test("setChatAgent clears the old native handle when the runtime family changes", () => {
  const hub = createHubWithCodexAndClaudeAgents();
  const chat = hub.createChat("codex-agent");
  const raw = (hub as any).chats.get(chat.id);
  raw.sessionId = "thread-1";
  raw.runtimeSession = {
    executionStyle: "interactive",
    attachmentState: "idle",
    attachmentGeneration: 1,
    resumeState: { runtimeId: "codex", native: { threadId: "thread-1" } },
    capabilities: runtimeSessionCapabilities(),
  };
  raw.messages.push({ id: "m-1", role: "assistant", content: "hello", timestamp: 1 });

  hub.setChatAgent(chat.id, "claude-agent");

  expect(hub.snapshot().chats.find((item) => item.id === chat.id)).toMatchObject({
    configuredAgentId: "claude-agent",
    sessionId: undefined,
  });
  expect(hub.snapshot().chats.find((item) => item.id === chat.id)?.runtimeSession?.resumeState).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused `AgentHub` integration tests and verify they fail because `canConfigureChat(...)` still blocks post-start configuration**

Run: `npm test -- src/main/agent-hub.test.ts`

Expected: FAIL because `setChatAgent(...)`, `setChatModel(...)`, and `setChatChannel(...)` still depend on `!chat.sessionId && !hasAgentConversationMessages(...)`.

- [ ] **Step 3: Replace the old configuration gate with controlled update logic that preserves history but resets invalid native continuity**

```ts
// src/main/agent-hub.ts
setChatAgent(chatId: string, configuredAgentId: string): void {
  const chat = this.chats.get(chatId);
  const configuredAgent = this.configuredAgentOrDefault(configuredAgentId);
  if (!chat || !configuredAgent) return;

  const before = this.resolveConfiguredAgent(chat.configuredAgentId, chat.modelId, chat.channelId);
  chat.configuredAgentId = configuredAgent.id;
  chat.channelId = undefined;
  chat.modelId = this.normalizeModelIdForConfiguredAgent(configuredAgent.id, configuredAgent.modelId);

  const after = this.resolveConfiguredAgent(chat.configuredAgentId, chat.modelId, chat.channelId);
  if (before?.runtimeAgentId !== after?.runtimeAgentId) {
    chat.sessionId = undefined;
    if (chat.runtimeSession) {
      delete chat.runtimeSession.resumeState;
      chat.runtimeSession.attachmentState = "detached";
      delete chat.runtimeSession.activeTurnId;
    }
    this.appendEventToAssistant(chat, {
      id: randomUUID(),
      type: "system",
      content: "Runtime session reset after agent change.",
      timestamp: Date.now(),
    });
    void this.interactiveSessions.dispose(chat.id, "error");
  }

  chat.updatedAt = Date.now();
  this.activeChatId = chat.id;
  this.emit();
}
```

```ts
setChatChannel(chatId: string, channelId: string): void {
  const chat = this.chats.get(chatId);
  if (!chat) return;
  const channel = this.channelById(channelId);
  const agent = this.configuredAgentOrDefault(chat.configuredAgentId);
  if (!channel || !agent || channel.agentId !== agent.runtimeAgentId) return;

  chat.channelId = channel.id;
  if (!isModelForChannel(channel.agentId, channel.id, chat.modelId, this.channels)) {
    chat.modelId = defaultModelForAgent(channel.agentId);
  }
  chat.updatedAt = Date.now();
  this.activeChatId = chat.id;
  this.emit();
}
```

Remove `canConfigureChat(...)` entirely. Post-start config changes are now allowed, but the actual attachment consequences are governed by the session planner and, for runtime-family switches, by explicit session reset rather than silent handle reuse.

- [ ] **Step 4: Re-run the focused `AgentHub` test slice plus the interactive-session coverage**

Run:

```bash
npm run typecheck
npm test -- src/main/agent-hub.test.ts src/main/agents/session-reconfigure.test.ts src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/claude-interactive-session.test.ts src/preload/index.test.ts
```

Expected:

- `npm run typecheck`: PASS
- `npm test -- src/main/agent-hub.test.ts src/main/agents/session-reconfigure.test.ts src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/claude-interactive-session.test.ts src/preload/index.test.ts`: PASS

- [ ] **Step 5: Commit the `AgentHub` reconfigure integration**

```bash
git add src/main/agent-hub.ts src/main/agent-hub.test.ts
git commit -m "feat: reconfigure interactive chats after start"
```

### Task 5: Sync Docs To The New Reconfigure Reality

**Files:**
- Modify: `docs/superpowers/specs/2026-07-04-runtime-execution-architecture-design.md`
- Modify: `docs/zh-CN/runtime-execution-architecture-spec.md`
- Modify: `docs/architecture-overview.md`

- [ ] **Step 1: Update the design doc and zh-CN spec status to say reconfigure is implemented, staged, and conservative**

```md
Status wording to add:
- interactive session reconfigure is now classified as hot-safe, attach-boundary, or identity-breaking
- running turns keep their original attachment while attach-boundary changes stage for the next attach
- identity-breaking changes clear native resume handles and reset continuity honestly
```

- [ ] **Step 2: Refresh the architecture overview with the new planner and per-chat channel override concepts**

```md
- `src/main/agents/session-reconfigure.ts`: classifies reconfigure changes and decides whether native resume can survive
- chat state now stores an optional per-chat `channelId` override instead of treating configured-agent channel as immutable forever
```

- [ ] **Step 3: Run the final focused verification set**

Run:

```bash
npm run typecheck
npm test -- src/main/agent-hub.test.ts src/main/agents/session-reconfigure.test.ts src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/claude-interactive-session.test.ts src/preload/index.test.ts
```

Expected: PASS for typecheck and the full reconfigure slice.

- [ ] **Step 4: Commit the docs sync**

```bash
git add docs/superpowers/specs/2026-07-04-runtime-execution-architecture-design.md docs/zh-CN/runtime-execution-architecture-spec.md docs/architecture-overview.md
git commit -m "docs: sync interactive reconfigure architecture"
```

### Scope Guardrails

- Do not attempt full history-based continuation in this slice. When an identity-breaking change invalidates native continuity, reset the runtime handle honestly instead of reconstructing history implicitly.
- Do not mutate a live running turn in place when a model, channel, workDir, or developer-instructions change arrives.
- `setChatChannel(...)` remains same-runtime only. Runtime-family changes go through `setChatAgent(...)`.
- Keep slash-command routing unchanged; this slice is about chat session configuration, not command parsing.

### Definition Of Done

- Chats persist an optional `channelId` override.
- `InteractiveSessionManager` serializes reconfigure through the same queue as prompt dispatch.
- Codex and Claude interactive sessions stage attach-boundary changes until the turn becomes idle or detached.
- Identity-breaking chat changes clear native resume handles and reset continuity honestly instead of silently reusing stale handles.
- Focused tests and `npm run typecheck` pass.
