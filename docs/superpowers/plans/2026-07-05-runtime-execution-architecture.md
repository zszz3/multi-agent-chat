# Runtime Execution Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce shared runtime-style and interactive-session infrastructure so chat execution becomes capability-driven, Codex chat reuses one app-server attachment per chat, Claude chat moves behind a shared interactive-session boundary, and API remains a stateless one-shot runtime.

**Architecture:** Keep `AgentHub` as the state and orchestration owner, evolve `src/main/agent-executor.ts` into a thin driver-registry boundary, and move interactive lifecycle into focused `src/main/agents/*` modules with serialized command queues and attachment leases. Persist logical chat identity and runtime resume state separately from ephemeral process state so boot recovery, idle detach, and history-based continuation are explicit instead of accidental.

**Tech Stack:** Electron main process, TypeScript, Vitest, Codex app-server RPC, Claude subprocess streaming, SQLite/JSON snapshot persistence.

---

### Task 1: Shared Runtime Contracts And Persistence Foundation

**Files:**
- Create: `src/main/agents/runtime-capabilities.ts`
- Create: `src/main/agents/runtime-driver.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/agent-hub.ts`
- Test: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing snapshot and migration tests for interactive runtime session state**

```ts
test("migrates a legacy chat sessionId into detached runtime resume state", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-session-migrate-"));
  const storagePath = path.join(dir, "state.json");
  await writeFile(
    storagePath,
    JSON.stringify({
      version: 2,
      activeChatId: "chat-1",
      workDir: dir,
      sessions: [
        {
          id: "chat-1",
          title: "Existing Codex chat",
          configuredAgentId: "default-agent",
          modelId: "default",
          sessionId: "thread-1",
          lastError: undefined,
          createdAt: 1710000000000,
          updatedAt: 1710000000000
        }
      ],
      messages: [],
      events: [],
      channels: [],
      configuredAgents: []
    }),
    "utf8",
  );

  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  await hub.loadPersistedState(storagePath);

  const chat = hub.snapshot().chats.find((item) => item.id === "chat-1");
  expect(chat?.runtimeSession).toMatchObject({
    executionStyle: "interactive",
    attachmentState: "detached",
    attachmentGeneration: 0,
    resumeState: {
      runtimeId: "codex",
      native: { threadId: "thread-1" },
    },
  });
});

test("restores interactive chats as detached and clears ephemeral turn state", async () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  const snapshot = (hub as any).restoreChatState({
    id: "chat-2",
    title: "Restored Claude chat",
    configuredAgentId: "default-agent",
    modelId: "default",
    sessionId: "session-1",
    runtimeSession: {
      executionStyle: "interactive",
      attachmentState: "running",
      attachmentGeneration: 12,
      activeTurnId: "turn-9",
      resumeState: { runtimeId: "claude", native: { sessionId: "session-1" } },
    },
    messages: [],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  });

  expect(snapshot.runtimeSession).toMatchObject({
    attachmentState: "detached",
    attachmentGeneration: 0,
  });
  expect(snapshot.runtimeSession?.activeTurnId).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused persistence test slice and verify it fails on missing runtime session fields**

Run: `npm test -- src/main/agent-hub.test.ts`

Expected: FAIL with missing `runtimeSession` shape and restore/migration assertions.

- [ ] **Step 3: Add execution-style, resume, and persisted runtime-session contracts**

```ts
// src/shared/types.ts
export type ExecutionStyle = "oneshot" | "interactive";

export interface RuntimeResumeCapabilities {
  supportsInProcessConversationResume: boolean;
  supportsResumeAfterDetach: boolean;
  supportsResumeAfterAppRestart: boolean;
  supportsTurnResume: boolean;
}

export interface RuntimeInteractionCapabilities {
  supportsInterrupt: boolean;
  supportsContinue: boolean;
  supportsApprovalRequests: boolean;
  supportsUserInputRequests: boolean;
}

export type PersistedResumeState =
  | {
      runtimeId: "codex";
      native: { threadId: string; sessionTreeRootId?: string };
      appContext?: { cwd?: string; modelId?: string; approvalPolicy?: string; sandboxPolicy?: unknown };
      extensions?: Record<string, unknown>;
    }
  | {
      runtimeId: "claude";
      native: { sessionId: string; projectKey?: string; subpaths?: string[] };
      appContext?: { cwd: string; modelId?: string; claudeConfigDir?: string; sessionStoreRef?: string };
      extensions?: Record<string, unknown>;
    };

export interface ChatRuntimeSessionState {
  executionStyle: ExecutionStyle;
  attachmentState: "detached" | "idle" | "running" | "interrupted";
  attachmentGeneration: number;
  activeTurnId?: string;
  lastMeaningfulActivityAt?: number;
  resumeState?: PersistedResumeState;
  capabilities: RuntimeResumeCapabilities & RuntimeInteractionCapabilities;
}

export interface ChatSession {
  id: string;
  title: string;
  configuredAgentId: string;
  modelId: string;
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
// src/main/agents/runtime-capabilities.ts
import type { AgentId, ExecutionStyle, RuntimeInteractionCapabilities, RuntimeResumeCapabilities } from "../../shared/types";

export interface RuntimeCapabilities extends RuntimeInteractionCapabilities {
  runtimeId: AgentId;
  chatStyle: ExecutionStyle;
  taskStyle: ExecutionStyle;
  workflowStyle: ExecutionStyle;
  testStyle: ExecutionStyle;
  resume: RuntimeResumeCapabilities;
}
```

```ts
// src/main/agent-hub.ts
interface PersistedChatSessionRecordV3 extends PersistedChatSessionRecord {
  runtimeSession?: ChatRuntimeSessionState;
}

interface PersistedAppStateV3 extends Omit<PersistedAppStateV2, "version" | "sessions"> {
  version: 3;
  sessions: PersistedChatSessionRecordV3[];
}

private migrateLegacyRuntimeSession(record: PersistedChatSessionRecord): ChatRuntimeSessionState | undefined {
  if (!record.sessionId) return undefined;
  return {
    executionStyle: "interactive",
    attachmentState: "detached",
    attachmentGeneration: 0,
    resumeState: {
      runtimeId: this.resolveConfiguredAgent(record.configuredAgentId, record.modelId)?.runtimeAgentId === "claude" ? "claude" : "codex",
      native:
        this.resolveConfiguredAgent(record.configuredAgentId, record.modelId)?.runtimeAgentId === "claude"
          ? { sessionId: record.sessionId }
          : { threadId: record.sessionId },
    } as PersistedResumeState,
    capabilities: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
      supportsInterrupt: true,
      supportsContinue: true,
      supportsApprovalRequests: false,
      supportsUserInputRequests: false,
    },
  };
}
```

- [ ] **Step 4: Upgrade restore/persist paths so logical session state survives but attachment state resets on boot**

```ts
private restoreChatState(raw: unknown): ChatState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const now = Date.now();
  const configuredAgent = this.configuredAgentOrDefault(asOptionalString(record.configuredAgentId));
  if (!configuredAgent) return null;

  const chat = new ChatState(
    configuredAgent.id,
    this.normalizeModelIdForConfiguredAgent(configuredAgent.id, asOptionalString(record.modelId) ?? configuredAgent.modelId),
    configuredAgent.name || "New Chat",
  );
  chat.id = asOptionalString(record.id) ?? chat.id;
  chat.title = asOptionalString(record.title) ?? (configuredAgent.name || "New Chat");
  chat.sessionId = asOptionalString(record.sessionId);
  chat.running = false;
  chat.pendingAssistantMessageId = undefined;
  chat.lastError = asOptionalString(record.lastError);
  chat.createdAt = asNumber(record.createdAt, now);
  chat.updatedAt = asNumber(record.updatedAt, chat.createdAt);
  const messages = Array.isArray(record.messages)
    ? record.messages.map((message) => this.restoreMessage(message)).filter((message): message is ChatMessage => Boolean(message))
    : [];
  chat.messages = this.normalizeRestoredMessages(messages);
  const restoredRuntimeSession = asRecord(record.runtimeSession)
    ? this.restoreRuntimeSession(record.runtimeSession)
    : this.migrateLegacyRuntimeSession({
        id: chat.id,
        title: chat.title,
        configuredAgentId: chat.configuredAgentId,
        modelId: chat.modelId,
        sessionId: chat.sessionId,
        lastError: chat.lastError,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      });

  chat.runtimeSession = restoredRuntimeSession
    ? {
        ...restoredRuntimeSession,
        attachmentState: "detached",
        attachmentGeneration: 0,
        activeTurnId: undefined,
      }
    : undefined;
  return chat;
}

private buildPersistedPayload(): PersistedAppStateV3 {
  const sessions: PersistedChatSessionRecordV3[] = [...this.chats.values()].map((chat) => ({
    id: chat.id,
    title: chat.title,
    configuredAgentId: chat.configuredAgentId,
    modelId: chat.modelId,
    sessionId: chat.sessionId,
    runtimeSession: chat.runtimeSession,
    lastError: chat.lastError,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  }));
  return {
    version: 3,
    activeChatId: this.activeChatId ?? null,
    activeTaskId: this.activeTaskId ?? null,
    activeTeamId: this.activeTeamId ?? null,
    activeTeamRunId: this.activeTeamRunId ?? null,
    workDir: this.workDir,
    channels: this.channels.map((channel) => cloneAgentChannel(channel)),
    sessions,
    messages,
    events,
    tasks,
    taskMessages,
    taskEvents,
    teams,
    teamRuns,
    configuredAgents: this.listConfiguredAgents(),
    workflowStore: this.cloneWorkflowStore(),
    scheduledWorkflowStore: this.cloneScheduledWorkflowStore(),
  };
}
```

- [ ] **Step 5: Re-run the focused persistence tests and typecheck**

Run: `npm test -- src/main/agent-hub.test.ts`

Expected: PASS for the new migration/restore cases.

Run: `npm run typecheck`

Expected: PASS with optional `runtimeSession` wired through `ChatSession` and persistence helpers.

- [ ] **Step 6: Commit the contract and persistence foundation**

```bash
git add src/shared/types.ts src/main/agent-hub.ts src/main/agents/runtime-capabilities.ts src/main/agents/runtime-driver.ts src/main/agent-hub.test.ts
git commit -m "feat: add runtime session contracts"
```

### Task 2: Shared Driver Registry And Interactive Session Manager

**Files:**
- Create: `src/main/agents/process-lease.ts`
- Create: `src/main/agents/interactive-session-manager.ts`
- Modify: `src/main/agent-executor.ts`
- Modify: `src/main/agent-hub.ts`
- Test: `src/main/agents/interactive-session-manager.test.ts`
- Test: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing tests for serialized per-chat commands, no eager attach, and stale detach rejection**

```ts
test("serializes duplicate chat sends through one session queue", async () => {
  const started: string[] = [];
  const session = {
    sendPrompt: vi.fn(async (prompt: string) => {
      started.push(prompt);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }),
    snapshot: () => ({ attachmentState: "idle", attachmentGeneration: 1 }),
  };

  const manager = new InteractiveSessionManager({
    createSession: () => session as any,
    now: () => 1000,
  });

  await Promise.all([
    manager.dispatch("chat-1", (interactive) => interactive.sendPrompt("first")),
    manager.dispatch("chat-1", (interactive) => interactive.sendPrompt("second")),
  ]);

  expect(started).toEqual(["first", "second"]);
});

test("idle sweep only detaches when generation and activity timestamp still match", async () => {
  const detachIfStillExpired = vi.fn(async () => undefined);
  const manager = new InteractiveSessionManager({
    createSession: () => ({ detachIfStillExpired, snapshot: () => ({ attachmentState: "idle", attachmentGeneration: 4, lastMeaningfulActivityAt: 1 }) } as any),
    now: () => 3_700_000,
  });

  manager.getOrCreate("chat-1", {} as any);
  await manager.sweepExpiredSessions();

  expect(detachIfStillExpired).toHaveBeenCalledWith({
    expectedGeneration: 4,
    expectedLastMeaningfulActivityAt: 1,
    reason: "idle_timeout",
  });
});
```

- [ ] **Step 2: Run the new session-manager slice and verify it fails before the queue and lease layer exists**

Run: `npm test -- src/main/agents/interactive-session-manager.test.ts src/main/agent-hub.test.ts`

Expected: FAIL because `InteractiveSessionManager` and lease-based detach checks do not exist yet.

- [ ] **Step 3: Add a reusable lease token helper and interactive session manager**

```ts
// src/main/agents/process-lease.ts
export class ProcessLease {
  private attachmentGeneration = 0;
  private turnCounter = 0;

  nextAttachmentGeneration(): number {
    this.attachmentGeneration += 1;
    this.turnCounter = 0;
    return this.attachmentGeneration;
  }

  currentAttachmentGeneration(): number {
    return this.attachmentGeneration;
  }

  nextTurnId(): string {
    this.turnCounter += 1;
    return `turn-${this.attachmentGeneration}-${this.turnCounter}`;
  }

  matchesAttachment(expected: number): boolean {
    return this.attachmentGeneration === expected;
  }
}
```

```ts
// src/main/agents/runtime-driver.ts
import type { AgentEvent, AgentId, AgentRuntime } from "../../shared/types";
import type { RuntimeCapabilities } from "./runtime-capabilities";

export interface RuntimeSessionEvent {
  attachmentGeneration: number;
  turnId?: string;
  event: AgentEvent;
}

export interface InteractiveSession {
  reconfigure(context: InteractiveSessionContext): void;
  ensureAttached(): Promise<void>;
  sendPrompt(prompt: string): Promise<void>;
  interrupt(): Promise<void>;
  detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void>;
  detachIfStillExpired(input: {
    expectedGeneration: number;
    expectedLastMeaningfulActivityAt: number;
    reason: "idle_timeout" | "app_shutdown" | "error";
  }): Promise<void>;
  snapshot(): ChatRuntimeSessionState;
}

export interface RuntimeDriver {
  runtimeId: AgentId;
  getCapabilities(runtime: AgentRuntime): RuntimeCapabilities;
  createOneShotExecutor(context: AgentExecutionContext): AgentExecutor;
  createInteractiveSession?(context: InteractiveSessionContext): InteractiveSession;
}
```

```ts
// src/main/agents/interactive-session-manager.ts
export class InteractiveSessionManager {
  private readonly sessions = new Map<string, { session: InteractiveSession; queue: Promise<void> }>();

  getOrCreate(chatId: string, context: InteractiveSessionContext): InteractiveSession {
    const existing = this.sessions.get(chatId);
    if (existing) {
      existing.session.reconfigure(context);
      return existing.session;
    }
    const session = this.options.createSession(context);
    this.sessions.set(chatId, { session, queue: Promise.resolve() });
    return session;
  }

  async dispatch(chatId: string, work: (session: InteractiveSession) => Promise<void>): Promise<void> {
    const managed = this.sessions.get(chatId);
    if (!managed) throw new Error(`Unknown interactive session: ${chatId}`);
    managed.queue = managed.queue.then(() => work(managed.session));
    await managed.queue;
  }

  async sweepExpiredSessions(now = this.options.now()): Promise<void> {
    for (const [chatId, managed] of this.sessions) {
      const snapshot = managed.session.snapshot();
      if ((snapshot.attachmentState === "idle" || snapshot.attachmentState === "interrupted") && snapshot.lastMeaningfulActivityAt && now - snapshot.lastMeaningfulActivityAt > 60 * 60 * 1000) {
        await this.dispatch(chatId, (session) =>
          session.detachIfStillExpired({
            expectedGeneration: snapshot.attachmentGeneration,
            expectedLastMeaningfulActivityAt: snapshot.lastMeaningfulActivityAt!,
            reason: "idle_timeout",
          }),
        );
      }
    }
  }
}
```

- [ ] **Step 4: Replace runtime-id branching in `agent-executor.ts` with a driver registry and wire `AgentHub` chat sends through the session manager**

```ts
// src/main/agent-executor.ts
export class RuntimeDriverRegistry {
  constructor(private readonly drivers: RuntimeDriver[]) {}

  driverFor(agentId: AgentId): RuntimeDriver {
    const driver = this.drivers.find((item) => item.runtimeId === agentId);
    if (!driver) throw new Error(`No runtime driver registered for ${agentId}`);
    return driver;
  }
}

export class RuntimeAgentExecutorFactory implements AgentExecutorFactory {
  constructor(private readonly registry: RuntimeDriverRegistry) {}

  create(context: AgentExecutionContext): AgentExecutor {
    return this.registry.driverFor(context.agentId).createOneShotExecutor(context);
  }
}
```

```ts
// src/main/agent-hub.ts
private readonly interactiveSessions = new InteractiveSessionManager({
  createSession: (context) => {
    const resolved = this.resolveConfiguredAgent(context.configuredAgentId, context.modelId);
    if (!resolved) throw new Error("No configured agent is selected.");
    const driver = this.runtimeDrivers.driverFor(resolved.runtimeAgentId);
    if (!driver.createInteractiveSession) throw new Error(`${resolved.runtimeAgentId} is not interactive.`);
    return driver.createInteractiveSession(context);
  },
  now: () => Date.now(),
});

async sendPrompt(prompt: string, chatId = this.activeChatId): Promise<void> {
  if (!chatId) return;
  const chat = this.chats.get(chatId);
  if (!chat || chat.running) return;
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return;
  if (trimmedPrompt.startsWith("/")) {
    await this.handleSlashCommand(chat, trimmedPrompt);
    return;
  }

  const resolved = this.resolveConfiguredAgent(chat.configuredAgentId, chat.modelId);
  if (!resolved) {
    chat.messages.push(createErrorMessage("No configured agent is selected."));
    chat.lastError = "No configured agent selected";
    chat.updatedAt = Date.now();
    this.emit();
    return;
  }

  if (!resolved.runtime?.available) {
    chat.messages.push(createErrorMessage(`${resolved.agent.name || resolved.agent.id} is not available on this machine.`));
    chat.lastError = `${resolved.runtimeAgentId} unavailable`;
    chat.updatedAt = Date.now();
    this.emit();
    return;
  }

  if (!hasAgentConversationMessages(chat.messages)) chat.title = titleFromPrompt(trimmedPrompt);
  chat.messages.push(createUserMessage(trimmedPrompt));
  chat.running = true;
  chat.lastError = undefined;
  chat.pendingAssistantMessageId = undefined;
  chat.updatedAt = Date.now();
  this.activeChatId = chat.id;
  this.emit();

  if (chat.runtimeSession?.executionStyle === "interactive") {
    const interactiveContext = this.buildInteractiveChatContext(chat, resolved);
    this.interactiveSessions.getOrCreate(chat.id, interactiveContext);
    await this.interactiveSessions.dispatch(chat.id, (session) => session.sendPrompt(trimmedPrompt));
    return;
  }

  void this.runChat(chat, trimmedPrompt, resolved);
}
```

- [ ] **Step 5: Re-run the manager and hub tests, then commit the session-management boundary**

Run: `npm test -- src/main/agents/interactive-session-manager.test.ts src/main/agent-hub.test.ts`

Expected: PASS for serialized command execution, no eager attach, and guarded idle detach.

Run: `npm run typecheck`

Expected: PASS with `AgentHub` routing chat execution through the session manager for interactive runtimes.

- [ ] **Step 6: Commit the shared manager and registry**

```bash
git add src/main/agents/process-lease.ts src/main/agents/interactive-session-manager.ts src/main/agent-executor.ts src/main/agent-hub.ts src/main/agents/interactive-session-manager.test.ts src/main/agent-hub.test.ts
git commit -m "feat: add interactive session manager"
```

### Task 3: Codex Interactive Chat Session

**Files:**
- Create: `src/main/agents/codex-interactive-session.ts`
- Modify: `src/main/agents/codex-rpc.ts`
- Modify: `src/main/agent-executor.ts`
- Modify: `src/main/agent-hub.ts`
- Test: `src/main/agents/codex-interactive-session.test.ts`
- Test: `src/main/agents/codex-rpc.test.ts`
- Test: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing tests for one-process-per-chat reuse, idle detach, and turn-scoped interrupt**

```ts
test("reuses one Codex attachment for sequential prompts in the same chat", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-interactive-"));
  const fake = await writeSequentialCodexFake(dir);
  const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
  (hub as any).runtimes.set("codex", { id: "codex", label: "Codex", command: fake.executable, version: "test", available: true });

  const chatId = hub.snapshot().activeChatId!;
  await hub.sendPrompt("First", chatId);
  await waitFor(() => hub.snapshot().chats.find((chat) => chat.id === chatId), (chat) => chat?.running === false);
  await hub.sendPrompt("Second", chatId);
  await waitFor(() => hub.snapshot().chats.find((chat) => chat.id === chatId), (chat) => chat?.running === false);

  const calls = readJsonLines(fake.callsPath);
  expect(calls.filter((call) => call.method === "initialize")).toHaveLength(1);
  expect(calls.filter((call) => call.method === "thread/start")).toHaveLength(1);
  expect(calls.filter((call) => call.method === "turn/start")).toHaveLength(2);
});

test("detaches an idle Codex attachment and resumes the same thread on the next prompt", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-session-"));
  const seen: AgentEvent[] = [];
  const client = {
    start: vi.fn(async () => undefined),
    request: vi.fn(async (method: string, params: any) => {
      if (method === "thread/start") return { thread: { id: "thread-1" } };
      if (method === "thread/resume") return { thread: { id: params.threadId } };
      if (method === "turn/start") return { turn: { id: `turn-${params.input[0].text}` } };
      return {};
    }),
    shutdown: vi.fn(async () => undefined),
    interruptTurn: vi.fn(async () => undefined),
  };
  const session = new CodexInteractiveSession({
    modelId: "default",
    workDir: dir,
    developerInstructions: "test",
    createCodexClient: () => client as unknown as CodexRpcClient,
    onEvent: (event) => seen.push(event),
  } as any);
  await session.sendPrompt("First");
  const first = session.snapshot().resumeState;
  await session.detachIfStillExpired({
    expectedGeneration: session.snapshot().attachmentGeneration,
    expectedLastMeaningfulActivityAt: session.snapshot().lastMeaningfulActivityAt!,
    reason: "idle_timeout",
  });
  await session.sendPrompt("Second");
  expect(session.snapshot().resumeState).toEqual(first);
});
```

- [ ] **Step 2: Run the Codex-focused slice and verify it fails before the interactive session exists**

Run: `npm test -- src/main/agents/codex-interactive-session.test.ts src/main/agents/codex-rpc.test.ts src/main/agent-hub.test.ts`

Expected: FAIL because Codex chat still creates a fresh executor process per send.

- [ ] **Step 3: Implement `CodexInteractiveSession` with lease-checked attach, prompt send, and detach**

```ts
// src/main/agents/codex-interactive-session.ts
export class CodexInteractiveSession implements InteractiveSession {
  private readonly lease = new ProcessLease();
  private client: CodexRpcClient | undefined;
  private resumeState: PersistedResumeState | undefined;
  private attachmentState: ChatRuntimeSessionState["attachmentState"] = "detached";
  private activeTurnId: string | undefined;
  private lastMeaningfulActivityAt: number | undefined;

  constructor(private context: InteractiveSessionContext) {}

  reconfigure(context: InteractiveSessionContext): void {
    this.context = context;
  }

  async ensureAttached(): Promise<void> {
    if (this.client) return;
    const generation = this.lease.nextAttachmentGeneration();
    this.client = this.context.createCodexClient({
      onEvent: (event) => this.forwardEvent(generation, this.activeTurnId, event),
      onExit: () => {
        this.attachmentState = "detached";
        this.activeTurnId = undefined;
      },
    });
    await this.client.start();
    const result = this.resumeState?.runtimeId === "codex"
      ? await this.client.request("thread/resume", {
          threadId: this.resumeState.native.threadId,
          model: runtimeModelId(this.context.modelId),
          cwd: this.context.workDir,
          approvalPolicy: "never",
          developerInstructions: this.context.developerInstructions,
          modelProvider: null,
          config: null,
          baseInstructions: null,
        })
      : await this.client.request("thread/start", {
          model: runtimeModelId(this.context.modelId),
          cwd: this.context.workDir,
          approvalPolicy: "never",
          developerInstructions: this.context.developerInstructions,
          modelProvider: null,
          profile: null,
          config: null,
          baseInstructions: null,
          compactPrompt: null,
          includeApplyPatchTool: null,
          experimentalRawEvents: true,
          persistExtendedHistory: true,
        });
    const threadId = (result as { thread?: { id?: string } }).thread?.id;
    if (threadId) {
      this.resumeState = {
        runtimeId: "codex",
        native: { threadId },
        appContext: { cwd: this.context.workDir, modelId: this.context.modelId, approvalPolicy: "never" },
      };
    }
    this.attachmentState = "idle";
  }

  async sendPrompt(prompt: string): Promise<void> {
    await this.ensureAttached();
    const turnId = this.lease.nextTurnId();
    this.activeTurnId = turnId;
    this.attachmentState = "running";
    this.touch();
    await this.client!.request("turn/start", {
      threadId: this.codexThreadId(),
      input: [{ type: "text", text: prompt, text_elements: [] }],
    });
  }

  async interrupt(): Promise<void> {
    if (!this.client) return;
    this.attachmentState = "interrupted";
    await this.client.interruptTurn(this.codexThreadId(), this.activeTurnId);
    this.touch();
  }

  async detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void> {
    await this.client?.shutdown();
    this.client = undefined;
    this.attachmentState = "detached";
    this.activeTurnId = undefined;
  }
}
```

- [ ] **Step 4: Extend the Codex RPC client so the session can interrupt a live turn and preserve thread identity**

```ts
// src/main/agents/codex-rpc.ts
export class CodexRpcClient {
  async interruptTurn(threadId: string, turnId: string | undefined): Promise<void> {
    if (!turnId) {
      await this.shutdown();
      return;
    }
    try {
      await this.request("turn/cancel", { threadId, turnId });
    } catch {
      await this.shutdown();
    }
  }
}
```

```ts
// src/main/agent-executor.ts
const codexDriver: RuntimeDriver = {
  runtimeId: "codex",
  getCapabilities: () => ({
    runtimeId: "codex",
    chatStyle: "interactive",
    taskStyle: "oneshot",
    workflowStyle: "oneshot",
    testStyle: "oneshot",
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: true,
    supportsUserInputRequests: true,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
  }),
  createOneShotExecutor: (context) => new CodexAgentExecutor(context, options),
  createInteractiveSession: (context) => new CodexInteractiveSession(context),
};
```

- [ ] **Step 5: Re-run the Codex slice, then typecheck**

Run: `npm test -- src/main/agents/codex-interactive-session.test.ts src/main/agents/codex-rpc.test.ts src/main/agent-hub.test.ts`

Expected: PASS for single-attachment reuse, idle detach plus same-thread resume, and interrupt fallback.

Run: `npm run typecheck`

Expected: PASS with Codex chat routed through the interactive session path while task and workflow calls still use one-shot execution.

- [ ] **Step 6: Commit the Codex interactive session**

```bash
git add src/main/agents/codex-interactive-session.ts src/main/agents/codex-rpc.ts src/main/agent-executor.ts src/main/agent-hub.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/codex-rpc.test.ts src/main/agent-hub.test.ts
git commit -m "feat: reuse codex chat sessions"
```

### Task 4: Claude Interactive Session And Transport Boundary

**Files:**
- Create: `src/main/agents/claude-interactive-session.ts`
- Create: `src/main/agents/claude-sdk-interactive-transport.ts`
- Modify: `src/main/agents/claude-runner.ts`
- Modify: `src/main/agent-executor.ts`
- Modify: `src/main/agent-hub.ts`
- Test: `src/main/agents/claude-interactive-session.test.ts`
- Test: `src/main/agents/claude-runner.test.ts`
- Test: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing Claude tests for lazy attach, session reuse, and honest detached restore**

```ts
test("does not spawn Claude until the first prompt and reuses the same session id for follow-up prompts", async () => {
  const starts: Array<{ prompt: string; sessionId?: string }> = [];
  const session = new ClaudeInteractiveSession({
    createTransport: () => ({
      startTurn: async (input) => {
        starts.push({ prompt: input.prompt, sessionId: input.sessionId });
        input.onEvent({ type: "session", sessionId: input.sessionId ?? "claude-session-1" });
        input.onEvent({ type: "completed", content: `reply:${input.prompt}` });
        return { stop: async () => undefined };
      },
      interrupt: async () => undefined,
      detach: async () => undefined,
    }),
  } as any);

  expect(starts).toHaveLength(0);
  await session.sendPrompt("first");
  await session.sendPrompt("second");

  expect(starts).toEqual([
    { prompt: "first", sessionId: undefined },
    { prompt: "second", sessionId: "claude-session-1" },
  ]);
});

test("restores Claude attachments as detached instead of pretending the old process survived restart", () => {
  const restored = restoreRuntimeSession({
    executionStyle: "interactive",
    attachmentState: "running",
    attachmentGeneration: 9,
    resumeState: { runtimeId: "claude", native: { sessionId: "claude-session-1" } },
  });

  expect(restored).toMatchObject({
    attachmentState: "detached",
    attachmentGeneration: 0,
    resumeState: { runtimeId: "claude", native: { sessionId: "claude-session-1" } },
  });
});
```

- [ ] **Step 2: Run the Claude-focused slice and verify it fails before the shared session path exists**

Run: `npm test -- src/main/agents/claude-interactive-session.test.ts src/main/agents/claude-runner.test.ts src/main/agent-hub.test.ts`

Expected: FAIL because Claude chat still launches through the one-shot executor path.

- [ ] **Step 3: Add a swappable Claude transport boundary and a shared interactive session**

```ts
// src/main/agents/claude-sdk-interactive-transport.ts
import type { AgentEvent } from "../../shared/types";

export interface ClaudeInteractiveTransportHandle {
  stop(): Promise<void>;
}

export interface ClaudeInteractiveTransport {
  startTurn(input: {
    prompt: string;
    sessionId: string | undefined;
    modelId: string | undefined;
    cwd: string;
    onEvent: (event: AgentEvent) => void;
  }): Promise<ClaudeInteractiveTransportHandle>;
  interrupt(): Promise<void>;
  detach(): Promise<void>;
}
```

```ts
// src/main/agents/claude-interactive-session.ts
export class ClaudeInteractiveSession implements InteractiveSession {
  private readonly lease = new ProcessLease();
  private handle: ClaudeInteractiveTransportHandle | undefined;
  private transport: ClaudeInteractiveTransport;
  private resumeState: PersistedResumeState | undefined;
  private attachmentState: ChatRuntimeSessionState["attachmentState"] = "detached";
  private activeTurnId: string | undefined;
  private lastMeaningfulActivityAt: number | undefined;

  constructor(private context: InteractiveSessionContext) {
    this.transport = context.createClaudeTransport();
  }

  async ensureAttached(): Promise<void> {
    if (this.attachmentState !== "detached") return;
    this.lease.nextAttachmentGeneration();
    this.attachmentState = "idle";
  }

  async sendPrompt(prompt: string): Promise<void> {
    await this.ensureAttached();
    const turnId = this.lease.nextTurnId();
    this.activeTurnId = turnId;
    this.attachmentState = "running";
    this.touch();
    this.handle = await this.transport.startTurn({
      prompt,
      sessionId: this.resumeState?.runtimeId === "claude" ? this.resumeState.native.sessionId : undefined,
      modelId: this.context.modelId,
      cwd: this.context.workDir,
      onEvent: (event) => {
        if (event.type === "session") {
          this.resumeState = {
            runtimeId: "claude",
            native: { sessionId: event.sessionId },
            appContext: { cwd: this.context.workDir, modelId: this.context.modelId },
          };
        }
        this.forwardEvent(this.lease.currentAttachmentGeneration(), turnId, event);
      },
    });
  }

  async interrupt(): Promise<void> {
    this.attachmentState = "interrupted";
    await this.transport.interrupt();
    this.touch();
  }

  async detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void> {
    await this.handle?.stop();
    await this.transport.detach();
    this.handle = undefined;
    this.attachmentState = "detached";
    this.activeTurnId = undefined;
  }
}
```

- [ ] **Step 4: Adapt `ClaudeRunner` behind the new transport contract and register Claude as an interactive runtime**

```ts
// src/main/agents/claude-runner.ts
export class ClaudeRunner {
  async start(): Promise<void> {
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode",
      "bypassPermissions",
    ];
    if (this.options.modelId) args.push("--model", this.options.modelId);
    if (this.options.sessionId) args.push("--resume", this.options.sessionId);
    args.push(this.options.prompt);

    const proc = spawnCli({
      executable: this.options.executable,
      args,
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = proc;
    if (!proc.stdout || !proc.stderr) throw new Error("Claude runner failed to create stdout/stderr pipes");
  }

  async interrupt(): Promise<void> {
    this.proc?.kill("SIGINT");
  }
}
```

```ts
// src/main/agent-executor.ts
const claudeDriver: RuntimeDriver = {
  runtimeId: "claude",
  getCapabilities: () => ({
    runtimeId: "claude",
    chatStyle: "interactive",
    taskStyle: "oneshot",
    workflowStyle: "oneshot",
    testStyle: "oneshot",
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: true,
    supportsUserInputRequests: true,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    },
  }),
  createOneShotExecutor: (context) => new ClaudeAgentExecutor(context, options),
  createInteractiveSession: (context) => new ClaudeInteractiveSession(context),
};
```

- [ ] **Step 5: Re-run the Claude slice, then typecheck**

Run: `npm test -- src/main/agents/claude-interactive-session.test.ts src/main/agents/claude-runner.test.ts src/main/agent-hub.test.ts`

Expected: PASS for lazy attach, session reuse, detached restore, and driver-level interactive routing.

Run: `npm run typecheck`

Expected: PASS with Claude chat using the same shared interactive session boundary as Codex.

- [ ] **Step 6: Commit the Claude session boundary**

```bash
git add src/main/agents/claude-interactive-session.ts src/main/agents/claude-sdk-interactive-transport.ts src/main/agents/claude-runner.ts src/main/agent-executor.ts src/main/agent-hub.ts src/main/agents/claude-interactive-session.test.ts src/main/agents/claude-runner.test.ts src/main/agent-hub.test.ts
git commit -m "feat: route claude chat through shared sessions"
```

### Task 5: Recovery, Docs, And Final Verification

**Files:**
- Modify: `src/main/agent-hub.ts`
- Modify: `src/preload/index.test.ts`
- Modify: `docs/architecture-overview.md`
- Modify: `docs/modules/main.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Add the central idle sweep and boot-recovery normalization tests**

```ts
test("boots restored interactive chats detached and does not eagerly reattach them", async () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  await hub.loadPersistedState(storagePathWithRuntimeSessions);
  const chat = hub.snapshot().chats.find((item) => item.id === "chat-1");
  expect(chat?.runtimeSession?.attachmentState).toBe("detached");
});

test("preload snapshot typing still accepts optional runtime session metadata", () => {
  const session: ChatSession = {
    id: "chat-1",
    title: "Chat",
    configuredAgentId: "default-agent",
    modelId: "default",
    sessionId: "thread-1",
    runtimeSession: {
      executionStyle: "interactive",
      attachmentState: "idle",
      attachmentGeneration: 1,
      capabilities: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: true,
        supportsResumeAfterAppRestart: true,
        supportsTurnResume: false,
        supportsInterrupt: true,
        supportsContinue: true,
        supportsApprovalRequests: true,
        supportsUserInputRequests: true,
      },
    },
    running: false,
    messages: [],
    pendingAssistantMessageId: undefined,
    lastError: undefined,
    createdAt: 0,
    updatedAt: 0,
  };
  expect(session.runtimeSession?.attachmentState).toBe("idle");
});
```

- [ ] **Step 2: Wire the idle sweep into `AgentHub` and keep the preload surface stable**

```ts
// src/main/agent-hub.ts
private idleSweepTimer: ReturnType<typeof setInterval> | undefined;

async initialize(): Promise<void> {
  const runtimes = await detectAgentRuntimes();
  for (const runtime of runtimes) this.runtimes.set(runtime.id, { ...runtime, command: runtime.command || this.executables[runtime.id] });
  this.idleSweepTimer ??= setInterval(() => {
    void this.interactiveSessions.sweepExpiredSessions(Date.now());
  }, 30 * 60 * 1000);
  this.emit();
}
```

```ts
// src/preload/index.test.ts
expectTypeOf<Awaited<ReturnType<typeof api.getSnapshot>>>().toMatchTypeOf<AppSnapshot>();
expectTypeOf<ChatSession["runtimeSession"]>().toEqualTypeOf<ChatRuntimeSessionState | undefined>();
```

- [ ] **Step 3: Update the architecture docs to describe the new runtime boundary honestly**

```md
<!-- docs/architecture-overview.md -->
- `src/main/agent-executor.ts`: thin runtime driver registry and one-shot execution bridge
- `src/main/agents/runtime-driver.ts`: shared runtime capability and session interfaces
- `src/main/agents/interactive-session-manager.ts`: per-chat interactive queue, idle sweeping, and detach orchestration
- `src/main/agents/codex-interactive-session.ts`: long-lived Codex app-server chat attachment
- `src/main/agents/claude-interactive-session.ts`: shared Claude chat attachment boundary
```

```md
<!-- docs/modules/main.md -->
The main-process execution layer now has two styles:

- `oneshot`: one request per task or API call
- `interactive`: one logical chat session with a lazily attached runtime process

`AgentHub` remains the state authority, but interactive process lifecycle is owned by the session manager plus runtime-specific session helpers under `src/main/agents/`.
```

- [ ] **Step 4: Run the full focused verification set**

Run:

```bash
npm run typecheck
npm test -- src/main/agent-hub.test.ts src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/codex-rpc.test.ts src/main/agents/claude-interactive-session.test.ts src/main/agents/claude-runner.test.ts src/preload/index.test.ts
```

Expected:

- `npm run typecheck`: PASS
- `npm test -- src/main/agent-hub.test.ts src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/codex-rpc.test.ts src/main/agents/claude-interactive-session.test.ts src/main/agents/claude-runner.test.ts src/preload/index.test.ts`: PASS
- no new renderer-wide or unrelated slash-command regressions are claimed green unless they are actually run separately

- [ ] **Step 5: Inspect the diff for scope discipline and commit docs plus recovery changes**

```bash
git diff -- src/main/agent-hub.ts src/preload/index.test.ts docs/architecture-overview.md docs/modules/main.md docs/README.md
git add src/main/agent-hub.ts src/preload/index.test.ts docs/architecture-overview.md docs/modules/main.md docs/README.md
git commit -m "docs: finalize runtime execution architecture"
```
