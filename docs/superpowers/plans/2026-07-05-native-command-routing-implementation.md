# Native Command Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship chat-only native command routing so the app owns only `/app ...`, Codex and Claude receive their native slash prompts unchanged, API runtimes reject non-`/app` slash honestly, slash completion becomes runtime-extensible, and runtime launch overrides work across Windows and macOS install patterns.

**Architecture:** Split the feature into five durable boundaries: a shared `/app` descriptor registry, a main-process chat command router, runtime launch profiles plus persisted global overrides, a completion-provider pipeline, and a learned native command store keyed by runtime fingerprint. Keep `AgentHub` as the state owner, but move slash classification, completion assembly, and launch resolution into focused modules so future runtimes register behavior instead of expanding `if runtimeId === ...` branching.

**Tech Stack:** Electron main/preload/renderer, TypeScript, Vitest, Codex app-server RPC, Claude CLI stream-json, JSON persistence under `userData`.

---

## Rollout Status

- Status: Implemented on `fix/native-command-support` and published to `origin/fix/native-command-support`.
- Purpose of this file now: historical execution ledger plus step-by-step plan for future follow-up work, not a pending execution prompt.
- Scope closure:
  - Task 1 completed in `bb33db5`, with routing edge fixes in `2cf8e9c` and boundary lock-in tests in `631c727`.
  - Task 2 completed in `b6a333a`, which moved chat slash handling onto the runtime-aware router boundary.
  - Task 3 completed in `c42b40a`, with persistence hardening in `fa3f30a`.
  - Task 4 completed in `48bb6cb`, with save-validation and Windows arg handling fixes in `8e12a85`, `0f67747`, and `643ab4a`.
  - Task 5 completed in `1c31f27`, with preload guard hardening in `bec22e2`.
  - Task 6 completed in `0647d76`, with Claude metadata integration and cache follow-ups in `3793461`, `0b3f787`, and `678656d`.
- Post-rollout maintenance:
  - `c2b419b` repaired legacy `App.layout` drift so the focused renderer verification slice stayed trustworthy.
  - `4a26c71` normalized bundled skill / Markdown line-ending handling so Windows and macOS render and parse the same skill content consistently.
- Remaining non-blocking follow-up is limited to the open questions already called out in the design spec; there is no known missing implementation slice for the first-phase scope.

## File Map

**Create**
- `src/shared/app-commands.ts`
- `src/main/chat-command-router.ts`
- `src/main/chat-command-router.test.ts`
- `src/main/runtime-command-store.ts`
- `src/main/runtime-command-store.test.ts`
- `src/main/runtime-launch-profiles.ts`
- `src/main/runtime-launch-profiles.test.ts`
- `src/main/darwin-shell-path.ts`
- `src/main/runtime-command-completions.ts`
- `src/main/runtime-command-completions.test.ts`
- `src/renderer/src/pages/chat/useSlashCommandCompletions.ts`

**Modify**
- `src/shared/types.ts`
- `src/main/agent-hub.ts`
- `src/main/agent-hub.test.ts`
- `src/main/agent-executor.ts`
- `src/main/agents/detect.ts`
- `src/main/agents/detect.test.ts`
- `src/main/agents/codex-rpc.ts`
- `src/main/agents/claude-runner.ts`
- `src/main/agents/codex-events.ts`
- `src/main/agents/codex-events.test.ts`
- `src/main/agents/claude-stream.ts`
- `src/main/agents/claude-stream.test.ts`
- `src/main/cli-launcher.test.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.test.ts`
- `src/renderer/src/AppShell.tsx`
- `src/renderer/src/App.layout.test.tsx`
- `src/renderer/src/pages/chat/chat-utils.tsx`
- `src/renderer/src/pages/chat/ChatPage.tsx`
- `src/renderer/src/pages/runtime/RuntimePage.tsx`
- `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.ts`
- `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts`
- `README.md`
- `docs/architecture-overview.md`
- `docs/modules/main.md`
- `docs/modules/renderer.md`
- `docs/zh-CN/README.md`
- `docs/zh-CN/architecture-overview.md`
- `docs/zh-CN/modules/main.md`
- `docs/zh-CN/modules/renderer.md`

**Notes**
- Do not touch task, workflow, or runtime-test prompt semantics in this slice.
- Do not add long-lived bare aliases for `/status`, `/models`, `/plugins`, or `/help`.
- Do not include `.idea/` in any commit.

### Task 1: Shared `/app` Registry And Chat Router

**Files:**
- Create: `src/shared/app-commands.ts`
- Create: `src/main/chat-command-router.ts`
- Test: `src/main/chat-command-router.test.ts`

- [ ] **Step 1: Add failing router tests for `/app`, native slash, and API rejection**

```ts
import { describe, expect, test } from "vitest";
import { routeChatPrompt } from "./chat-command-router";

describe("routeChatPrompt", () => {
  test("routes /app help as an app-owned command", () => {
    expect(routeChatPrompt("codex", "/app help")).toEqual({
      kind: "app_command",
      commandId: "help",
      commandText: "/app help",
      args: [],
    });
  });

  test("routes bare slash to the runtime for codex and claude", () => {
    expect(routeChatPrompt("codex", "/help")).toEqual({ kind: "runtime_slash", prompt: "/help" });
    expect(routeChatPrompt("claude", "/status")).toEqual({ kind: "runtime_slash", prompt: "/status" });
  });

  test("rejects bare slash honestly for api runtimes", () => {
    expect(routeChatPrompt("api", "/help")).toEqual({
      kind: "unsupported_runtime_slash",
      prompt: "/help",
      reason: "Native slash commands are not supported by API runtimes. Use /app help for app-local commands.",
    });
  });

  test("leaves plain prompts untouched", () => {
    expect(routeChatPrompt("claude", "hello")).toEqual({ kind: "plain_prompt", prompt: "hello" });
  });
});
```

- [ ] **Step 2: Run the focused router test slice and verify it fails before the router exists**

Run: `npm test -- src/main/chat-command-router.test.ts`

Expected: FAIL with missing `routeChatPrompt` module and route result types.

- [ ] **Step 3: Add a single shared descriptor registry for all `/app` commands**

```ts
// src/shared/app-commands.ts
import type { AgentId } from "./types";

export type AppCommandId = "help" | "status" | "models" | "plugins";
export type AppCommandHandlerKey = AppCommandId;

export interface AppCommandDescriptor {
  id: AppCommandId;
  command: `/app ${string}`;
  summary: string;
  supportedRuntimeIds?: AgentId[];
  handlerKey: AppCommandHandlerKey;
}

export const APP_COMMAND_PREFIX = "/app";

export const APP_COMMANDS: readonly AppCommandDescriptor[] = [
  {
    id: "help",
    command: "/app help",
    summary: "Show app-local commands.",
    handlerKey: "help",
  },
  {
    id: "status",
    command: "/app status",
    summary: "Read Codex app-server config, model, plugin, and MCP status.",
    supportedRuntimeIds: ["codex"],
    handlerKey: "status",
  },
  {
    id: "models",
    command: "/app models",
    summary: "List models from Codex app-server.",
    supportedRuntimeIds: ["codex"],
    handlerKey: "models",
  },
  {
    id: "plugins",
    command: "/app plugins",
    summary: "List Codex plugins from app-server marketplaces.",
    supportedRuntimeIds: ["codex"],
    handlerKey: "plugins",
  },
] as const;
```

- [ ] **Step 4: Implement the main-process chat router and runtime policy registry**

```ts
// src/main/chat-command-router.ts
import type { AgentId } from "../shared/types";
import { APP_COMMANDS, APP_COMMAND_PREFIX, type AppCommandId } from "../shared/app-commands";

export type ChatCommandRoute =
  | { kind: "app_command"; commandId: AppCommandId; commandText: string; args: string[] }
  | { kind: "runtime_slash"; prompt: string }
  | { kind: "plain_prompt"; prompt: string }
  | { kind: "unsupported_runtime_slash"; prompt: string; reason: string };

interface RuntimeCommandPolicy {
  runtimeId: AgentId;
  classify(input: string): Exclude<ChatCommandRoute["kind"], "app_command">;
  unsupportedSlashMessage?: (input: string) => string;
}

const POLICIES: Record<AgentId, RuntimeCommandPolicy> = {
  codex: { runtimeId: "codex", classify: (input) => (input.startsWith("/") ? "runtime_slash" : "plain_prompt") },
  claude: { runtimeId: "claude", classify: (input) => (input.startsWith("/") ? "runtime_slash" : "plain_prompt") },
  api: {
    runtimeId: "api",
    classify: (input) => (input.startsWith("/") ? "unsupported_runtime_slash" : "plain_prompt"),
    unsupportedSlashMessage: () => "Native slash commands are not supported by API runtimes. Use /app help for app-local commands.",
  },
};

export function routeChatPrompt(runtimeId: AgentId, rawInput: string): ChatCommandRoute {
  const input = rawInput.trim();
  const lower = input.toLowerCase();
  if (lower === APP_COMMAND_PREFIX || lower.startsWith(`${APP_COMMAND_PREFIX} `)) {
    const [, ...parts] = input.split(/\s+/);
    const commandName = (parts[0] ?? "help").toLowerCase();
    const descriptor = APP_COMMANDS.find((item) => item.id === commandName);
    if (!descriptor) {
      return {
        kind: "app_command",
        commandId: "help",
        commandText: "/app help",
        args: [],
      };
    }
    return {
      kind: "app_command",
      commandId: descriptor.id,
      commandText: descriptor.command,
      args: parts.slice(1),
    };
  }

  const policy = POLICIES[runtimeId];
  const kind = policy.classify(input);
  if (kind === "plain_prompt") return { kind, prompt: input };
  if (kind === "runtime_slash") return { kind, prompt: input };
  return {
    kind,
    prompt: input,
    reason: policy.unsupportedSlashMessage?.(input) ?? "Unsupported slash command.",
  };
}
```

- [ ] **Step 5: Re-run the router tests and typecheck**

Run: `npm test -- src/main/chat-command-router.test.ts`

Expected: PASS for `/app` routing, runtime passthrough, and API rejection.

Run: `npm run typecheck`

Expected: PASS with the new shared app-command descriptor module.

- [ ] **Step 6: Commit the registry and router foundation**

```bash
git add src/shared/app-commands.ts src/main/chat-command-router.ts src/main/chat-command-router.test.ts
git commit -m "feat: add shared chat command router"
```

### Task 2: `AgentHub` Routing Boundary And `/app` Execution

**Files:**
- Modify: `src/main/agent-hub.ts`
- Modify: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing `AgentHub` tests for `/app` handling and bare slash passthrough**

```ts
test("handles /app help locally without starting a runtime conversation", async () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  const chatId = hub.snapshot().activeChatId!;

  await hub.sendPrompt("/app help", chatId);

  const chat = hub.snapshot().chats.find((item) => item.id === chatId);
  expect(chat?.messages).toEqual([
    expect.objectContaining({ role: "user", content: "/app help", local: true }),
    expect.objectContaining({ role: "assistant", local: true, content: expect.stringContaining("/app status") }),
  ]);
  expect(chat?.running).toBe(false);
});

test("forwards bare slash to the runtime path instead of handling it locally", async () => {
  const sends: string[] = [];
  const runtimeDrivers = fakeInteractiveRuntimeDrivers({
    codex: {
      onSendPrompt: async (prompt) => {
        sends.push(prompt);
      },
    },
  });
  const hub = new AgentHub({ codex: "codex-for-test", claude: "missing-claude-for-test" }, undefined, runtimeDrivers);
  const chatId = hub.snapshot().activeChatId!;

  await hub.sendPrompt("/help", chatId);

  expect(sends).toEqual(["/help"]);
  const chat = hub.snapshot().chats.find((item) => item.id === chatId);
  expect(chat?.messages.find((message) => message.local)).toBeUndefined();
});

test("rejects bare slash locally for api chats without locking the chat config", async () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
  addConfiguredAgents(hub, [configuredAgent("api-agent", { runtimeAgentId: "api", name: "API Agent" })]);
  const chatId = hub.snapshot().activeChatId!;
  hub.setChatAgent(chatId, "api-agent");

  await hub.sendPrompt("/help", chatId);

  const chat = hub.snapshot().chats.find((item) => item.id === chatId)!;
  expect(chat.messages.at(-1)).toMatchObject({
    role: "assistant",
    local: true,
    content: expect.stringContaining("Native slash commands are not supported by API runtimes"),
  });
  expect(chatConfigLocked(chat)).toBe(false);
});
```

- [ ] **Step 2: Run the focused `AgentHub` slice and verify it fails on the old bare slash behavior**

Run: `npm test -- src/main/agent-hub.test.ts src/main/chat-command-router.test.ts`

Expected: FAIL because `sendPrompt()` still intercepts every leading slash and the old help text still advertises bare `/status`.

- [ ] **Step 3: Replace the old slash handlers with router-driven `/app` execution**

```ts
// src/main/agent-hub.ts
import { APP_COMMANDS, type AppCommandHandlerKey } from "../shared/app-commands";
import { routeChatPrompt } from "./chat-command-router";

type AppCommandRunner = (chat: ChatState, args: string[]) => Promise<string>;

private readonly appCommandRunners: Record<AppCommandHandlerKey, AppCommandRunner> = {
  help: async (chat) => this.appSlashHelp(chat),
  status: async (chat) => this.slashStatus(chat),
  models: async (chat) => this.slashModels(chat),
  plugins: async (chat, args) => this.slashPlugins(chat, args),
};

async sendPrompt(prompt: string, chatId = this.activeChatId): Promise<void> {
  if (!chatId) return;
  const chat = this.chats.get(chatId);
  if (!chat || chat.running) return;
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return;

  const resolved = this.resolveConfiguredAgent(chat.configuredAgentId, chat.modelId);
  const runtimeId = resolved?.runtimeAgentId ?? "codex";
  const route = routeChatPrompt(runtimeId, trimmedPrompt);

  if (route.kind === "app_command") {
    await this.runAppCommand(chat, route.commandId, route.args, trimmedPrompt);
    return;
  }
  if (route.kind === "unsupported_runtime_slash") {
    chat.messages.push(createUserMessage(trimmedPrompt, true));
    chat.messages.push(createAssistantMessage(route.reason, true));
    chat.updatedAt = Date.now();
    this.emit();
    return;
  }

  const forwardedPrompt = route.prompt;
  // existing runtime send path continues here unchanged
}
```

- [ ] **Step 4: Make `/app help` derive from the shared registry and remove old bare-command copy**

```ts
private async runAppCommand(chat: ChatState, commandId: AppCommandHandlerKey, args: string[], prompt: string): Promise<void> {
  chat.messages.push(createUserMessage(prompt, true));
  chat.lastError = undefined;
  chat.updatedAt = Date.now();
  this.activeChatId = chat.id;
  this.emit();

  const runner = this.appCommandRunners[commandId];
  const content = await runner(chat, args);
  chat.messages.push(createAssistantMessage(content, true));
  chat.updatedAt = Date.now();
  this.emit();
}

private appSlashHelp(chat: ChatState): string {
  const runtimeId = this.resolveConfiguredAgent(chat.configuredAgentId, chat.modelId)?.runtimeAgentId ?? "codex";
  const visible = APP_COMMANDS.filter((item) => !item.supportedRuntimeIds || item.supportedRuntimeIds.includes(runtimeId));
  return ["App commands", ...visible.map((item) => `${item.command} - ${item.summary}`)].join("\n");
}
```

- [ ] **Step 5: Re-run the focused tests and typecheck**

Run: `npm test -- src/main/agent-hub.test.ts src/main/chat-command-router.test.ts`

Expected: PASS for `/app` local handling, runtime passthrough, and API rejection.

Run: `npm run typecheck`

Expected: PASS with the old `handleSlashCommand()` / `runSlashCommand()` logic removed or reduced to `/app`.

- [ ] **Step 6: Commit the `AgentHub` boundary correction**

```bash
git add src/main/agent-hub.ts src/main/agent-hub.test.ts
git commit -m "feat: route chat slash commands by runtime"
```

### Task 3: Runtime Launch Profiles, Persisted Overrides, And Cross-Platform Resolution

**Files:**
- Create: `src/main/runtime-command-store.ts`
- Create: `src/main/runtime-command-store.test.ts`
- Create: `src/main/runtime-launch-profiles.ts`
- Create: `src/main/runtime-launch-profiles.test.ts`
- Create: `src/main/darwin-shell-path.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/agents/detect.ts`
- Modify: `src/main/agents/detect.test.ts`
- Modify: `src/main/agent-executor.ts`
- Modify: `src/main/agent-hub.ts`
- Modify: `src/main/agents/codex-rpc.ts`
- Modify: `src/main/agents/claude-runner.ts`
- Modify: `src/main/cli-launcher.test.ts`

- [ ] **Step 1: Add failing tests for override priority, fingerprinting, fixed args, and macOS shell fallback**

```ts
test("prefers app-level overrides over environment and path defaults", async () => {
  const profile = createRuntimeLaunchProfiles({
    shellPathLookup: async () => null,
    probeVersion: async () => "0.136.0",
  }).driverFor("codex");

  const resolved = await profile.resolveCommand({
    runtimeId: "codex",
    override: { executable: "/custom/bin/codex", fixedArgs: ["--profile", "team-a"] },
    env: { CODEX_PATH: "/env/bin/codex" },
    platform: "darwin",
  });

  expect(resolved).toMatchObject({
    executable: "/custom/bin/codex",
    fixedArgs: ["--profile", "team-a"],
    source: "app_override",
  });
});

test("hydrates PATH from the login shell for darwin GUI launches", async () => {
  const profile = createRuntimeLaunchProfiles({
    shellPathLookup: async () => ["/opt/homebrew/bin"],
    probeVersion: async () => "2.1.121",
  }).driverFor("claude");

  const resolved = await profile.resolveCommand({
    runtimeId: "claude",
    env: {},
    platform: "darwin",
  });

  expect(resolved.source).toBe("shell_hydrated_path");
  expect(resolved.command).toContain("/opt/homebrew/bin");
});

test("changes the cli fingerprint when executable, fixed args, or version changes", () => {
  const fingerprintA = buildCliFingerprint({
    executable: "codex",
    fixedArgs: ["--profile", "a"],
    version: "0.136.0",
  });
  const fingerprintB = buildCliFingerprint({
    executable: "codex",
    fixedArgs: ["--profile", "b"],
    version: "0.136.0",
  });

  expect(fingerprintA).not.toBe(fingerprintB);
});

async function captureClaudeArgs(options: {
  sessionId?: string;
  modelId?: string;
  fixedArgs?: string[];
}): Promise<string[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-args-"));
  const argsFile = path.join(dir, "args.txt");
  const executable = await writeNodeCliLauncher(
    dir,
    "claude-echo",
    `const fs = require("fs");
fs.writeFileSync(${JSON.stringify(argsFile)}, process.argv.slice(2).join("\\n") + "\\n", "utf8");
`,
  );

  await new Promise<void>((resolve, reject) => {
    const runner = new ClaudeRunner({
      executable,
      fixedArgs: options.fixedArgs,
      cwd: dir,
      prompt: "hello",
      modelId: options.modelId,
      sessionId: options.sessionId,
      onEvent: () => undefined,
      onExit: () => resolve(),
    });
    runner.start().catch(reject);
  });

  return (await readFile(argsFile, "utf8")).split("\n").filter(Boolean);
}

test("prepends fixed args before native Claude flags", async () => {
  const args = await captureClaudeArgs({ fixedArgs: ["--verbose-json-wrapper"] });

  expect(args.slice(0, 4)).toEqual(["--verbose-json-wrapper", "--print", "--output-format", "stream-json"]);
  expect(args.at(-1)).toBe("hello");
});
```

- [ ] **Step 2: Run the launch-profile slice and verify it fails before the new runtime command state exists**

Run: `npm test -- src/main/runtime-launch-profiles.test.ts src/main/runtime-command-store.test.ts src/main/agents/detect.test.ts src/main/cli-launcher.test.ts`

Expected: FAIL with missing launch profile/store modules and no fixed-args support in runner/client adapters.

- [ ] **Step 3: Add shared runtime command config and runtime launch metadata types**

```ts
// src/shared/types.ts
export type RuntimeLaunchSource = "app_override" | "env_override" | "path" | "shell_hydrated_path" | "unavailable";

export interface RuntimeCommandOverride {
  executable: string;
  fixedArgs?: string[];
}

export interface RuntimeCommandConfig {
  runtimeId: AgentId;
  override?: RuntimeCommandOverride;
}

export interface LearnedNativeCommandRecord {
  runtimeId: AgentId;
  cliFingerprint: string;
  commandStem: string;
  example: string;
  successCount: number;
  lastUsedAt: number;
}

export interface AgentRuntime {
  id: AgentId;
  label: string;
  command: string;
  version: string | null;
  available: boolean;
  fixedArgs?: string[];
  source?: RuntimeLaunchSource;
  fingerprint?: string;
  error?: string;
}

export interface AppSnapshot {
  detectedAt: number;
  activeChatId: string | undefined;
  activeTaskId: string | undefined;
  activeTeamId: string | undefined;
  activeTeamRunId: string | undefined;
  workDir: string;
  runtimes: AgentRuntime[];
  runtimeCommandConfigs: RuntimeCommandConfig[];
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  chats: ChatSession[];
  tasks: TaskRun[];
  teams: AgentTeam[];
  teamRuns: TeamRun[];
  workflowStore: WorkflowStoreState;
  scheduledWorkflowStore: ScheduledWorkflowStoreState;
  workflowDraft: WorkflowDraftState | undefined;
  artifacts: RegisteredArtifact[];
}
```

- [ ] **Step 4: Add a dedicated runtime command state store and launch profile registry**

```ts
// src/main/runtime-command-store.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LearnedNativeCommandRecord, RuntimeCommandConfig } from "../shared/types";

interface RuntimeCommandStateFile {
  version: 1;
  runtimeCommandConfigs: RuntimeCommandConfig[];
  learnedNativeCommands: LearnedNativeCommandRecord[];
}

const EMPTY_RUNTIME_COMMAND_STATE: RuntimeCommandStateFile = {
  version: 1,
  runtimeCommandConfigs: [],
  learnedNativeCommands: [],
};

export async function loadRuntimeCommandState(filePath: string): Promise<RuntimeCommandStateFile> {
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Partial<RuntimeCommandStateFile>;
    return {
      version: 1,
      runtimeCommandConfigs: Array.isArray(raw.runtimeCommandConfigs) ? raw.runtimeCommandConfigs : [],
      learnedNativeCommands: Array.isArray(raw.learnedNativeCommands) ? raw.learnedNativeCommands : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_RUNTIME_COMMAND_STATE;
    throw error;
  }
}

export async function saveRuntimeCommandState(filePath: string, state: RuntimeCommandStateFile): Promise<RuntimeCommandStateFile> {
  const normalized: RuntimeCommandStateFile = {
    version: 1,
    runtimeCommandConfigs: [...state.runtimeCommandConfigs].sort((left, right) => left.runtimeId.localeCompare(right.runtimeId)),
    learnedNativeCommands: [...state.learnedNativeCommands].sort(
      (left, right) =>
        left.runtimeId.localeCompare(right.runtimeId) ||
        left.cliFingerprint.localeCompare(right.cliFingerprint) ||
        left.commandStem.localeCompare(right.commandStem),
    ),
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}
```

```ts
// src/main/runtime-launch-profiles.ts
import type { AgentId, RuntimeCommandConfig, RuntimeLaunchSource } from "../shared/types";

export interface ResolvedRuntimeCommand {
  runtimeId: AgentId;
  executable: string;
  fixedArgs: string[];
  command: string;
  source: RuntimeLaunchSource;
  version: string | null;
  fingerprint: string;
  available: boolean;
  error?: string;
}

export interface RuntimeLaunchProfile {
  runtimeId: AgentId;
  resolveCommand(input: {
    runtimeId: AgentId;
    override?: RuntimeCommandConfig["override"];
    env: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
  }): Promise<ResolvedRuntimeCommand>;
}
```

- [ ] **Step 5: Wire launch profiles into detection and every Codex/Claude launch site**

```ts
// src/main/agents/detect.ts
export async function detectAgentRuntimes(input: {
  runtimeCommandConfigs?: RuntimeCommandConfig[];
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
} = {}): Promise<AgentRuntime[]> {
  const profiles = createRuntimeLaunchProfiles();
  return Promise.all(
    (["codex", "claude", "api"] as const).map(async (runtimeId) => {
      if (runtimeId === "api") {
        return {
          id: "api",
          label: "API",
          command: "api",
          version: null,
          available: true,
          source: "path",
          fingerprint: "api",
        };
      }
      const override = input.runtimeCommandConfigs?.find((item) => item.runtimeId === runtimeId)?.override;
      return profiles.driverFor(runtimeId).resolveCommand({
        runtimeId,
        override,
        env: input.env ?? process.env,
        platform: input.platform ?? process.platform,
      });
    }),
  );
}
```

```ts
// src/main/agents/codex-rpc.ts
export interface CodexRpcClientOptions {
  executable: string;
  fixedArgs?: string[];
  cwd: string;
  extraArgs?: string[];
  env?: Record<string, string>;
  onEvent: (event: AgentEvent) => void;
  onRequest?: (id: number, method: string, params: Record<string, unknown>) => void;
  onStderr?: (text: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null, stderr: string) => void;
}

const args = [...(this.options.fixedArgs ?? []), "--yolo", ...(this.options.extraArgs ?? []), "app-server", "--listen", "stdio://"];
```

```ts
// src/main/agents/claude-runner.ts
export interface ClaudeRunOptions {
  executable: string;
  fixedArgs?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  prompt: string;
  modelId: string | undefined;
  sessionId: string | undefined;
  onEvent: (event: AgentEvent) => void;
  onStderr?: (text: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

const args = [
  ...(this.options.fixedArgs ?? []),
  "--print",
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--permission-mode",
  "bypassPermissions",
];
```

- [ ] **Step 6: Re-run focused tests and typecheck**

Run: `npm test -- src/main/runtime-launch-profiles.test.ts src/main/runtime-command-store.test.ts src/main/agents/detect.test.ts src/main/cli-launcher.test.ts`

Expected: PASS for override priority, fingerprinting, Windows command wrapping, and darwin shell fallback.

Run: `npm run typecheck`

Expected: PASS with `AppSnapshot.runtimeCommandConfigs` and resolved `AgentRuntime` metadata flowing through the type graph.

- [ ] **Step 7: Commit the launch-profile and override core**

```bash
git add src/shared/types.ts src/main/runtime-command-store.ts src/main/runtime-command-store.test.ts src/main/runtime-launch-profiles.ts src/main/runtime-launch-profiles.test.ts src/main/darwin-shell-path.ts src/main/agents/detect.ts src/main/agents/detect.test.ts src/main/agent-executor.ts src/main/agent-hub.ts src/main/agents/codex-rpc.ts src/main/agents/claude-runner.ts src/main/cli-launcher.test.ts
git commit -m "feat: add runtime launch profiles"
```

### Task 4: Runtime Config UI And IPC For Executor Overrides

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`
- Modify: `src/renderer/src/AppShell.tsx`
- Modify: `src/renderer/src/pages/runtime/RuntimePage.tsx`
- Modify: `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.ts`
- Modify: `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts`
- Modify: `src/renderer/src/App.layout.test.tsx`

- [ ] **Step 1: Add failing preload, hook, and layout tests for runtime executor overrides**

```ts
test("preload exposes saveRuntimeCommandConfigs alongside the existing runtime APIs", () => {
  expectTypeOf(window.multiAgentChat.saveRuntimeCommandConfigs).toEqualTypeOf<
    (configs: RuntimeCommandConfig[]) => Promise<AppSnapshot>
  >();
});

test("runtime config manager seeds executor drafts from snapshot state", () => {
  const seeded = seedRuntimeCommandConfigs([
    {
      runtimeId: "codex",
      override: { executable: "C:/Users/demo/AppData/Roaming/npm/codex.cmd", fixedArgs: ["--profile", "team-a"] },
    },
  ]);

  expect(seeded).toEqual([
    {
      runtimeId: "codex",
      override: { executable: "C:/Users/demo/AppData/Roaming/npm/codex.cmd", fixedArgs: ["--profile", "team-a"] },
    },
  ]);

  const updated = upsertRuntimeCommandConfig(seeded, "codex", (config) => ({
    ...config,
    override: { executable: "codex", fixedArgs: ["--profile", "team-b"] },
  }));

  expect(updated).toEqual([
    {
      runtimeId: "codex",
      override: { executable: "codex", fixedArgs: ["--profile", "team-b"] },
    },
  ]);
});

test("runtime page renders executor override fields and resolved source", () => {
  const html = renderToStaticMarkup(
    <RuntimePage
      language="en"
      channels={[
        {
          id: "codex-openai",
          agentId: "codex",
          label: "Codex OpenAI",
          models: [{ id: "default", label: "Default" }],
        },
      ]}
      selectedChannelId="codex-openai"
      providerKeys={{}}
      codexPluginCatalog={[]}
      pluginCatalogStatus=""
      agentTestResults={{}}
      testingAgentId={undefined}
      agentTestTick={0}
      balanceResults={{}}
      balanceLoadingChannelId={undefined}
      contextMenu={undefined}
      runtimes={[
        {
          id: "codex",
          label: "Codex",
          command: "codex",
          fixedArgs: ["--profile", "team-a"],
          source: "app_override",
          version: "0.136.0",
          available: true,
          fingerprint: "codex|0.136.0",
        },
      ]}
      runtimeCommandConfigs={[
        { runtimeId: "codex", override: { executable: "codex", fixedArgs: ["--profile", "team-a"] } },
      ]}
      onUpdateChannel={() => undefined}
      onAddModel={() => undefined}
      onUpdateModel={() => undefined}
      onRemoveModel={() => undefined}
      onSave={async () => undefined}
      onLoadCodexPluginCatalog={async () => undefined}
      onSelectChannel={() => undefined}
      onAddConfig={() => undefined}
      onOpenContextMenu={() => undefined}
      onDeleteConfig={() => undefined}
      onTestChannel={async () => undefined}
      onQueryBalance={async () => undefined}
      onUpdateProviderKey={() => undefined}
      onUpdateRuntimeCommandConfig={() => undefined}
      onUpdateRuntimeCommandArgs={() => undefined}
      onSaveRuntimeCommandConfigs={async () => undefined}
      status=""
      onStatusChange={() => undefined}
    />,
  );

  expect(html).toContain("Executor");
  expect(html).toContain("Resolved from");
  expect(html).toContain("app_override");
  expect(html).toContain("--profile team-a");
});
```

- [ ] **Step 2: Run the runtime UI slice and verify it fails before the new IPC and props exist**

Run: `npm test -- src/preload/index.test.ts src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts src/renderer/src/App.layout.test.tsx`

Expected: FAIL because `runtimeCommandConfigs` do not exist in the snapshot and the runtime page has no executor override UI.

- [ ] **Step 3: Add IPC and preload support for persisted runtime command configs**

```ts
// src/main/index.ts
ipcMain.handle("runtime-commands:save", async (_event, configs: RuntimeCommandConfig[]) => hub.saveRuntimeCommandConfigs(configs));
```

```ts
// src/preload/index.ts
saveRuntimeCommandConfigs: (configs: RuntimeCommandConfig[]): Promise<AppSnapshot> => ipcRenderer.invoke("runtime-commands:save", configs),
```

- [ ] **Step 4: Add runtime executor draft state to the runtime config hook**

```ts
// src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.ts
export function seedRuntimeCommandConfigs(configs: RuntimeCommandConfig[]): RuntimeCommandConfig[] {
  return configs.map((item) => ({
    runtimeId: item.runtimeId,
    ...(item.override
      ? {
          override: {
            executable: item.override.executable,
            ...(item.override.fixedArgs ? { fixedArgs: [...item.override.fixedArgs] } : {}),
          },
        }
      : {}),
  }));
}

export function upsertRuntimeCommandConfig(
  current: RuntimeCommandConfig[],
  runtimeId: AgentId,
  updater: (config: RuntimeCommandConfig) => RuntimeCommandConfig,
): RuntimeCommandConfig[] {
  const existing = current.find((item) => item.runtimeId === runtimeId) ?? { runtimeId };
  const next = updater(existing);
  return [...current.filter((item) => item.runtimeId !== runtimeId), next];
}

const [runtimeCommandConfigs, setRuntimeCommandConfigs] = useState<RuntimeCommandConfig[]>(() =>
  seedRuntimeCommandConfigs(snapshot.runtimeCommandConfigs),
);
const [runtimeCommandConfigDirty, setRuntimeCommandConfigDirty] = useState(false);

useEffect(() => {
  if (configDirty || runtimeCommandConfigDirty) return;
  setRuntimeCommandConfigs(seedRuntimeCommandConfigs(snapshot.runtimeCommandConfigs));
}, [configDirty, runtimeCommandConfigDirty, snapshot.runtimeCommandConfigs]);

const updateRuntimeCommandConfig = useCallback((runtimeId: AgentId, updater: (config: RuntimeCommandConfig) => RuntimeCommandConfig) => {
  setRuntimeCommandConfigs((current) => upsertRuntimeCommandConfig(current, runtimeId, updater));
  setRuntimeCommandConfigDirty(true);
}, []);

const updateRuntimeCommandArgs = useCallback((runtimeId: AgentId, rawText: string) => {
  const fixedArgs = rawText.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"(.*)"$/, "$1")) ?? [];
  updateRuntimeCommandConfig(runtimeId, (config) => ({
    ...config,
    override: {
      executable: config.override?.executable ?? "",
      ...(fixedArgs.length > 0 ? { fixedArgs } : {}),
    },
  }));
}, [updateRuntimeCommandConfig]);

const saveRuntimeCommandConfigs = useCallback(async () => {
  const next = await chatApi.saveRuntimeCommandConfigs(runtimeCommandConfigs);
  setRuntimeCommandConfigs(next.runtimeCommandConfigs);
  setRuntimeCommandConfigDirty(false);
  setSnapshot(next);
}, [chatApi, runtimeCommandConfigs, setSnapshot]);
```

- [ ] **Step 5: Render executor override controls in `RuntimePage`**

```tsx
// src/renderer/src/pages/runtime/RuntimePage.tsx
const selectedRuntimeRecord = runtimes.find((item) => item.id === selectedRuntime);
const selectedRuntimeCommandConfig = runtimeCommandConfigs.find((item) => item.runtimeId === selectedRuntime);

<section className="agent-provider-presets">
  <div className="agent-provider-presets-head">
    <h3>Executor</h3>
    <span>Override the runtime command globally for this runtime.</span>
  </div>
  <label className="config-field config-field-wide">
    <span>Executable</span>
    <input
      value={selectedRuntimeCommandConfig?.override?.executable ?? ""}
      placeholder={selectedRuntimeRecord?.command ?? "codex"}
      onChange={(event) =>
        onUpdateRuntimeCommandConfig(selectedRuntime, (config) => ({
          ...config,
          override: {
            ...(config.override ?? { executable: "" }),
            executable: event.currentTarget.value,
            fixedArgs: config.override?.fixedArgs,
          },
        }))
      }
    />
  </label>
  <label className="config-field config-field-wide">
    <span>Fixed args</span>
    <textarea
      value={(selectedRuntimeCommandConfig?.override?.fixedArgs ?? []).join(" ")}
      placeholder="--profile team-a"
      onChange={(event) => onUpdateRuntimeCommandArgs(selectedRuntime, event.currentTarget.value)}
    />
  </label>
  <div className="config-status runtime-config-status">
    {`Resolved from: ${selectedRuntimeRecord?.source ?? "unavailable"} · ${selectedRuntimeRecord?.command ?? "missing"}`}
  </div>
  <button className="control-btn compact secondary" type="button" onClick={() => void onSaveRuntimeCommandConfigs()}>
    Save executor
  </button>
</section>
```

- [ ] **Step 6: Re-run the runtime UI tests and typecheck**

Run: `npm test -- src/preload/index.test.ts src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts src/renderer/src/App.layout.test.tsx`

Expected: PASS for executor override IPC typing, hook state, and layout rendering.

Run: `npm run typecheck`

Expected: PASS with `RuntimePage` and `AppShell` accepting the new runtime command props.

- [ ] **Step 7: Commit the runtime override UI**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/index.test.ts src/renderer/src/AppShell.tsx src/renderer/src/pages/runtime/RuntimePage.tsx src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.ts src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts src/renderer/src/App.layout.test.tsx
git commit -m "feat: add runtime executor overrides"
```

### Task 5: Slash Completion Foundation And Renderer Grouping

**Files:**
- Create: `src/main/runtime-command-completions.ts`
- Create: `src/main/runtime-command-completions.test.ts`
- Create: `src/renderer/src/pages/chat/useSlashCommandCompletions.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`
- Modify: `src/renderer/src/AppShell.tsx`
- Modify: `src/renderer/src/pages/chat/chat-utils.tsx`
- Modify: `src/renderer/src/pages/chat/ChatPage.tsx`
- Modify: `src/renderer/src/App.layout.test.tsx`

- [ ] **Step 1: Add failing tests for grouped slash completion and runtime-specific placeholders**

```ts
test("groups slash completion results and shows only /app commands for api chats", () => {
  const groups = buildSlashCompletionGroups([
    {
      id: "app_commands",
      label: "App commands",
      items: [{ id: "help", label: "/app help", insertText: "/app help ", description: "Show app-local commands.", authoritative: true }],
    },
  ]);

  expect(groups.map((group) => group.label)).toEqual(["App commands"]);
  expect(groups[0]?.items.map((item) => item.label)).toEqual(["/app help"]);
});

test("renders grouped slash command suggestions", () => {
  const html = renderToStaticMarkup(
    <SlashCommandSuggestions
      groups={[
        {
          id: "app_commands",
          label: "App commands",
          items: [{ id: "help", label: "/app help", insertText: "/app help ", description: "Show app-local commands.", authoritative: true }],
        },
      ]}
      activeIndex={0}
      onSelect={() => undefined}
    />,
  );

  expect(html).toContain("App commands");
  expect(html).toContain("/app help");
});

test("uses runtime-specific composer placeholders", () => {
  expect(chatPlaceholder("codex", "Codex")).toBe("Message Codex, use a native slash command, or type /app help...");
  expect(chatPlaceholder("claude", "Claude Code")).toBe("Message Claude Code, use a native slash command, or type /app help...");
  expect(chatPlaceholder("api", "API")).toBe("Message API or type /app help...");
});
```

- [ ] **Step 2: Run the completion shell slice and verify it fails before grouped completions exist**

Run: `npm test -- src/main/runtime-command-completions.test.ts src/preload/index.test.ts src/renderer/src/App.layout.test.tsx`

Expected: FAIL because the renderer still expects a flat array from `slashCommandSuggestionsFor()`.

- [ ] **Step 3: Add shared slash completion types and a main-process completion aggregator**

```ts
// src/shared/types.ts
export type SlashCompletionGroupId = "app_commands" | "native_metadata" | "suggested_native_commands";

export interface SlashCompletionItem {
  id: string;
  label: string;
  insertText: string;
  description: string;
  authoritative: boolean;
}

export interface SlashCompletionGroup {
  id: SlashCompletionGroupId;
  label: string;
  items: SlashCompletionItem[];
}
```

```ts
// src/main/runtime-command-completions.ts
import { APP_COMMANDS } from "../shared/app-commands";

export async function listSlashCompletionGroups(input: {
  runtimeId: AgentId;
  query: string;
}): Promise<SlashCompletionGroup[]> {
  const normalized = input.query.trimStart().toLowerCase();
  const appItems = APP_COMMANDS
    .filter((item) => item.command.toLowerCase().startsWith(normalized))
    .map((item) => ({
      id: item.id,
      label: item.command,
      insertText: `${item.command} `,
      description: item.summary,
      authoritative: true,
    }));

  return appItems.length > 0
    ? [{ id: "app_commands", label: "App commands", items: appItems }]
    : [];
}
```

- [ ] **Step 4: Expose slash completion queries over IPC and move the renderer to an async hook**

```ts
// src/main/index.ts
ipcMain.handle("chat:slash-completions", async (_event, chatId: string, input: string) => hub.listSlashCompletionGroups(chatId, input));
```

```ts
// src/preload/index.ts
listSlashCompletions: (chatId: string, input: string): Promise<SlashCompletionGroup[]> => ipcRenderer.invoke("chat:slash-completions", chatId, input),
```

```ts
// src/renderer/src/pages/chat/useSlashCommandCompletions.ts
export function useSlashCommandCompletions(input: {
  chatId: string | undefined;
  prompt: string;
  runtimeId: AgentId;
}) {
  const [groups, setGroups] = useState<SlashCompletionGroup[]>([]);

  useEffect(() => {
    if (!input.chatId || !input.prompt.trimStart().startsWith("/") || /\s/.test(input.prompt.trimStart())) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    void window.multiAgentChat.listSlashCompletions(input.chatId, input.prompt).then((next) => {
      if (!cancelled) setGroups(next);
    });
    return () => {
      cancelled = true;
    };
  }, [input.chatId, input.prompt]);

  return groups;
}
```

- [ ] **Step 5: Update the renderer menu component to render groups and use the new placeholder helper**

```tsx
// src/renderer/src/pages/chat/chat-utils.tsx
export function chatPlaceholder(agentId: AgentId, label: string): string {
  if (agentId === "api") return `Message ${label} or type /app help...`;
  return `Message ${label}, use a native slash command, or type /app help...`;
}

export function SlashCommandSuggestions({
  groups,
  activeIndex,
  onSelect,
}: {
  groups: SlashCompletionGroup[];
  activeIndex: number;
  onSelect: (suggestion: SlashCompletionItem) => void;
}) {
  const flat = groups.flatMap((group) => group.items);
  if (flat.length === 0) return null;
  let offset = 0;
  return (
    <div className="slash-command-menu" role="listbox" aria-label="Slash commands">
      {groups.map((group) => {
        const start = offset;
        offset += group.items.length;
        return (
          <div key={group.id} className="slash-command-group">
            <div className="slash-command-group-label">{group.label}</div>
            {group.items.map((item, index) => {
              const flatIndex = start + index;
              return (
                <button key={item.id} type="button" className={`slash-command-option ${flatIndex === activeIndex ? "is-active" : ""}`} onClick={() => onSelect(item)}>
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Re-run the completion shell tests and typecheck**

Run: `npm test -- src/main/runtime-command-completions.test.ts src/preload/index.test.ts src/renderer/src/App.layout.test.tsx`

Expected: PASS for grouped renderer output, async preload typing, and runtime-specific placeholders.

Run: `npm run typecheck`

Expected: PASS with the flat slash suggestion API removed from `AppShell`.

- [ ] **Step 7: Commit the slash completion foundation**

```bash
git add src/main/runtime-command-completions.ts src/main/runtime-command-completions.test.ts src/renderer/src/pages/chat/useSlashCommandCompletions.ts src/shared/types.ts src/main/index.ts src/preload/index.ts src/preload/index.test.ts src/renderer/src/AppShell.tsx src/renderer/src/pages/chat/chat-utils.tsx src/renderer/src/pages/chat/ChatPage.tsx src/renderer/src/App.layout.test.tsx
git commit -m "feat: add grouped slash completions"
```

### Task 6: Native Metadata Providers, Learned Suggestions, Invalid-Command Eviction, And Docs

**Files:**
- Modify: `src/main/runtime-command-store.ts`
- Modify: `src/main/runtime-command-store.test.ts`
- Modify: `src/main/runtime-command-completions.ts`
- Modify: `src/main/runtime-command-completions.test.ts`
- Modify: `src/main/agent-hub.ts`
- Modify: `src/main/agent-hub.test.ts`
- Modify: `src/main/agents/codex-events.ts`
- Modify: `src/main/agents/codex-events.test.ts`
- Modify: `src/main/agents/claude-stream.ts`
- Modify: `src/main/agents/claude-stream.test.ts`
- Modify: `src/renderer/src/App.layout.test.tsx`
- Modify: `README.md`
- Modify: `docs/architecture-overview.md`
- Modify: `docs/modules/main.md`
- Modify: `docs/modules/renderer.md`
- Modify: `docs/zh-CN/README.md`
- Modify: `docs/zh-CN/architecture-overview.md`
- Modify: `docs/zh-CN/modules/main.md`
- Modify: `docs/zh-CN/modules/renderer.md`

- [ ] **Step 1: Add failing tests for learned native history, invalid-command eviction, and conservative failure classification**

```ts
test("learns a successful native slash command under the current fingerprint", async () => {
  const store = await loadRuntimeCommandState(statePath);
  const next = recordNativeCommandSuccess(store, {
    runtimeId: "codex",
    cliFingerprint: "codex|0.136.0|cmd",
    prompt: "/model gpt-5.5",
    at: 1710000000000,
  });

  expect(next.learnedNativeCommands).toEqual([
    expect.objectContaining({
      runtimeId: "codex",
      cliFingerprint: "codex|0.136.0|cmd",
      commandStem: "/model",
      example: "/model gpt-5.5",
      successCount: 1,
    }),
  ]);
});

test("evicts a learned native command immediately after explicit invalid command evidence", async () => {
  const store = {
    version: 1,
    runtimeCommandConfigs: [],
    learnedNativeCommands: [
      {
        runtimeId: "claude",
        cliFingerprint: "claude|2.1.121|path",
        commandStem: "/review",
        example: "/review",
        successCount: 3,
        lastUsedAt: 1710000000000,
      },
    ],
  };

  const next = recordNativeCommandFailure(store, {
    runtimeId: "claude",
    cliFingerprint: "claude|2.1.121|path",
    prompt: "/review",
    classification: "invalid_command",
  });

  expect(next.learnedNativeCommands).toEqual([]);
});

test("does not evict learned suggestions on transport failure", async () => {
  const store = {
    version: 1,
    runtimeCommandConfigs: [],
    learnedNativeCommands: [
      {
        runtimeId: "claude",
        cliFingerprint: "claude|2.1.121|path",
        commandStem: "/review",
        example: "/review",
        successCount: 3,
        lastUsedAt: 1710000000000,
      },
    ],
  };

  const next = recordNativeCommandFailure(store, {
    runtimeId: "claude",
    cliFingerprint: "claude|2.1.121|path",
    prompt: "/review",
    classification: "transport_failure",
  });

  expect(next.learnedNativeCommands).toEqual(store.learnedNativeCommands);
});

test("classifies codex RPC unknown slash errors as invalid_command", () => {
  expect(classifyNativeCommandFailure("codex", {
    prompt: "/foo",
    error: "turn/start: unknown slash command /foo",
  })).toBe("invalid_command");
});

test("classifies generic Claude exit failures as runtime_failure instead of invalid_command", () => {
  expect(classifyNativeCommandFailure("claude", {
    prompt: "/foo",
    error: "Claude exited with code 1",
  })).toBe("runtime_failure");
});
```

- [ ] **Step 2: Run the learned-history slice and verify it fails before the store and classifier are extended**

Run: `npm test -- src/main/runtime-command-store.test.ts src/main/runtime-command-completions.test.ts src/main/agent-hub.test.ts src/main/agents/codex-events.test.ts src/main/agents/claude-stream.test.ts src/renderer/src/App.layout.test.tsx`

Expected: FAIL because there is no success/failure learning path and the completion provider only returns `/app` commands.

- [ ] **Step 3: Extend the runtime command store with success recording, failure eviction, and fingerprint partitioning**

```ts
// src/main/runtime-command-store.ts
function commandStemFromPrompt(prompt: string): string {
  return prompt.trim().split(/\s+/)[0] ?? prompt.trim();
}

export function recordNativeCommandSuccess(
  state: RuntimeCommandStateFile,
  input: { runtimeId: AgentId; cliFingerprint: string; prompt: string; at: number },
): RuntimeCommandStateFile {
  const commandStem = commandStemFromPrompt(input.prompt);
  if (!commandStem.startsWith("/") || commandStem === "/app") return state;
  const existing = state.learnedNativeCommands.find(
    (item) => item.runtimeId === input.runtimeId && item.cliFingerprint === input.cliFingerprint && item.commandStem === commandStem,
  );
  const nextRecord = existing
    ? {
        ...existing,
        example: input.prompt,
        successCount: existing.successCount + 1,
        lastUsedAt: input.at,
      }
    : {
        runtimeId: input.runtimeId,
        cliFingerprint: input.cliFingerprint,
        commandStem,
        example: input.prompt,
        successCount: 1,
        lastUsedAt: input.at,
      };
  return {
    ...state,
    learnedNativeCommands: [
      ...state.learnedNativeCommands.filter(
        (item) => !(item.runtimeId === input.runtimeId && item.cliFingerprint === input.cliFingerprint && item.commandStem === commandStem),
      ),
      nextRecord,
    ],
  };
}

export function recordNativeCommandFailure(
  state: RuntimeCommandStateFile,
  input: { runtimeId: AgentId; cliFingerprint: string; prompt: string; classification: "invalid_command" | "transport_failure" | "runtime_failure" | "interrupted" },
): RuntimeCommandStateFile {
  if (input.classification !== "invalid_command") return state;
  const commandStem = commandStemFromPrompt(input.prompt);
  return {
    ...state,
    learnedNativeCommands: state.learnedNativeCommands.filter(
      (item) => !(item.runtimeId === input.runtimeId && item.cliFingerprint === input.cliFingerprint && item.commandStem === commandStem),
    ),
  };
}
```

- [ ] **Step 4: Add runtime-specific completion providers for app commands, Codex metadata, Claude metadata, and learned native suggestions**

```ts
// src/main/runtime-command-completions.ts
interface RuntimeCompletionDeps {
  listCodexModels: () => Promise<Array<{ id: string }>>;
  listCodexPlugins: () => Promise<Array<{ id: string }>>;
  listImportedSkills: () => Promise<Array<{ id: string; name: string; description: string }>>;
  readClaudeCommandMetadata: () => Promise<
    Array<{ name: string; argumentHint?: string; description?: string; userInvocable?: boolean }>
  >;
}

const CODEX_CURATED_METADATA_STEMS = [
  { stem: "/model", metadataKind: "models", description: "Use a specific Codex model." },
  { stem: "/plugin", metadataKind: "plugins", description: "Target a Codex plugin." },
  { stem: "/skill", metadataKind: "skills", description: "Target an installed Codex skill." },
];

async function listCodexNativeMetadata(deps: RuntimeCompletionDeps): Promise<SlashCompletionItem[]> {
  const [models, plugins, skillTemplates] = await Promise.all([
    deps.listCodexModels(),
    deps.listCodexPlugins(),
    deps.listImportedSkills(),
  ]);

  return [
    ...models.map((model) => ({
      id: `codex:model:${model.id}`,
      label: `/model ${model.id}`,
      insertText: `/model ${model.id} `,
      description: "Use a specific Codex model.",
      authoritative: true,
    })),
    ...plugins.map((plugin) => ({
      id: `codex:plugin:${plugin.id}`,
      label: `/plugin ${plugin.id}`,
      insertText: `/plugin ${plugin.id} `,
      description: "Target a Codex plugin.",
      authoritative: true,
    })),
    ...skillTemplates.map((skill) => ({
      id: `codex:skill:${skill.id}`,
      label: `/skill ${skill.name}`,
      insertText: `/skill ${skill.name} `,
      description: skill.description,
      authoritative: true,
    })),
  ];
}

async function listClaudeNativeMetadata(deps: RuntimeCompletionDeps): Promise<SlashCompletionItem[]> {
  const commands = await deps.readClaudeCommandMetadata();
  return commands
    .filter((command) => command.userInvocable !== false)
    .map((command) => ({
      id: `claude:${command.name}`,
      label: `/${command.name}`,
      insertText: command.argumentHint ? `/${command.name} ${command.argumentHint} ` : `/${command.name} `,
      description: command.description ?? "Custom Claude command",
      authoritative: true,
    }));
}

function listLearnedNativeSuggestions(state: RuntimeCommandStateFile, runtimeId: AgentId, cliFingerprint: string): SlashCompletionItem[] {
  return state.learnedNativeCommands
    .filter((item) => item.runtimeId === runtimeId && item.cliFingerprint === cliFingerprint)
    .sort((left, right) => right.successCount - left.successCount || right.lastUsedAt - left.lastUsedAt)
    .map((item) => ({
      id: `${item.runtimeId}:${item.cliFingerprint}:${item.commandStem}`,
      label: item.example,
      insertText: `${item.example} `,
      description: `Learned from successful ${item.runtimeId} usage`,
      authoritative: false,
    }));
}
```

- [ ] **Step 5: Teach `AgentHub` to record native slash outcomes without changing task/workflow behavior**

```ts
// src/main/agent-hub.ts
interface PendingNativeSlashTurn {
  runtimeId: AgentId;
  cliFingerprint: string;
  prompt: string;
}

async sendPrompt(prompt: string, chatId = this.activeChatId): Promise<void> {
  if (route.kind === "runtime_slash") {
    const runtime = this.runtimes.get(runtimeId);
    if (chat.kind === "chat" && runtime?.fingerprint) {
      chat.pendingNativeSlashTurn = {
        runtimeId,
        cliFingerprint: runtime.fingerprint,
        prompt: route.prompt,
      };
    }
  }
}

private finalizeNativeSlashSuccess(run: RunState): void {
  if (run.kind !== "chat" || !run.pendingNativeSlashTurn) return;
  this.runtimeCommandState = recordNativeCommandSuccess(this.runtimeCommandState, {
    runtimeId: run.pendingNativeSlashTurn.runtimeId,
    cliFingerprint: run.pendingNativeSlashTurn.cliFingerprint,
    prompt: run.pendingNativeSlashTurn.prompt,
    at: Date.now(),
  });
  delete run.pendingNativeSlashTurn;
}

private finalizeNativeSlashFailure(run: RunState, error: string): void {
  if (run.kind !== "chat" || !run.pendingNativeSlashTurn) return;
  const classification = classifyNativeCommandFailure(run.pendingNativeSlashTurn.runtimeId, {
    prompt: run.pendingNativeSlashTurn.prompt,
    error,
  });
  this.runtimeCommandState = recordNativeCommandFailure(this.runtimeCommandState, {
    runtimeId: run.pendingNativeSlashTurn.runtimeId,
    cliFingerprint: run.pendingNativeSlashTurn.cliFingerprint,
    prompt: run.pendingNativeSlashTurn.prompt,
    classification,
  });
  delete run.pendingNativeSlashTurn;
}

if (event.type === "completed") {
  this.finalizeNativeSlashSuccess(run);
}

if (event.type === "error") {
  this.finalizeNativeSlashFailure(run, event.error);
}

private markRunFailed(run: RunState, error: string): void {
  this.finalizeNativeSlashFailure(run, error);
  run.running = false;
  run.lastError = error;
  run.pendingAssistantMessageId = undefined;
  if (run.kind === "chat" && run.runtimeSession) {
    run.runtimeSession.attachmentState = "interrupted";
    run.runtimeSession.lastMeaningfulActivityAt = Date.now();
    delete run.runtimeSession.activeTurnId;
  }
  this.emit();
}
```

- [ ] **Step 6: Update docs and run the full focused verification set**

Run:

```bash
npm run typecheck
npm test -- src/main/chat-command-router.test.ts src/main/agent-hub.test.ts src/main/runtime-launch-profiles.test.ts src/main/runtime-command-store.test.ts src/main/runtime-command-completions.test.ts src/main/agents/detect.test.ts src/main/cli-launcher.test.ts src/main/agents/codex-events.test.ts src/main/agents/claude-stream.test.ts src/preload/index.test.ts src/renderer/src/App.layout.test.tsx src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts
```

Expected:

- `npm run typecheck`: PASS
- `npm test -- ...`: PASS for router, launch profile, runtime override, completion grouping, learned history, and invalid-command eviction
- No task/workflow/runtime-test slash semantics are changed or claimed green without dedicated tests

Update these docs to match the shipped boundary:

```md
<!-- README.md -->
- Chat now reserves `/app ...` for app-local commands.
- Bare slash input belongs to Codex or Claude natively.
- API runtimes reject bare slash with local guidance instead of pretending to support it.
- Runtime config can override each CLI executable globally per runtime.
```

```md
<!-- docs/modules/main.md -->
- `chat-command-router.ts`: authoritative chat route classification
- `runtime-launch-profiles.ts`: cross-platform command resolution and fingerprinting
- `runtime-command-store.ts`: persisted runtime overrides and learned native command history
- `runtime-command-completions.ts`: app/native/learned slash completion assembly
```

```md
<!-- docs/modules/renderer.md -->
- chat slash UI only promises `/app` ownership and grouped completion confidence
- runtime config exposes executor overrides separately from provider/channel settings
```

- [ ] **Step 7: Inspect the final diff, then commit the completion and docs slice**

```bash
git diff -- README.md docs/architecture-overview.md docs/modules/main.md docs/modules/renderer.md docs/zh-CN/README.md docs/zh-CN/architecture-overview.md docs/zh-CN/modules/main.md docs/zh-CN/modules/renderer.md src/main/runtime-command-store.ts src/main/runtime-command-completions.ts src/main/agent-hub.ts src/renderer/src/pages/chat/chat-utils.tsx src/renderer/src/pages/chat/ChatPage.tsx src/renderer/src/AppShell.tsx
git add README.md docs/architecture-overview.md docs/modules/main.md docs/modules/renderer.md docs/zh-CN/README.md docs/zh-CN/architecture-overview.md docs/zh-CN/modules/main.md docs/zh-CN/modules/renderer.md src/main/runtime-command-store.ts src/main/runtime-command-store.test.ts src/main/runtime-command-completions.ts src/main/runtime-command-completions.test.ts src/main/agent-hub.ts src/main/agent-hub.test.ts src/main/agents/codex-events.ts src/main/agents/codex-events.test.ts src/main/agents/claude-stream.ts src/main/agents/claude-stream.test.ts src/renderer/src/App.layout.test.tsx
git commit -m "feat: add native command completions"
```

## Self-Review Checklist

- Spec coverage:
  - `/app` single source of truth: Task 1 and Task 2
  - runtime slash passthrough and API rejection: Task 2
  - runtime-extensible launch profiles and overrides: Task 3 and Task 4
  - grouped slash completion shell: Task 5
  - Codex/Claude native metadata plus learned history: Task 6
  - immediate invalid-command eviction: Task 6
  - docs and zh-CN mirrors: Task 6

- Placeholder scan:
  - No `TBD`, `TODO`, or “implement later” placeholders remain in this plan.
  - Every code-changing step includes exact files and example code.
  - Every verification step includes an exact command and expected outcome.

- Type consistency:
  - `RuntimeCommandConfig`, `RuntimeCommandOverride`, `LearnedNativeCommandRecord`, `SlashCompletionGroup`, and `SlashCompletionItem` are introduced once and reused consistently across main/preload/renderer.
  - `AgentRuntime.fingerprint` is the partition key reused by completion learning and by runtime UI display.
  - Only chat uses native slash routing in this plan; task and workflow types stay unchanged.

## Execution Closeout

- Final branch for this rollout: `fix/native-command-support`
- Canonical design spec: `docs/superpowers/specs/2026-07-05-native-command-routing-design.md`
- Chinese design mirror: `docs/zh-CN/superpowers/specs/2026-07-05-native-command-routing-design.md`
- Chinese execution mirror: `docs/zh-CN/superpowers/plans/2026-07-05-native-command-routing-implementation.md`
- For future agents:
  - Treat the checkbox sections above as the original implementation recipe.
  - Treat `## Rollout Status` as the authoritative record of what landed.
  - Treat the design spec open questions as future-extension work, not as missing first-slice implementation.
