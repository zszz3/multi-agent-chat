# Claude SDK Interactive Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Claude CLI compatibility transport behind the shared interactive-session boundary with an SDK-backed transport that preserves lazy attach, uses persisted Claude resume metadata honestly, and keeps the CLI path only as an explicit compatibility fallback.

**Architecture:** Keep `AgentHub` and `ClaudeInteractiveSession` as the product-facing orchestration boundary. Split the current misleading `claude-sdk-interactive-transport.ts` into a real transport contract plus separate CLI and SDK implementations, then select the backend in the Claude runtime driver without widening `AgentHub` runtime branches. The SDK path must consume the richer Claude `PersistedResumeState` that already exists in `src/shared/types.ts`, while resume capabilities stay false whenever the compatibility CLI backend is selected.

**Tech Stack:** Electron main process, TypeScript, Vitest, official Claude SDK package, existing Claude CLI stream-json fallback, JSON/Markdown repo docs.

---

### Task 1: Freeze The Claude Interactive Transport Seam Around Full Resume State

**Files:**
- Create: `src/main/agents/claude-interactive-transport.ts`
- Create: `src/main/agents/claude-cli-interactive-transport.ts`
- Modify: `src/main/agents/claude-interactive-session.ts`
- Modify: `src/main/agent-executor.ts`
- Test: `src/main/agents/claude-interactive-session.test.ts`

- [ ] **Step 1: Add a failing session test that proves the transport receives the full Claude resume envelope, not only `sessionId`**

```ts
test("passes the persisted Claude resume envelope into the transport", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-resume-envelope-"));
  const starts: Array<{ resumeState?: Extract<PersistedResumeState, { runtimeId: "claude" }> }> = [];

  const session = new ClaudeInteractiveSession(
    {
      chatId: "chat-1",
      configuredAgentId: "claude-agent",
      runtimeId: "claude",
      runtime: claudeRuntime("claude"),
      channelId: "claude-code",
      workDir: dir,
      modelId: "claude-sonnet-4-6",
      developerInstructions: "test",
      resumeState: {
        runtimeId: "claude",
        native: {
          sessionId: "claude-session-1",
          projectKey: "project-1",
          subpaths: ["subagent-a"],
        },
        appContext: {
          cwd: dir,
          modelId: "claude-sonnet-4-6",
          claudeConfigDir: "C:/claude-config",
          sessionStoreRef: "session-store-a",
        },
      },
      emit: () => undefined,
      syncState: () => undefined,
    },
    {
      now: () => 1000,
      capabilities: runtimeSessionCapabilities(),
      createTransport: () => ({
        startTurn: async (input) => {
          starts.push({ resumeState: input.resumeState });
          input.onEvent({ type: "completed", content: "reply" });
          return { stop: async () => undefined };
        },
        interrupt: async () => undefined,
        detach: async () => undefined,
      }),
    },
  );

  await session.sendPrompt("hello");

  expect(starts[0]?.resumeState).toMatchObject({
    runtimeId: "claude",
    native: {
      sessionId: "claude-session-1",
      projectKey: "project-1",
      subpaths: ["subagent-a"],
    },
    appContext: {
      cwd: dir,
      modelId: "claude-sonnet-4-6",
      claudeConfigDir: "C:/claude-config",
      sessionStoreRef: "session-store-a",
    },
  });
});
```

- [ ] **Step 2: Run the focused session test and verify it fails because `ClaudeInteractiveTransport.startTurn(...)` still only receives `sessionId`**

Run: `npm test -- src/main/agents/claude-interactive-session.test.ts`

Expected: FAIL with a TypeScript error or assertion failure around missing `resumeState` on the transport input.

- [ ] **Step 3: Extract the shared transport contract and move the current CLI class behind a correctly named file**

```ts
// src/main/agents/claude-interactive-transport.ts
import type { AgentEvent, PersistedResumeState } from "../../shared/types";

export type ClaudeResumeState = Extract<PersistedResumeState, { runtimeId: "claude" }>;

export interface ClaudeInteractiveTransportHandle {
  stop(): Promise<void>;
}

export interface ClaudeInteractiveTurnInput {
  prompt: string;
  modelId: string | undefined;
  cwd: string;
  resumeState?: ClaudeResumeState;
  onEvent: (event: AgentEvent) => void;
}

export interface ClaudeInteractiveTransport {
  readonly kind: "sdk" | "cli";
  startTurn(input: ClaudeInteractiveTurnInput): Promise<ClaudeInteractiveTransportHandle>;
  interrupt(): Promise<void>;
  detach(): Promise<void>;
}
```

```ts
// src/main/agents/claude-cli-interactive-transport.ts
import { ClaudeRunner } from "./claude-runner";
import type { ClaudeInteractiveTransport, ClaudeInteractiveTransportHandle, ClaudeInteractiveTurnInput } from "./claude-interactive-transport";

interface ClaudeCliInteractiveTransportOptions {
  executable: string;
  cliModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
}

export class ClaudeCliInteractiveTransport implements ClaudeInteractiveTransport {
  readonly kind = "cli" as const;
  private runner: ClaudeRunner | undefined;

  constructor(private readonly options: ClaudeCliInteractiveTransportOptions) {}

  async startTurn(input: ClaudeInteractiveTurnInput): Promise<ClaudeInteractiveTransportHandle> {
    const runner = new ClaudeRunner({
      executable: this.options.executable,
      cwd: input.cwd,
      env: this.options.envForTurn(input.modelId),
      prompt: input.prompt,
      modelId: this.options.cliModelForTurn(input.modelId),
      sessionId: input.resumeState?.native.sessionId,
      onEvent: input.onEvent,
      onExit: () => {
        if (this.runner === runner) this.runner = undefined;
      },
    });
    this.runner = runner;
    await runner.start();
    return {
      stop: async () => {
        if (this.runner === runner) this.runner = undefined;
        await runner.stop();
      },
    };
  }

  async interrupt(): Promise<void> {
    await this.runner?.interrupt();
  }

  async detach(): Promise<void> {
    const runner = this.runner;
    this.runner = undefined;
    await runner?.stop();
  }
}
```

```ts
// src/main/agents/claude-interactive-session.ts
this.handle = await this.transport.startTurn({
  prompt,
  modelId: this.context.modelId,
  cwd: this.context.workDir,
  ...(this.resumeState?.runtimeId === "claude" ? { resumeState: this.resumeState } : {}),
  onEvent: (event) => {
    if (!this.lease.matchesAttachment(generation)) return;
    if (event.type !== "session" && this.activeTurnId !== turnId) return;
    this.handleEvent(event);
  },
});
```

- [ ] **Step 4: Re-run the focused transport seam test and the existing Claude session regression slice**

Run: `npm test -- src/main/agents/claude-interactive-session.test.ts`

Expected: PASS for the new resume-envelope assertion plus the existing session reuse and stale-event rejection tests.

- [ ] **Step 5: Commit the seam extraction before adding the SDK backend**

```bash
git add src/main/agents/claude-interactive-transport.ts src/main/agents/claude-cli-interactive-transport.ts src/main/agents/claude-interactive-session.ts src/main/agent-executor.ts src/main/agents/claude-interactive-session.test.ts
git commit -m "refactor: extract claude interactive transport seam"
```

### Task 2: Add An SDK-Backed Claude Transport Behind Fakeable Bindings

**Files:**
- Modify: `package.json`
- Create: `scripts/inspect-claude-sdk.mjs`
- Create: `docs/superpowers/specs/2026-07-06-claude-sdk-surface.md`
- Create: `src/main/agents/claude-sdk-bindings.ts`
- Create: `src/main/agents/claude-sdk-interactive-transport.ts`
- Test: `src/main/agents/claude-sdk-interactive-transport.test.ts`

- [ ] **Step 1: Write failing unit tests for SDK transport fresh-start and resume flows using fake bindings**

```ts
describe("ClaudeSdkInteractiveTransport", () => {
  test("passes persisted Claude resume metadata into the SDK binding before the turn starts", async () => {
    const starts: Array<{
      prompt: string;
      cwd: string;
      model: string | undefined;
      resumeSessionId: string | undefined;
      projectKey: string | undefined;
      subpaths: string[] | undefined;
      claudeConfigDir: string | undefined;
      sessionStoreRef: string | undefined;
    }> = [];

    const transport = new ClaudeSdkInteractiveTransport({
      executable: "claude",
      envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
      sdkModelForTurn: (modelId) => modelId,
      loadBindings: async () => ({
        startTurn: async (input) => {
          starts.push({
            prompt: input.prompt,
            cwd: input.cwd,
            model: input.model,
            resumeSessionId: input.resume?.sessionId,
            projectKey: input.resume?.projectKey,
            subpaths: input.resume?.subpaths,
            claudeConfigDir: input.claudeConfigDir,
            sessionStoreRef: input.sessionStoreRef,
          });
          input.onSdkEvent({ type: "session", sessionId: input.resume?.sessionId ?? "sdk-session-2" });
          input.onSdkEvent({ type: "completed", content: "reply" });
          return { interrupt: async () => undefined, stop: async () => undefined };
        },
      }),
    });

    await transport.startTurn({
      prompt: "hello",
      modelId: "claude-sonnet-4-6",
      cwd: "C:/repo",
      resumeState: {
        runtimeId: "claude",
        native: {
          sessionId: "sdk-session-1",
          projectKey: "project-1",
          subpaths: ["worker-1"],
        },
        appContext: {
          cwd: "C:/repo",
          modelId: "claude-sonnet-4-6",
          claudeConfigDir: "C:/claude-config",
          sessionStoreRef: "session-store-a",
        },
      },
      onEvent: () => undefined,
    });

    expect(starts).toEqual([
      {
        prompt: "hello",
        cwd: "C:/repo",
        model: "claude-sonnet-4-6",
        resumeSessionId: "sdk-session-1",
        projectKey: "project-1",
        subpaths: ["worker-1"],
        claudeConfigDir: "C:/claude-config",
        sessionStoreRef: "session-store-a",
      },
    ]);
  });

  test("normalizes SDK turn events into the shared AgentEvent stream", async () => {
    const emitted: AgentEvent[] = [];
    const transport = new ClaudeSdkInteractiveTransport({
      executable: "claude",
      envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
      sdkModelForTurn: (modelId) => modelId,
      loadBindings: async () => ({
        startTurn: async (input) => {
          input.onSdkEvent({ type: "session", sessionId: "sdk-session-2" });
          input.onSdkEvent({ type: "delta", content: "Hello" });
          input.onSdkEvent({ type: "completed", content: "Hello" });
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
      { type: "session", sessionId: "sdk-session-2" },
      { type: "delta", content: "Hello" },
      { type: "completed", content: "Hello" },
    ]);
  });
});
```

- [ ] **Step 2: Run the focused SDK transport test slice and verify it fails because the SDK transport and bindings files do not exist yet**

Run: `npm test -- src/main/agents/claude-sdk-interactive-transport.test.ts`

Expected: FAIL with module-not-found errors for the new SDK transport and bindings modules.

- [ ] **Step 3: Add the official SDK dependency with `npm install` and capture the real export surface into a checked-in artifact before wiring the adapter**

```js
// scripts/inspect-claude-sdk.mjs
const mod = await import("@anthropic-ai/claude-code");
const keys = Object.keys(mod).sort();

process.stdout.write("# Claude SDK Surface\n\n");
process.stdout.write("Generated from `node scripts/inspect-claude-sdk.mjs` after installing `@anthropic-ai/claude-code`.\n\n");
for (const key of keys) {
  process.stdout.write(`- ${key}\n`);
}
```

Run:

```bash
npm install @anthropic-ai/claude-code
node .\scripts\inspect-claude-sdk.mjs > docs\superpowers\specs\2026-07-06-claude-sdk-surface.md
```

Expected: `package.json` and the lockfile both record the exact SDK version chosen by npm, and the new spec artifact lists the real exported SDK symbols that the adapter is allowed to depend on.

- [ ] **Step 4: Implement fakeable SDK bindings plus a real SDK transport that only depends on the checked-in export surface**

```ts
// src/main/agents/claude-sdk-bindings.ts
export interface ClaudeSdkBindingTurnHandle {
  interrupt(): Promise<void>;
  stop(): Promise<void>;
}

export interface ClaudeSdkBindingTurnInput {
  prompt: string;
  cwd: string;
  model: string | undefined;
  env: NodeJS.ProcessEnv;
  resume?: {
    sessionId: string;
    projectKey?: string;
    subpaths?: string[];
  };
  claudeConfigDir?: string;
  sessionStoreRef?: string;
  onSdkEvent: (event: { type: string; [key: string]: unknown }) => void;
}

export interface ClaudeSdkBindings {
  startTurn(input: ClaudeSdkBindingTurnInput): Promise<ClaudeSdkBindingTurnHandle>;
}

export async function loadClaudeSdkBindings(): Promise<ClaudeSdkBindings> {
  const mod = (await import("@anthropic-ai/claude-code")) as Record<string, unknown>;

  const query = mod.query;
  if (typeof query !== "function") {
    throw new Error("Claude SDK export `query` is unavailable; update claude-sdk-bindings.ts using docs/superpowers/specs/2026-07-06-claude-sdk-surface.md.");
  }

  return {
    async startTurn(input) {
      const controller = new AbortController();
      const result = query({
        prompt: input.prompt,
        options: {
          cwd: input.cwd,
          model: input.model,
          resume: input.resume?.sessionId,
          env: input.env,
        },
      });

      void (async () => {
        for await (const event of result) {
          input.onSdkEvent(event as { type: string; [key: string]: unknown });
        }
      })();

      return {
        interrupt: async () => controller.abort(),
        stop: async () => controller.abort(),
      };
    },
  };
}
```

```ts
// src/main/agents/claude-sdk-interactive-transport.ts
import type { AgentEvent } from "../../shared/types";
import type { ClaudeInteractiveTransport, ClaudeInteractiveTransportHandle, ClaudeInteractiveTurnInput } from "./claude-interactive-transport";
import { loadClaudeSdkBindings } from "./claude-sdk-bindings";

interface ClaudeSdkInteractiveTransportOptions {
  executable: string;
  sdkModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
  loadBindings?: typeof loadClaudeSdkBindings;
}

export class ClaudeSdkInteractiveTransport implements ClaudeInteractiveTransport {
  readonly kind = "sdk" as const;
  private handle: ClaudeInteractiveTransportHandle | undefined;
  private bindingHandle: Awaited<ReturnType<ClaudeSdkBindings["startTurn"]>> | undefined;

  constructor(private readonly options: ClaudeSdkInteractiveTransportOptions) {}

  async startTurn(input: ClaudeInteractiveTurnInput): Promise<ClaudeInteractiveTransportHandle> {
    const bindings = await (this.options.loadBindings ?? loadClaudeSdkBindings)();
    const bindingHandle = await bindings.startTurn({
      prompt: input.prompt,
      cwd: input.cwd,
      model: this.options.sdkModelForTurn(input.modelId),
      env: this.options.envForTurn(input.modelId),
      ...(input.resumeState
        ? {
            resume: {
              sessionId: input.resumeState.native.sessionId,
              ...(input.resumeState.native.projectKey !== undefined ? { projectKey: input.resumeState.native.projectKey } : {}),
              ...(input.resumeState.native.subpaths !== undefined ? { subpaths: [...input.resumeState.native.subpaths] } : {}),
            },
            claudeConfigDir: input.resumeState.appContext?.claudeConfigDir,
            sessionStoreRef: input.resumeState.appContext?.sessionStoreRef,
          }
        : {}),
      onSdkEvent: (event) => {
        const normalized = normalizeClaudeSdkEvent(event);
        for (const sharedEvent of normalized) input.onEvent(sharedEvent);
      },
    });

    this.bindingHandle = bindingHandle;

    this.handle = {
      stop: async () => {
        if (this.handle) this.handle = undefined;
        const current = this.bindingHandle;
        this.bindingHandle = undefined;
        await current?.stop();
      },
    };

    return this.handle;
  }

  async interrupt(): Promise<void> {
    await this.bindingHandle?.interrupt();
  }

  async detach(): Promise<void> {
    await this.bindingHandle?.stop();
    this.bindingHandle = undefined;
    this.handle = undefined;
  }
}

function normalizeClaudeSdkEvent(event: { type: string; [key: string]: unknown }): AgentEvent[] {
  if (event.type === "session" && typeof event.sessionId === "string") {
    return [{ type: "session", sessionId: event.sessionId }];
  }
  if (event.type === "delta" && typeof event.content === "string") {
    return [{ type: "delta", content: event.content }];
  }
  if (event.type === "completed") {
    return typeof event.content === "string" ? [{ type: "completed", content: event.content }] : [{ type: "completed" }];
  }
  if (event.type === "error" && typeof event.error === "string") {
    return [{ type: "error", error: event.error }];
  }
  return [];
}
```

- [ ] **Step 5: Re-run the focused SDK transport tests**

Run: `npm test -- src/main/agents/claude-sdk-interactive-transport.test.ts`

Expected: PASS for resume-state forwarding and shared-event normalization through fake bindings.

- [ ] **Step 6: Commit the SDK transport slice**

```bash
git add package.json scripts/inspect-claude-sdk.mjs docs/superpowers/specs/2026-07-06-claude-sdk-surface.md src/main/agents/claude-sdk-bindings.ts src/main/agents/claude-sdk-interactive-transport.ts src/main/agents/claude-sdk-interactive-transport.test.ts
git commit -m "feat: add claude sdk interactive transport"
```

### Task 3: Select The Backend In The Claude Driver And Make Capability Claims Truthful

**Files:**
- Create: `src/main/agents/claude-transport-selection.ts`
- Modify: `src/main/agent-executor.ts`
- Modify: `src/main/agent-hub.test.ts`
- Test: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing integration tests for backend selection and truthful Claude resume capabilities**

```ts
test("uses the SDK transport by default and exposes Claude resume-after-detach capabilities only on that path", async () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "claude" });
  addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);

  const capabilities = (hub as any).runtimeDriverRegistry.driverFor("claude").getCapabilities({
    id: "claude",
    label: "Claude",
    command: "claude",
    version: "test",
    available: true,
  });

  expect(capabilities.resume).toMatchObject({
    supportsInProcessConversationResume: true,
    supportsResumeAfterDetach: true,
    supportsResumeAfterAppRestart: true,
  });
});

test("falls back to the CLI compatibility transport when CLAUDE_INTERACTIVE_TRANSPORT=cli", async () => {
  const original = process.env.CLAUDE_INTERACTIVE_TRANSPORT;
  process.env.CLAUDE_INTERACTIVE_TRANSPORT = "cli";
  try {
    const capabilities = createRuntimeDriverRegistry({
      executables: { codex: "codex", claude: "claude", api: "api" },
      channelById: () => undefined,
      respondToCodexServerRequest: () => undefined,
    }).driverFor("claude").getCapabilities({
      id: "claude",
      label: "Claude",
      command: "claude",
      version: "test",
      available: true,
    });

    expect(capabilities.resume).toMatchObject({
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
    });
  } finally {
    if (original === undefined) delete process.env.CLAUDE_INTERACTIVE_TRANSPORT;
    else process.env.CLAUDE_INTERACTIVE_TRANSPORT = original;
  }
});
```

- [ ] **Step 2: Run the Claude driver test slice and verify it fails because the driver still hardcodes the CLI transport and false resume flags**

Run: `npm test -- src/main/agent-hub.test.ts`

Expected: FAIL on the new capability assertions for Claude.

- [ ] **Step 3: Add a dedicated transport selector so backend choice and capability claims stay in one place**

```ts
// src/main/agents/claude-transport-selection.ts
import type { RuntimeResumeCapabilities } from "../../shared/types";
import type { ClaudeInteractiveTransport } from "./claude-interactive-transport";
import { ClaudeCliInteractiveTransport } from "./claude-cli-interactive-transport";
import { ClaudeSdkInteractiveTransport } from "./claude-sdk-interactive-transport";

export interface ClaudeTransportSelection {
  createTransport: () => ClaudeInteractiveTransport;
  resume: RuntimeResumeCapabilities;
}

export function selectClaudeInteractiveTransport(input: {
  executable: string;
  cliModelForTurn: (modelId: string | undefined) => string | undefined;
  sdkModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
}): ClaudeTransportSelection {
  if (process.env.CLAUDE_INTERACTIVE_TRANSPORT === "cli") {
    return {
      createTransport: () =>
        new ClaudeCliInteractiveTransport({
          executable: input.executable,
          cliModelForTurn: input.cliModelForTurn,
          envForTurn: input.envForTurn,
        }),
      resume: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: false,
        supportsResumeAfterAppRestart: false,
        supportsTurnResume: false,
      },
    };
  }

  return {
    createTransport: () =>
      new ClaudeSdkInteractiveTransport({
        executable: input.executable,
        sdkModelForTurn: input.sdkModelForTurn,
        envForTurn: input.envForTurn,
      }),
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
  };
}
```

```ts
// src/main/agent-executor.ts
const claudeSelection = selectClaudeInteractiveTransport({
  executable: context.runtime.command || options.executables.claude,
  cliModelForTurn: (modelId) => claudeCliModelForChannel(channel, modelId ?? context.modelId),
  sdkModelForTurn: (modelId) => claudeCliModelForChannel(channel, modelId ?? context.modelId),
  envForTurn: (modelId) => claudeEnvironmentForChannel(channel, modelId ?? context.modelId, process.env),
});

return new ClaudeInteractiveSession(context, {
  capabilities: {
    ...claudeSelection.resume,
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: true,
    supportsUserInputRequests: true,
  },
  createTransport: claudeSelection.createTransport,
});
```

- [ ] **Step 4: Re-run the focused Claude integration slice**

Run: `npm test -- src/main/agent-hub.test.ts src/main/agents/claude-interactive-session.test.ts src/main/agents/claude-sdk-interactive-transport.test.ts`

Expected: PASS for backend selection, truthful capability exposure, and the existing Claude chat session regressions.

- [ ] **Step 5: Commit the backend selection and capability fix**

```bash
git add src/main/agents/claude-transport-selection.ts src/main/agent-executor.ts src/main/agent-hub.test.ts
git commit -m "feat: select claude sdk transport and truthful resume capabilities"
```

### Task 4: Sync Docs To The New Reality And Re-Verify The Runtime Slice

**Files:**
- Modify: `docs/superpowers/specs/2026-07-04-runtime-execution-architecture-design.md`
- Modify: `docs/zh-CN/runtime-execution-architecture-spec.md`
- Modify: `docs/architecture-overview.md`
- Modify: `docs/superpowers/plans/2026-07-05-runtime-execution-architecture.md`

- [ ] **Step 1: Update the English architecture spec status and remove the stale "preferred future-state" wording once the SDK path lands**

```md
## 2026-07-04

### Context

- Branch: `feat/claude-interactive-runtime`
- Status: Phase 2 implemented on top of the completed shared interactive-session slice
- Audience: fresh implementation agents with no prior chat context
- Source of truth: this document defines the runtime-execution boundaries for this repository; current checkout state wins over historical branch assumptions
```

```md
- Claude
  - chat stays `interactive`
  - SDK-backed subprocess transport is the default backend
  - CLI re-entry remains an explicit compatibility transport only
  - PTY stays experimental and opt-in
```

- [ ] **Step 2: Update the zh-CN runtime spec so the current-state section no longer says the SDK transport is pending**

```md
Status line semantics to express in the existing zh-CN wording:
- Phase 1 shared interactive-session landed
- Claude SDK transport landed
- CLI re-entry remains compatibility-only

Current-state bullets to add in the existing zh-CN wording:
- Claude now defaults to the SDK-backed transport
- CLI compatibility transport is only used for explicit fallback
- Claude resume capability claims now match the active transport
```

- [ ] **Step 3: Refresh the architecture overview so it describes the real Claude backend split**

```md
- Claude: shared `ClaudeInteractiveSession` plus a selectable interactive transport
  - default: SDK-backed transport
  - compatibility: CLI `stream-json` re-entry transport
```

- [ ] **Step 4: Run the focused verification set for the whole Claude runtime slice**

Run:

```bash
npm run typecheck
npm test -- src/main/agent-hub.test.ts src/main/agents/claude-interactive-session.test.ts src/main/agents/claude-sdk-interactive-transport.test.ts src/main/agents/claude-runner.test.ts src/main/agents/claude-stream.test.ts
```

Expected: PASS for typecheck and all focused Claude/runtime tests.

- [ ] **Step 5: Commit the docs sync and verification result**

```bash
git add docs/superpowers/specs/2026-07-04-runtime-execution-architecture-design.md docs/zh-CN/runtime-execution-architecture-spec.md docs/architecture-overview.md docs/superpowers/plans/2026-07-05-runtime-execution-architecture.md
git commit -m "docs: sync claude sdk runtime architecture status"
```

### Scope Guardrails

- Do not widen this slice into PTY terminal emulation. The spec explicitly prefers SDK-backed subprocess integration and keeps PTY experimental.
- Do not add new top-level Claude branches in `AgentHub`; runtime selection must stay inside the driver/session/transport layer.
- Do not claim approval or user-input support beyond the shared `AgentEvent` surface already present in this repo. If the SDK exposes richer permission events, normalize them conservatively or defer them to a separate event-model plan.
- Do not mark `supportsResumeAfterDetach` or `supportsResumeAfterAppRestart` true for the CLI compatibility path.
- Do not silently retry the same user prompt across two backends after a partial SDK turn has already started streaming.

### Definition Of Done

- The default Claude chat backend is SDK-backed on this branch.
- The CLI transport remains available only as an explicit compatibility fallback.
- `ClaudeInteractiveSession` passes full Claude resume metadata to its transport.
- Resume capabilities shown to the app match the selected Claude backend honestly.
- Focused Claude/runtime tests plus `npm run typecheck` pass.
- English and zh-CN runtime docs both describe the new backend reality without saying the SDK transport is still pending.
