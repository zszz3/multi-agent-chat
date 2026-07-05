import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { AgentHub, createWorkflowAgentTimeout } from "./agent-hub";
import { DEFAULT_MODEL_ID } from "../shared/models";
import { projectNodeStates } from "../shared/workflow-run";
import type { AgentChannel, AgentId, ChatRuntimeSessionState, ConfiguredAgent } from "../shared/types";
import { RuntimeDriverRegistry } from "./agent-executor";
import type { AgentExecutionContext, AgentExecutorFactory } from "./agent-executor";
import { runtimeCommandStatePathFor } from "./runtime-command-store";
import { writeNodeCliLauncher } from "./test-cli-fixtures";

const fsPromiseMockState = vi.hoisted(() => ({
  delayedReadPath: undefined as string | undefined,
  readDelayMs: 0,
  readFileCalls: [] as string[],
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const filePath = args[0];
      const normalizedPath =
        typeof filePath === "string" ? filePath.replace(/\\/g, "/") : filePath instanceof URL ? filePath.pathname.replace(/\\/g, "/") : String(filePath);
      fsPromiseMockState.readFileCalls.push(normalizedPath);
      if (fsPromiseMockState.delayedReadPath && normalizedPath === fsPromiseMockState.delayedReadPath && fsPromiseMockState.readDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fsPromiseMockState.readDelayMs));
      }
      return actual.readFile(...args);
    },
  };
});

function configuredAgent(
  id: string,
  options: {
    name?: string;
    runtimeAgentId?: AgentId;
    channelId?: string;
    modelId?: string;
  } = {},
): ConfiguredAgent {
  const runtimeAgentId = options.runtimeAgentId ?? "codex";
  return {
    id,
    name: options.name ?? id,
    description: "",
    runtimeAgentId,
    channelId: options.channelId ?? (runtimeAgentId === "claude" ? "claude-code" : runtimeAgentId === "api" ? "api-openai" : "codex-openai"),
    modelId: options.modelId ?? DEFAULT_MODEL_ID,
    tags: [],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  };
}

function addConfiguredAgents(hub: AgentHub, agents: ConfiguredAgent[]): void {
  hub.updateConfiguredAgents([...hub.snapshot().configuredAgents, ...agents]);
}

function chatConfigLocked(chat: { running: boolean; sessionId: string | undefined; messages: Array<{ local?: boolean | undefined }> }): boolean {
  return chat.running || Boolean(chat.sessionId) || chat.messages.some((message) => !message.local);
}

function interactiveChatCapabilities(runtimeId: AgentId) {
  return {
    runtimeId,
    chatStyle: "interactive" as const,
    taskStyle: "oneshot" as const,
    workflowStyle: "oneshot" as const,
    testStyle: "oneshot" as const,
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: false,
    supportsUserInputRequests: false,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    },
  };
}

function oneshotChatCapabilities(runtimeId: AgentId) {
  return {
    runtimeId,
    chatStyle: "oneshot" as const,
    taskStyle: "oneshot" as const,
    workflowStyle: "oneshot" as const,
    testStyle: "oneshot" as const,
    supportsInterrupt: false,
    supportsContinue: false,
    supportsApprovalRequests: false,
    supportsUserInputRequests: false,
    resume: {
      supportsInProcessConversationResume: false,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    },
  };
}

async function writeCodexAppServerFake(dir: string): Promise<{ executable: string; callsPath: string }> {
  const callsPath = path.join(dir, "calls.jsonl");
  const script = `#!/usr/bin/env node
const fs = require("fs");
const readline = require("readline");

const callsPath = ${JSON.stringify(callsPath)};
if (!process.argv.includes("app-server")) {
  console.error("expected app-server");
  process.exit(2);
}

const models = [
  { id: "gpt-5.5", model: "gpt-5.5", displayName: "GPT-5.5", hidden: false, isDefault: true },
  { id: "gpt-6-preview", model: "gpt-6-preview", displayName: "GPT-6 Preview", hidden: false, isDefault: false }
];
const marketplaces = [
  {
    name: "openai-primary-runtime",
    path: "/tmp/openai-primary-runtime/marketplace.json",
    plugins: [
      { id: "documents@openai-primary-runtime", name: "documents", installed: true, enabled: true, localVersion: "1.0.0" },
      { id: "spreadsheets@openai-primary-runtime", name: "spreadsheets", installed: true, enabled: false, localVersion: "1.0.0" }
    ]
  },
  {
    name: "openai-curated",
    path: null,
    plugins: [
      { id: "github@openai-curated", name: "github", installed: false, enabled: false, localVersion: null }
    ]
  }
];

function write(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.method) {
    fs.appendFileSync(callsPath, JSON.stringify({ method: message.method, params: message.params ?? null }) + "\\n");
  }
  if (message.id === undefined) return;

  if (message.method === "initialize") {
    write({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "config/read") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        config: {
          model: "gpt-5.5",
          model_provider: "openai",
          approval_policy: "never",
          sandbox_mode: "danger-full-access",
          model_reasoning_effort: "high",
          web_search: "enabled"
        },
        origins: {},
        layers: null
      }
    });
    return;
  }
  if (message.method === "model/list") {
    write({ jsonrpc: "2.0", id: message.id, result: { data: models, nextCursor: null } });
    return;
  }
  if (message.method === "plugin/list") {
    write({ jsonrpc: "2.0", id: message.id, result: { marketplaces, marketplaceLoadErrors: [], featuredPluginIds: [] } });
    return;
  }
  if (message.method === "mcpServerStatus/list") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        data: [{ name: "openaiDeveloperDocs", serverInfo: { name: "OpenAI Docs" }, tools: { search_openai_docs: { name: "search_openai_docs" } }, resources: [], resourceTemplates: [], authStatus: "unsupported" }],
        nextCursor: null
      }
    });
    return;
  }
  write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown method " + message.method } });
});
`;
  const executable = await writeNodeCliLauncher(dir, "codex-fake", script);
  return { executable, callsPath };
}

async function writeSequentialCodexFake(dir: string): Promise<{ executable: string; callsPath: string }> {
  const callsPath = path.join(dir, "calls.jsonl");
  const counterPath = path.join(dir, "counter.txt");
  const script = `#!/usr/bin/env node
const fs = require("fs");
const readline = require("readline");

const callsPath = ${JSON.stringify(callsPath)};
const counterPath = ${JSON.stringify(counterPath)};
let threadIndex = 0;

function write(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}

function record(message) {
  if (!message.method) return;
  fs.appendFileSync(callsPath, JSON.stringify({ method: message.method, params: message.params ?? null }) + "\\n");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  record(message);
  if (message.id === undefined) return;

  if (message.method === "initialize") {
    write({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "thread/start") {
    threadIndex += 1;
    write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-" + threadIndex } } });
    return;
  }
  if (message.method === "thread/resume") {
    write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: message.params.threadId } } });
    return;
  }
  if (message.method === "turn/start") {
    const current = Number(fs.existsSync(counterPath) ? fs.readFileSync(counterPath, "utf8") : "0") + 1;
    fs.writeFileSync(counterPath, String(current));
    const text = "artifact-" + current;
    write({ jsonrpc: "2.0", id: message.id, result: { turn: { id: "turn-" + current } } });
    setTimeout(() => {
      write({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { delta: text } });
      write({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          turn: {
            status: "completed",
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }]
          }
        }
      });
    }, 10);
    return;
  }
  write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown method " + message.method } });
});
`;
  const executable = await writeNodeCliLauncher(dir, "codex-sequential-fake", script);
  return { executable, callsPath };
}

async function writeTurnStartFailureCodexFake(dir: string): Promise<{ executable: string; callsPath: string }> {
  const callsPath = path.join(dir, "turn-start-failure-calls.jsonl");
  const script = `#!/usr/bin/env node
const fs = require("fs");
const readline = require("readline");

const callsPath = ${JSON.stringify(callsPath)};

function write(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}

function record(message) {
  if (!message.method) return;
  fs.appendFileSync(callsPath, JSON.stringify({ method: message.method, params: message.params ?? null }) + "\\n");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  record(message);
  if (message.id === undefined) return;

  if (message.method === "initialize") {
    write({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "thread/start") {
    write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-1" } } });
    return;
  }
  if (message.method === "thread/resume") {
    write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: message.params.threadId } } });
    return;
  }
  if (message.method === "turn/start") {
    write({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "turn failed" } });
    return;
  }
  write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown method " + message.method } });
});
`;
  const executable = await writeNodeCliLauncher(dir, "codex-turn-start-failure-fake", script);
  return { executable, callsPath };
}

async function writeInvalidSlashCodexFake(dir: string): Promise<{ executable: string; callsPath: string }> {
  const callsPath = path.join(dir, "codex-invalid-slash-calls.jsonl");
  const script = `#!/usr/bin/env node
const fs = require("fs");
const readline = require("readline");

const callsPath = ${JSON.stringify(callsPath)};

function write(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}

function record(message) {
  if (!message.method) return;
  fs.appendFileSync(callsPath, JSON.stringify({ method: message.method, params: message.params ?? null }) + "\\n");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  record(message);
  if (message.id === undefined) return;

  if (message.method === "initialize") {
    write({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "thread/start") {
    write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-1" } } });
    return;
  }
  if (message.method === "thread/resume") {
    write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: message.params.threadId } } });
    return;
  }
  if (message.method === "turn/start") {
    write({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "unknown slash command /model" } });
    return;
  }
  write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown method " + message.method } });
});
`;
  const executable = await writeNodeCliLauncher(dir, "codex-invalid-slash-fake", script);
  return { executable, callsPath };
}

async function writeClaudeSequentialFake(dir: string): Promise<{ executable: string; callsPath: string }> {
  const callsPath = path.join(dir, "claude-calls.jsonl");
  const script = `#!/usr/bin/env node
const fs = require("fs");

const callsPath = ${JSON.stringify(callsPath)};
const args = process.argv.slice(2);
fs.appendFileSync(callsPath, JSON.stringify({ args }) + "\\n");

const resumeIndex = args.indexOf("--resume");
const sessionId = resumeIndex >= 0 && args[resumeIndex + 1] ? args[resumeIndex + 1] : "claude-session-1";
const prompt = args[args.length - 1] || "";

process.stdout.write(JSON.stringify({
  type: "result",
  subtype: "success",
  session_id: sessionId,
  result: "reply:" + prompt
}) + "\\n");
`;
  const executable = await writeNodeCliLauncher(dir, "claude-sequential-fake", script);
  return { executable, callsPath };
}

async function writeCodexExecFake(dir: string): Promise<{ executable: string; callsPath: string; sessionId: string }> {
  const callsPath = path.join(dir, "exec-calls.jsonl");
  const sessionId = "019ed5a0-0000-7000-8000-000000000123";
  const script = `#!/usr/bin/env node
const fs = require("fs");

const callsPath = ${JSON.stringify(callsPath)};
const sessionId = ${JSON.stringify(sessionId)};
const args = process.argv.slice(2);
fs.appendFileSync(callsPath, JSON.stringify({ args }) + "\\n");

if (args[0] === "archive") {
  process.exit(args[1] === sessionId ? 0 : 3);
}

if (args[0] !== "exec") {
  console.error("expected exec");
  process.exit(2);
}

process.stdout.write(JSON.stringify({ session_id: sessionId }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "OK" } }) + "\\n");
`;
  const executable = await writeNodeCliLauncher(dir, "codex-exec-fake", script);
  return { executable, callsPath, sessionId };
}

async function waitFor<T>(read: () => T, predicate: (value: T) => boolean): Promise<T> {
  const startedAt = Date.now();
  let value = read();
  while (!predicate(value)) {
    if (Date.now() - startedAt > 2000) {
      throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    value = read();
  }
  return value;
}

describe("AgentHub chat sessions", () => {
  test("refreshes workflow agent timeout after activity", () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const timeout = createWorkflowAgentTimeout({ timeoutMs: 1000, onTimeout });

      vi.advanceTimersByTime(900);
      timeout.refresh();
      vi.advanceTimersByTime(900);

      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(onTimeout).toHaveBeenCalledTimes(1);
      timeout.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  test("stores tool calls and results as structured chat events", () => {
    const hub = new AgentHub();
    const chatId = hub.snapshot().activeChatId!;
    const chat = (hub as any).chats.get(chatId);

    (hub as any).handleAgentEvent(chat, {
      type: "tool_call",
      name: "shell_command",
      content: "ls src",
    });
    (hub as any).handleAgentEvent(chat, {
      type: "tool_result",
      name: "shell_command",
      content: "App.tsx",
    });

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.messages).toHaveLength(1);
    expect(activeChat?.messages[0]).toMatchObject({
      role: "assistant",
      content: "",
      events: [
        expect.objectContaining({ type: "tool_call", name: "shell_command", content: "ls src" }),
        expect.objectContaining({ type: "tool_result", name: "shell_command", content: "App.tsx" }),
      ],
    });
  });

  test("runs chat turns through the configured agent executor", async () => {
    const events: any[] = [];
    const executorFactory: AgentExecutorFactory = {
      create: (context: any) => ({
        start: async () => {
          events.push(context);
          context.emit({ type: "session", sessionId: "executor-session" });
          context.emit({ type: "delta", content: "executor response" });
          context.emit({ type: "completed" });
        },
        stop: async () => undefined,
      }),
    };
    const runtimeDrivers = new RuntimeDriverRegistry([
      {
        runtimeId: "codex",
        getCapabilities: () => oneshotChatCapabilities("codex"),
        createOneShotExecutor: (context: AgentExecutionContext) => executorFactory.create(context),
      } as any,
    ]);
    const hub = new AgentHub(
      { codex: "missing-codex-for-test", claude: "missing-claude-for-test" },
      executorFactory,
      runtimeDrivers,
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex",
      version: "test",
      available: true,
    });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("Hello", chatId);
    await waitFor(() => hub.snapshot().chats.find((chat) => chat.id === chatId), (chat) => chat?.running === false);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      agentId: "codex",
      prompt: "Hello",
      runKind: "chat",
      developerInstructions: expect.stringContaining("desktop chat UI"),
    });
    const activeChat = hub.snapshot().chats.find((chat) => chat.id === chatId);
    expect(activeChat?.sessionId).toBe("executor-session");
    expect(activeChat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Hello" }),
      expect.objectContaining({ role: "assistant", content: "executor response" }),
    ]);
  });

  test("does not eagerly create interactive sessions while restoring persisted chats", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-restore-interactive-"));
    const storagePath = path.join(dir, "app-chats.json");
    await writeFile(
      storagePath,
      JSON.stringify({
        version: 3,
        activeChatId: "chat-1",
        workDir: dir,
        sessions: [
          {
            id: "chat-1",
            title: "Restored interactive chat",
            configuredAgentId: "default-agent",
            modelId: DEFAULT_MODEL_ID,
            sessionId: "thread-restore-1",
            runtimeSession: {
              executionStyle: "interactive",
              attachmentState: "detached",
              attachmentGeneration: 0,
              resumeState: {
                runtimeId: "codex",
                native: { threadId: "thread-restore-1" },
              },
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
            },
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        ],
        messages: [],
        events: [],
        tasks: [],
        taskMessages: [],
        taskEvents: [],
        teams: [],
        teamRuns: [],
      }),
      "utf8",
    );

    const createInteractiveSession = vi.fn();
    const runtimeDrivers = new RuntimeDriverRegistry([
      {
        runtimeId: "codex",
        getCapabilities: () => interactiveChatCapabilities("codex"),
        createOneShotExecutor: () => ({
          start: async () => undefined,
          stop: async () => undefined,
        }),
        createInteractiveSession,
      } as any,
    ]);

    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      undefined,
      runtimeDrivers,
    );
    await hub.loadPersistedState(storagePath);

    expect(createInteractiveSession).not.toHaveBeenCalled();
    expect(hub.snapshot().chats.find((chat) => chat.id === "chat-1")?.runtimeSession?.attachmentState).toBe("detached");
  });

  test("routes interactive chats through the shared session manager when a driver supports it", async () => {
    const executorFactory: AgentExecutorFactory = {
      create: () => ({
        start: async () => {
          throw new Error("one-shot executor path should not run");
        },
        stop: async () => undefined,
      }),
    };
    const session = {
      reconfigure: vi.fn(),
      ensureAttached: vi.fn(async () => undefined),
      sendPrompt: vi.fn(async (prompt: string) => {
        expect(prompt).toBe("Hello");
        interactiveContext.emit({ type: "session", sessionId: "interactive-session-1" });
        interactiveContext.emit({ type: "delta", content: "interactive response" });
        interactiveContext.emit({ type: "completed" });
      }),
      interrupt: vi.fn(async () => undefined),
      detach: vi.fn(async () => undefined),
      detachIfStillExpired: vi.fn(async () => undefined),
      snapshot: () => ({
        executionStyle: "interactive" as const,
        attachmentState: "idle" as const,
        attachmentGeneration: 1,
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
      }),
    };
    let interactiveContext: any;
    const runtimeDrivers = new RuntimeDriverRegistry([
      {
        runtimeId: "codex",
        getCapabilities: () => interactiveChatCapabilities("codex"),
        createOneShotExecutor: () => ({
          start: async () => {
            throw new Error("driver one-shot path should not run");
          },
          stop: async () => undefined,
        }),
        createInteractiveSession: (context: any) => {
          interactiveContext = context;
          return session;
        },
      } as any,
    ]);
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      executorFactory,
      runtimeDrivers,
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex",
      version: "test",
      available: true,
    });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("Hello", chatId);
    const activeChat = await waitFor(
      () => hub.snapshot().chats.find((chat) => chat.id === chatId),
      (chat) => chat?.running === false,
    );

    expect(session.sendPrompt).toHaveBeenCalledWith("Hello");
    expect(activeChat?.sessionId).toBe("interactive-session-1");
    expect(activeChat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Hello" }),
      expect.objectContaining({ role: "assistant", content: "interactive response" }),
    ]);
  });

  test("reuses one Codex attachment for sequential prompts in the same chat", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-interactive-"));
    const fake = await writeSequentialCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "test",
      available: true,
    });

    const chatId = hub.snapshot().activeChatId!;
    await hub.sendPrompt("First", chatId);
    await waitFor(() => hub.snapshot().chats.find((chat) => chat.id === chatId), (chat) => chat?.running === false);
    await hub.sendPrompt("Second", chatId);
    await waitFor(() => hub.snapshot().chats.find((chat) => chat.id === chatId), (chat) => chat?.running === false);

    const calls = (await readFile(fake.callsPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { method: string });
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "thread/start")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "thread/resume")).toHaveLength(0);
    expect(calls.filter((call) => call.method === "turn/start")).toHaveLength(2);
  });

  test("routes Claude chats through shared interactive sessions and reuses the same session id for follow-up prompts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-interactive-"));
    const fake = await writeClaudeSequentialFake(dir);
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: fake.executable });
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
    const chatId = hub.snapshot().activeChatId!;
    hub.setChatAgent(chatId, "claude-agent");
    (hub as any).runtimes.set("claude", {
      id: "claude",
      label: "Claude",
      command: fake.executable,
      version: "test",
      available: true,
    });

    await hub.sendPrompt("first", chatId);
    let activeChat = await waitFor(
      () => hub.snapshot().chats.find((chat) => chat.id === chatId),
      (chat) => chat?.running === false,
    );
    expect(activeChat?.runtimeSession).toMatchObject({
      executionStyle: "interactive",
      attachmentState: "idle",
      resumeState: { runtimeId: "claude", native: { sessionId: "claude-session-1" } },
    });

    await hub.sendPrompt("second", chatId);
    activeChat = await waitFor(
      () => hub.snapshot().chats.find((chat) => chat.id === chatId),
      (chat) => chat?.running === false,
    );

    const calls = (await readFile(fake.callsPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { args: string[] });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).not.toContain("--resume");
    expect(calls[1]?.args).toContain("--resume");
    expect(calls[1]?.args).toContain("claude-session-1");
    expect(activeChat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "first" }),
      expect.objectContaining({ role: "assistant", content: "reply:first" }),
      expect.objectContaining({ role: "user", content: "second" }),
      expect.objectContaining({ role: "assistant", content: "reply:second" }),
    ]);
  });

  test("maps Claude interactive chat model ids through the channel-specific CLI alias before spawn", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-interactive-model-"));
    const fake = await writeClaudeSequentialFake(dir);
    const channelPath = path.join(dir, "model-channels.json");
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: fake.executable });
    await hub.loadModelChannels(channelPath);
    await hub.saveModelChannels([
      {
        id: "claude-deepseek",
        agentId: "claude",
        label: "Claude DeepSeek",
        providerName: "DeepSeek",
        modelProvider: "deepseek-anthropic",
        baseUrl: "https://api.deepseek.test/anthropic",
        httpHeaders: { Authorization: "Bearer deepseek-key" },
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
        ],
      },
    ]);
    addConfiguredAgents(
      hub,
      [configuredAgent("claude-agent", {
        runtimeAgentId: "claude",
        name: "Claude Agent",
        channelId: "claude-deepseek",
        modelId: "deepseek-v4-flash",
      })],
    );
    const chatId = hub.createChat("claude-agent").id;
    (hub as any).runtimes.set("claude", {
      id: "claude",
      label: "Claude",
      command: fake.executable,
      version: "test",
      available: true,
    });

    await hub.sendPrompt("first", chatId);
    await waitFor(
      () => hub.snapshot().chats.find((chat) => chat.id === chatId),
      (chat) => chat?.running === false,
    );

    const calls = (await readFile(fake.callsPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { args: string[] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toContain("--model");
    expect(calls[0]?.args).toContain("claude-haiku-4-5");
    expect(calls[0]?.args).not.toContain("deepseek-v4-flash");
  });

  test("marks chat failed when interactive session creation throws", async () => {
    const runtimeDrivers = new RuntimeDriverRegistry([
      {
        runtimeId: "codex",
        getCapabilities: () => interactiveChatCapabilities("codex"),
        createOneShotExecutor: () => ({
          start: async () => {
            throw new Error("one-shot executor path should not run");
          },
          stop: async () => undefined,
        }),
        createInteractiveSession: () => {
          throw new Error("interactive session unavailable");
        },
      } as any,
    ]);
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      undefined,
      runtimeDrivers,
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex",
      version: "test",
      available: true,
    });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("Hello", chatId);
    const activeChat = await waitFor(
      () => hub.snapshot().chats.find((chat) => chat.id === chatId),
      (chat) => chat?.running === false,
    );

    expect(activeChat?.lastError).toBe("interactive session unavailable");
    expect(activeChat?.messages.at(-1)).toMatchObject({
      role: "error",
      content: "interactive session unavailable",
    });
  });

  test("stopChat interrupts an in-flight interactive turn without waiting for the session queue to drain", async () => {
    let interactiveContext: any;
    let releasePrompt: (() => void) | undefined;
    let promptStarted = false;
    const sessionState: ChatRuntimeSessionState = {
      executionStyle: "interactive" as const,
      attachmentState: "idle" as const,
      attachmentGeneration: 1,
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
    const session = {
      reconfigure: vi.fn(),
      ensureAttached: vi.fn(async () => {
        sessionState.attachmentState = "idle";
      }),
      sendPrompt: vi.fn(async () => {
        promptStarted = true;
        interactiveContext.emit({ type: "session", sessionId: "interactive-session-1" });
        sessionState.attachmentState = "running";
        await new Promise<void>((resolve) => {
          releasePrompt = resolve;
        });
      }),
      interrupt: vi.fn(async () => {
        sessionState.attachmentState = "interrupted";
        releasePrompt?.();
      }),
      detach: vi.fn(async () => undefined),
      detachIfStillExpired: vi.fn(async () => undefined),
      snapshot: () => sessionState,
    };
    const runtimeDrivers = new RuntimeDriverRegistry([
      {
        runtimeId: "codex",
        getCapabilities: () => interactiveChatCapabilities("codex"),
        createOneShotExecutor: () => ({
          start: async () => {
            throw new Error("driver one-shot path should not run");
          },
          stop: async () => undefined,
        }),
        createInteractiveSession: (context: any) => {
          interactiveContext = context;
          return session;
        },
      } as any,
    ]);
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      undefined,
      runtimeDrivers,
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex",
      version: "test",
      available: true,
    });
    const chatId = hub.snapshot().activeChatId!;

    const sendPromise = hub.sendPrompt("Hello", chatId);
    await waitFor(() => promptStarted, Boolean);

    const stopResult = await Promise.race([
      hub.stopChat(chatId).then(() => "stopped" as const),
      new Promise<"timed_out">((resolve) => setTimeout(() => resolve("timed_out"), 50)),
    ]);

    expect(stopResult).toBe("stopped");
    expect(session.interrupt).toHaveBeenCalledTimes(1);
    await sendPromise;

    const activeChat = hub.snapshot().chats.find((chat) => chat.id === chatId);
    expect(activeChat?.running).toBe(false);
    expect(activeChat?.messages.at(-1)).toMatchObject({
      role: "error",
      content: "Stopped",
    });
  });

  test("clears interactive runtime turn state when Codex turn/start fails", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-turn-failure-"));
    const fake = await writeTurnStartFailureCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "test",
      available: true,
    });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("Hello", chatId);

    const activeChat = await waitFor(
      () => hub.snapshot().chats.find((chat) => chat.id === chatId),
      (chat) => chat?.running === false,
    );

    expect(activeChat?.lastError).toContain("turn/start: turn failed");
    expect(activeChat?.runtimeSession?.attachmentState).toBe("idle");
    expect(activeChat?.runtimeSession?.activeTurnId).toBeUndefined();
  });

  test("disposes interactive sessions when deleting a chat after completion", async () => {
    const session = {
      reconfigure: vi.fn(),
      ensureAttached: vi.fn(async () => undefined),
      sendPrompt: vi.fn(async () => {
        interactiveContext.emit({ type: "completed", content: "done" });
      }),
      interrupt: vi.fn(async () => undefined),
      detach: vi.fn(async () => undefined),
      detachIfStillExpired: vi.fn(async () => undefined),
      snapshot: () => ({
        executionStyle: "interactive" as const,
        attachmentState: "idle" as const,
        attachmentGeneration: 1,
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
      }),
    };
    let interactiveContext: any;
    const runtimeDrivers = new RuntimeDriverRegistry([
      {
        runtimeId: "codex",
        getCapabilities: () => interactiveChatCapabilities("codex"),
        createOneShotExecutor: () => ({
          start: async () => {
            throw new Error("driver one-shot path should not run");
          },
          stop: async () => undefined,
        }),
        createInteractiveSession: (context: any) => {
          interactiveContext = context;
          return session;
        },
      } as any,
    ]);
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      undefined,
      runtimeDrivers,
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex",
      version: "test",
      available: true,
    });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("Hello", chatId);
    await waitFor(
      () => hub.snapshot().chats.find((chat) => chat.id === chatId),
      (chat) => chat?.running === false,
    );
    await hub.deleteChat(chatId);

    expect(session.detach).toHaveBeenCalledWith("app_shutdown");
  });

  test("deletes Codex sessions created while testing configured agents", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-test-"));
    const fake = await writeCodexExecFake(dir);
    const codexHomeDir = path.join(dir, "codex-home");
    const sessionDir = path.join(codexHomeDir, "sessions", "2026", "06", "29");
    const sessionPath = path.join(sessionDir, `rollout-2026-06-29T22-42-38-${fake.sessionId}.jsonl`);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(sessionPath, "{}\n", "utf8");
    vi.stubEnv("CODEX_HOME", codexHomeDir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });

    await hub.loadModelChannels(path.join(dir, "model-channels.json"));
    await hub.saveModelChannels([
      {
        id: "codex-volcengine",
        agentId: "codex",
        label: "Codex Volcengine",
        providerName: "Volcengine",
        modelProvider: "volcengine",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        wireApi: "responses",
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "ep-m-user-owned-endpoint", label: "User endpoint" },
        ],
      },
    ]);
    hub.updateConfiguredAgents([
      {
        id: "doubao-agent",
        name: "Doubao Agent",
        description: "",
        runtimeAgentId: "codex",
        channelId: "codex-volcengine",
        modelId: "ep-m-user-owned-endpoint",
        tags: [],
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
      },
    ]);

    try {
      const result = await hub.testConfiguredAgent("doubao-agent");

      expect(result.ok).toBe(true);
      const calls = (await readFile(fake.callsPath, "utf8"))
        .trim()
        .split(/\n/)
        .map((line) => JSON.parse(line) as { args: string[] });
      expect(calls.some((call) => call.args[0] === "exec" && call.args.some((arg) => arg.includes("ep-m-user-owned-endpoint")))).toBe(true);
      expect(calls).toContainEqual({ args: ["archive", fake.sessionId] });
      // The local rollout file for the test session must be deleted, not just archived.
      await expect(readFile(sessionPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("queries a runtime channel balance from the stored channel config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-balance-"));
    const hub = new AgentHub();
    await hub.loadModelChannels(path.join(dir, "model-channels.json"));
    await hub.saveModelChannels([
      {
        id: "deepseek-api",
        agentId: "api",
        label: "DeepSeek API",
        providerName: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        httpHeaders: { Authorization: "Bearer sk-deepseek" },
        models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
      },
    ]);
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "42" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await hub.queryRuntimeChannelBalance("deepseek-api", { fetch: fetchImpl, now: () => 1710000000000 });

    expect(result).toMatchObject({
      channelId: "deepseek-api",
      providerName: "DeepSeek",
      supported: true,
      status: "success",
      items: [{ label: "CNY", remaining: 42, unit: "CNY" }],
    });
  });

  test("starts with one codex chat selected", () => {
    const hub = new AgentHub();
    const snapshot = hub.snapshot();
    const activeChat = snapshot.chats.find((chat) => chat.id === snapshot.activeChatId);

    expect(snapshot.chats).toHaveLength(1);
    expect(activeChat?.configuredAgentId).toBe("default-agent");
    expect(snapshot.configuredAgents.find((agent) => agent.id === activeChat?.configuredAgentId)).toMatchObject({
      runtimeAgentId: "codex",
      channelId: "codex-openai",
    });
  });

  test("creates isolated chats with their own agent provider", () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);

    const claudeChat = hub.createChat("claude-agent");
    const snapshot = hub.snapshot();
    const activeChat = snapshot.chats.find((chat) => chat.id === snapshot.activeChatId);

    expect(claudeChat.configuredAgentId).toBe("claude-agent");
    expect(snapshot.chats).toHaveLength(2);
    expect(activeChat?.id).toBe(claudeChat.id);
    expect(activeChat?.configuredAgentId).toBe("claude-agent");
  });

  test("deletes a chat session with its local messages and selects the next remaining chat", async () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    const firstChatId = hub.snapshot().activeChatId!;
    const secondChat = hub.createChat("default-agent");
    const firstChat = (hub as any).chats.get(firstChatId);
    firstChat.messages.push({ id: "m-1", role: "user", content: "Delete me", timestamp: 1710000000000 });
    hub.selectChat(firstChatId);

    const snapshot = await (hub as any).deleteChat(firstChatId);

    expect(snapshot.chats.map((chat: any) => chat.id)).toEqual([secondChat.id]);
    expect(snapshot.activeChatId).toBe(secondChat.id);
    expect(snapshot.chats.some((chat: any) => chat.id === firstChatId || chat.messages.some((message: any) => message.content === "Delete me"))).toBe(false);
  });

  test("archives the Codex session when deleting a chat with a session id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-chat-archive-"));
    const argsPath = path.join(dir, "args.txt");
    const executable = await writeNodeCliLauncher(
      dir,
      "codex-fake",
      `const fs = require("fs");
fs.writeFileSync(${JSON.stringify(argsPath)}, process.argv.slice(2).join("\\n") + "\\n", "utf8");
`,
    );

    const hub = new AgentHub({ codex: executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;
    const chat = (hub as any).chats.get(chatId);
    chat.sessionId = "019e9143-2451-7612-a62d-e65389574d7d";

    const snapshot = await (hub as any).deleteChat(chatId);

    expect(snapshot.chats.some((item: any) => item.id === chatId)).toBe(false);
    expect(await readFile(argsPath, "utf8")).toBe("archive\n019e9143-2451-7612-a62d-e65389574d7d\n");
  });

  test("deletes the local Codex session file when archive fails", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-delete-fallback-"));
    const codexHomeDir = path.join(dir, "codex-home");
    const sessionId = "019e9143-2451-7612-a62d-e65389574d7d";
    const sessionDir = path.join(codexHomeDir, "sessions", "2026", "06", "29");
    const sessionPath = path.join(sessionDir, `rollout-2026-06-29T22-42-38-${sessionId}.jsonl`);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(sessionPath, "{}\n", "utf8");
    const executable = await writeNodeCliLauncher(dir, "codex-fake", "process.exit(1);\n");
    vi.stubEnv("CODEX_HOME", codexHomeDir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const hub = new AgentHub({ codex: executable, claude: "missing-claude-for-test" });
      const chatId = hub.snapshot().activeChatId!;
      const chat = (hub as any).chats.get(chatId);
      chat.sessionId = sessionId;

      await (hub as any).deleteChat(chatId);

      await expect(readFile(sessionPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  test("flushes persisted state when deleting a chat", async () => {
    vi.useFakeTimers();
    try {
      const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-delete-persist-"));
      const storagePath = path.join(dir, "state.json");
      const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
      await hub.loadPersistedState(storagePath);
      const chatId = hub.snapshot().activeChatId!;

      await (hub as any).deleteChat(chatId);

      const persisted = JSON.parse(await readFile(storagePath, "utf8")) as { sessions?: Array<{ id: string }> };
      expect(persisted.sessions?.some((session) => session.id === chatId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("deletes the Claude session file when deleting a Claude chat", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-home-"));
    const workDir = path.join(homeDir, "workspace");
    const sessionId = "019e9143-2451-7612-a62d-e65389574d7d";
    const projectSlug = workDir.replace(/[:\\/]/g, "-");
    const sessionDir = path.join(homeDir, ".claude", "projects", projectSlug);
    const sessionPath = path.join(sessionDir, `${sessionId}.jsonl`);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(sessionPath, "{}\n", "utf8");
    vi.stubEnv("HOME", homeDir);
    try {
      const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
      addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
      hub.setWorkDir(workDir);
      const chat = hub.createChat("claude-agent");
      const state = (hub as any).chats.get(chat.id);
      state.sessionId = sessionId;

      await (hub as any).deleteChat(chat.id);

      await expect(readFile(sessionPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("changes the active chat agent without affecting other chats", () => {
    const hub = new AgentHub();
    const firstChatId = hub.snapshot().activeChatId!;
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
    const secondChat = hub.createChat("claude-agent");

    hub.setChatAgent(secondChat.id, "default-agent");

    const snapshot = hub.snapshot();
    const firstChat = snapshot.chats.find((chat) => chat.id === firstChatId);
    const activeChat = snapshot.chats.find((chat) => chat.id === snapshot.activeChatId);

    expect(firstChat?.configuredAgentId).toBe("default-agent");
    expect(activeChat?.id).toBe(secondChat.id);
    expect(activeChat?.configuredAgentId).toBe("default-agent");
  });

  test("tracks the selected configured agent per chat before a conversation starts", () => {
    const hub = new AgentHub();
    addConfiguredAgents(hub, [
      configuredAgent("codex-gpt55", { name: "Codex GPT-5.5", modelId: "gpt-5.5" }),
      configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" }),
    ]);
    const chatId = hub.snapshot().activeChatId!;

    hub.setChatModel(chatId, "gpt-5.5");

    const activeChat = hub.snapshot().chats.find((chat) => chat.id === chatId);
    expect(activeChat?.configuredAgentId).toBe("default-agent");

    hub.setChatAgent(chatId, "claude-agent");

    const switchedChat = hub.snapshot().chats.find((chat) => chat.id === chatId);
    expect(switchedChat?.configuredAgentId).toBe("claude-agent");
  });

  test("uses the chat-selected model when sending a prompt", async () => {
    const contexts: AgentExecutionContext[] = [];
    const executorFactory: AgentExecutorFactory = {
      create: (context) => {
        contexts.push(context);
        return {
          start: async () => {
            context.emit({ type: "completed", content: "ok" });
          },
          stop: async () => undefined,
        };
      },
    };
    const runtimeDrivers = new RuntimeDriverRegistry([
      {
        runtimeId: "codex",
        getCapabilities: () => oneshotChatCapabilities("codex"),
        createOneShotExecutor: (context: AgentExecutionContext) => executorFactory.create(context),
      } as any,
    ]);
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      executorFactory,
      runtimeDrivers,
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex-for-test",
      version: "test",
      available: true,
    });
    const chatId = hub.snapshot().activeChatId!;

    hub.setChatModel(chatId, "gpt-5.5");
    await hub.sendPrompt("Use the selected model", chatId);

    await waitFor(() => contexts, (items) => items.length === 1);
    expect(contexts[0]?.modelId).toBe("gpt-5.5");
  });

  test("changes the selected channel before a conversation starts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-config-"));
    const hub = new AgentHub();
    await hub.loadModelChannels(path.join(dir, "model-channels.json"));
    await hub.saveModelChannels([
      {
        id: "codex-openai",
        agentId: "codex",
        label: "Codex OpenAI",
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "gpt-5.5", label: "GPT-5.5" },
        ],
      },
      {
        id: "codex-bridge",
        agentId: "codex",
        label: "Codex Bridge",
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "gpt-5.4", label: "GPT-5.4" },
        ],
      },
    ]);
    const chatId = hub.snapshot().activeChatId!;

    hub.setChatChannel(chatId, "codex-bridge");
    hub.setChatModel(chatId, "gpt-5.4");

    const activeChat = hub.snapshot().chats.find((chat) => chat.id === chatId);
    expect(activeChat?.configuredAgentId).toBe("default-agent");
  });

  test("does not change configured agent after a conversation has started", () => {
    const hub = new AgentHub();
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
    const chatId = hub.snapshot().activeChatId!;
    const chat = (hub as any).chats.get(chatId);

    (hub as any).handleAgentEvent(chat, { type: "delta", content: "Started" });

    hub.setChatAgent(chatId, "claude-agent");
    hub.setChatChannel(chatId, "claude-code");
    hub.setChatModel(chatId, "gpt-5.5");

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.configuredAgentId).toBe("default-agent");
  });

  test("stores agent session ids without adding transcript messages", () => {
    const hub = new AgentHub();
    const chatId = hub.snapshot().activeChatId!;
    const chat = (hub as any).chats.get(chatId);

    (hub as any).handleAgentEvent(chat, { type: "session", sessionId: "session-123" });

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.sessionId).toBe("session-123");
    expect(activeChat?.messages).toEqual([]);
  });

  test("does not append final completed content after streamed assistant text", () => {
    const hub = new AgentHub();
    const chatId = hub.snapshot().activeChatId!;
    const chat = (hub as any).chats.get(chatId);

    (hub as any).handleAgentEvent(chat, { type: "delta", content: "Hello" });
    (hub as any).handleAgentEvent(chat, { type: "completed", content: "Hello" });

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.messages).toHaveLength(1);
    expect(activeChat?.messages[0]).toMatchObject({ role: "assistant", content: "Hello" });
  });

  test("shows meta events between assistant message segments", () => {
    const hub = new AgentHub();
    const chatId = hub.snapshot().activeChatId!;
    const chat = (hub as any).chats.get(chatId);

    (hub as any).handleAgentEvent(chat, { type: "delta", content: "I will inspect files." });
    (hub as any).handleAgentEvent(chat, { type: "meta", content: "→ shell_command\nls" });
    (hub as any).handleAgentEvent(chat, { type: "delta", content: "Found the files." });

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.messages).toHaveLength(1);
    expect(activeChat?.messages[0]).toMatchObject({
      role: "assistant",
      content: "I will inspect files.Found the files.",
      events: [expect.objectContaining({ type: "meta", content: "→ shell_command\nls" })],
    });
  });

  test("handles /app help locally without starting a runtime conversation", async () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("/app help", chatId);

    const chat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(chat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "/app help", local: true }),
      expect.objectContaining({ role: "assistant", local: true, content: expect.stringContaining("/app status") }),
    ]);
    expect(chat?.sessionId).toBeUndefined();
    expect(chat?.running).toBe(false);
  });

  test("handles /app help locally even when no configured agent can be resolved", async () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;
    hub.updateConfiguredAgents([]);

    await hub.sendPrompt("/app help", chatId);

    const chat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(chat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "/app help", local: true }),
      expect.objectContaining({ role: "assistant", local: true, content: expect.stringContaining("/app status") }),
    ]);
    expect(chat?.lastError).toBeUndefined();
    expect(chat?.running).toBe(false);
  });

  test("forwards bare slash to the runtime path instead of handling it locally", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-slash-runtime-"));
    const fake = await writeClaudeSequentialFake(dir);
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: fake.executable });
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
    const chatId = hub.snapshot().activeChatId!;
    hub.setChatAgent(chatId, "claude-agent");
    (hub as any).runtimes.set("claude", {
      id: "claude",
      label: "Claude",
      command: fake.executable,
      version: "test",
      available: true,
    });

    await hub.sendPrompt("/help", chatId);

    const chat = await waitFor(
      () => hub.snapshot().chats.find((item) => item.id === chatId),
      (item) => item?.running === false,
    );
    const calls = (await readFile(fake.callsPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { args: string[] });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.at(-1)).toBe("/help");
    expect(chat?.sessionId).toBe("claude-session-1");
    expect(chat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "/help" }),
      expect.objectContaining({ role: "assistant", content: "reply:/help" }),
    ]);
    expect(chat?.messages[0]?.local).toBeUndefined();
    expect(chat?.messages[1]?.local).toBeUndefined();
  });

  test("rejects bare slash locally for api chats without locking the chat config", async () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    addConfiguredAgents(hub, [configuredAgent("api-agent", { runtimeAgentId: "api", name: "API Agent" })]);
    const chatId = hub.snapshot().activeChatId!;
    hub.setChatAgent(chatId, "api-agent");

    await hub.sendPrompt("/help", chatId);

    const chat = hub.snapshot().chats.find((item) => item.id === chatId)!;
    expect(chat.messages).toEqual([
      expect.objectContaining({ role: "user", content: "/help", local: true }),
      expect.objectContaining({
        role: "assistant",
        local: true,
        content: expect.stringContaining("Native slash commands are not supported by API runtimes"),
      }),
    ]);
    expect(chatConfigLocked(chat)).toBe(false);
  });

  test("reads Claude slash metadata from on-disk command and skill sources through AgentHub", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-slash-metadata-home-"));
    const workDir = path.join(homeDir, "workspace");
    await mkdir(path.join(workDir, ".claude", "commands", "frontend"), { recursive: true });
    await mkdir(path.join(workDir, ".claude", "skills", "project-review"), { recursive: true });
    await mkdir(path.join(homeDir, ".claude", "skills", "refactor-review-knowledge"), { recursive: true });
    await writeFile(
      path.join(workDir, ".claude", "commands", "frontend", "component.md"),
      [
        "---",
        'name: "Frontend Component"',
        'description: "Scaffold a frontend component from the current workspace."',
        'argument-hint: "<name>"',
        "---",
        "",
        "Create a component.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workDir, ".claude", "commands", "frontend", "hidden.md"),
      [
        "---",
        'description: "Should stay hidden from the slash menu."',
        "user-invocable: false",
        "---",
        "",
        "Hidden command.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workDir, ".claude", "skills", "project-review", "SKILL.md"),
      [
        "---",
        'name: "Project Review"',
        'description: "Review the current project before making changes."',
        "---",
        "",
        "Review this project.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(homeDir, ".claude", "skills", "refactor-review-knowledge", "SKILL.md"),
      [
        "---",
        'name: "Refactor Review Knowledge"',
        'description: "Review refactors for regression risks."',
        "---",
        "",
        "Review refactors.",
        "",
      ].join("\n"),
      "utf8",
    );

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    try {
      const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
      addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
      hub.setWorkDir(workDir);
      const chat = hub.createChat("claude-agent");

      const groups = await hub.listSlashCompletionGroups(chat.id, "/");
      const nativeMetadata = groups.find((group) => group.id === "native_metadata");

      expect(nativeMetadata?.items).toEqual(
        expect.arrayContaining([
          {
            id: "claude:frontend:component",
            label: "/frontend:component",
            insertText: "/frontend:component <name> ",
            description: "Scaffold a frontend component from the current workspace.",
            authoritative: true,
          },
          {
            id: "claude:project-review",
            label: "/project-review",
            insertText: "/project-review ",
            description: "Review the current project before making changes.",
            authoritative: true,
          },
          {
            id: "claude:refactor-review-knowledge",
            label: "/refactor-review-knowledge",
            insertText: "/refactor-review-knowledge ",
            description: "Review refactors for regression risks.",
            authoritative: true,
          },
        ]),
      );
      expect(nativeMetadata?.items.some((item) => item.id === "claude:frontend:hidden")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("reuses cached Claude slash metadata across repeated completion lookups", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-slash-cache-home-"));
    const workDir = path.join(homeDir, "workspace");
    const commandPath = path.join(workDir, ".claude", "commands", "frontend", "component.md");
    await mkdir(path.dirname(commandPath), { recursive: true });
    await writeFile(
      commandPath,
      [
        "---",
        'description: "Initial frontend component description."',
        "---",
        "",
        "Create a component.",
        "",
      ].join("\n"),
      "utf8",
    );

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    try {
      const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
      addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
      hub.setWorkDir(workDir);
      const chat = hub.createChat("claude-agent");

      const firstGroups = await hub.listSlashCompletionGroups(chat.id, "/");
      const firstMetadata = firstGroups.find((group) => group.id === "native_metadata");
      expect(firstMetadata?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "claude:frontend:component",
            description: "Initial frontend component description.",
          }),
        ]),
      );

      await writeFile(
        commandPath,
        [
          "---",
          'description: "Updated description that should not appear without invalidation."',
          "---",
          "",
          "Create a component.",
          "",
        ].join("\n"),
        "utf8",
      );

      const secondGroups = await hub.listSlashCompletionGroups(chat.id, "/");
      const secondMetadata = secondGroups.find((group) => group.id === "native_metadata");
      expect(secondMetadata?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "claude:frontend:component",
            description: "Initial frontend component description.",
          }),
        ]),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("dedupes in-flight Claude slash metadata loads across concurrent completion lookups", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-slash-concurrent-home-"));
    const workDir = path.join(homeDir, "workspace");
    const commandPath = path.join(workDir, ".claude", "commands", "frontend", "component.md");
    await mkdir(path.dirname(commandPath), { recursive: true });
    await writeFile(
      commandPath,
      [
        "---",
        'description: "Concurrent load command."',
        "---",
        "",
        "Create a component.",
        "",
      ].join("\n"),
      "utf8",
    );

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    fsPromiseMockState.readFileCalls = [];
    fsPromiseMockState.delayedReadPath = commandPath.replace(/\\/g, "/");
    fsPromiseMockState.readDelayMs = 30;
    try {
      const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
      addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
      hub.setWorkDir(workDir);
      const chat = hub.createChat("claude-agent");

      const [firstGroups, secondGroups] = await Promise.all([
        hub.listSlashCompletionGroups(chat.id, "/"),
        hub.listSlashCompletionGroups(chat.id, "/"),
      ]);

      expect(firstGroups.find((group) => group.id === "native_metadata")?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "claude:frontend:component" })]),
      );
      expect(secondGroups.find((group) => group.id === "native_metadata")?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "claude:frontend:component" })]),
      );

      const matchingReads = fsPromiseMockState.readFileCalls.filter((filePath) => filePath === commandPath.replace(/\\/g, "/"));
      expect(matchingReads).toHaveLength(1);
    } finally {
      fsPromiseMockState.delayedReadPath = undefined;
      fsPromiseMockState.readDelayMs = 0;
      fsPromiseMockState.readFileCalls = [];
      vi.unstubAllEnvs();
    }
  });

  test("learns a successful native slash command under the current fingerprint", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-learned-native-slash-"));
    const fake = await writeSequentialCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "0.136.0",
      available: true,
      fingerprint: "codex|0.136.0|team-a",
    });

    await hub.sendPrompt("/model gpt-5.5", chatId);

    await waitFor(
      () => hub.snapshot().chats.find((item) => item.id === chatId),
      (item) => item?.running === false,
    );

    expect((hub as any).learnedNativeCommands).toEqual([
      expect.objectContaining({
        runtimeId: "codex",
        cliFingerprint: "codex|0.136.0|team-a",
        commandStem: "/model",
        example: "/model gpt-5.5",
        successCount: 1,
      }),
    ]);
    expect((hub.snapshot().chats.find((item) => item.id === chatId) as any)?.pendingNativeSlashTurn).toBeUndefined();
  });

  test("explicit invalid command evidence evicts the learned native command immediately", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-invalid-native-slash-"));
    const fake = await writeInvalidSlashCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "0.136.0",
      available: true,
      fingerprint: "codex|0.136.0|team-a",
    });
    (hub as any).learnedNativeCommands = [
      {
        runtimeId: "codex",
        cliFingerprint: "codex|0.136.0|team-a",
        commandStem: "/model",
        example: "/model gpt-5.5",
        successCount: 3,
        lastUsedAt: 1710000000000,
      },
    ];

    await hub.sendPrompt("/model gpt-5.5", chatId);

    const chat = await waitFor(
      () => hub.snapshot().chats.find((item) => item.id === chatId),
      (item) => item?.running === false,
    );

    expect(chat?.lastError).toContain("unknown slash command /model");
    expect((hub as any).learnedNativeCommands).toEqual([]);
  });

  test("transport or runtime failures do not evict learned native commands", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-failure-native-slash-"));
    const fake = await writeTurnStartFailureCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "0.136.0",
      available: true,
      fingerprint: "codex|0.136.0|team-a",
    });
    (hub as any).learnedNativeCommands = [
      {
        runtimeId: "codex",
        cliFingerprint: "codex|0.136.0|team-a",
        commandStem: "/model",
        example: "/model gpt-5.5",
        successCount: 3,
        lastUsedAt: 1710000000000,
      },
    ];

    await hub.sendPrompt("/model gpt-5.5", chatId);

    const chat = await waitFor(
      () => hub.snapshot().chats.find((item) => item.id === chatId),
      (item) => item?.running === false,
    );

    expect(chat?.lastError).toContain("turn failed");
    expect((hub as any).learnedNativeCommands).toEqual([
      expect.objectContaining({
        runtimeId: "codex",
        cliFingerprint: "codex|0.136.0|team-a",
        commandStem: "/model",
        example: "/model gpt-5.5",
      }),
    ]);
  });

  test("reads Codex status through app-server RPC without starting an agent conversation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-status-"));
    const fake = await writeCodexAppServerFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("/app status", chatId);
    hub.setChatAgent(chatId, "claude-agent");

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.configuredAgentId).toBe("claude-agent");
    expect(activeChat?.running).toBe(false);
    expect(activeChat?.lastError).toBeUndefined();
    expect(activeChat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "/app status", local: true }),
      expect.objectContaining({
        role: "assistant",
        local: true,
        content: expect.stringContaining("Codex app-server status"),
      }),
    ]);
    expect(activeChat?.messages.at(-1)?.content).toContain("Model: gpt-5.5");
    expect(activeChat?.messages.at(-1)?.content).toContain("Provider: openai");
    expect(activeChat?.messages.at(-1)?.content).toContain("Approval: never");
    expect(activeChat?.messages.at(-1)?.content).toContain("Sandbox: danger-full-access");
    expect(activeChat?.messages.at(-1)?.content).toContain("Plugins: 3 total, 1 enabled, 2 installed");
    expect(activeChat?.messages.at(-1)?.content).toContain("MCP servers: 1");

    const calls = (await readFile(fake.callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { method: string });
    expect(calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(["initialize", "config/read", "model/list", "plugin/list", "mcpServerStatus/list"]),
    );
    expect(calls.map((call) => call.method)).not.toContain("turn/start");
  });

  test("lists the full Codex plugin catalog through app-server RPC", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-plugin-list-"));
    const fake = await writeCodexAppServerFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("/app plugins", chatId);

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.running).toBe(false);
    expect(activeChat?.messages.at(-1)).toMatchObject({
      role: "assistant",
      local: true,
      content: expect.stringContaining("documents@openai-primary-runtime"),
    });
    expect(activeChat?.messages.at(-1)?.content).toContain("spreadsheets@openai-primary-runtime");
    expect(activeChat?.messages.at(-1)?.content).toContain("github@openai-curated");
    expect(activeChat?.messages.at(-1)?.content).toContain("3 total");
    const calls = (await readFile(fake.callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { method: string });
    expect(calls.map((call) => call.method)).toContain("plugin/list");
  });

  test("loads Codex plugin catalog for channel configuration without starting a conversation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-plugin-catalog-"));
    const fake = await writeCodexAppServerFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });

    const catalog = await hub.listCodexPluginCatalog();

    expect(catalog).toEqual([
      {
        id: "documents@openai-primary-runtime",
        name: "documents",
        marketplace: "openai-primary-runtime",
        installed: true,
        enabled: true,
        version: "1.0.0",
      },
      {
        id: "spreadsheets@openai-primary-runtime",
        name: "spreadsheets",
        marketplace: "openai-primary-runtime",
        installed: true,
        enabled: false,
        version: "1.0.0",
      },
      {
        id: "github@openai-curated",
        name: "github",
        marketplace: "openai-curated",
        installed: false,
        enabled: false,
      },
    ]);

    const calls = (await readFile(fake.callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { method: string });
    expect(calls.map((call) => call.method)).toEqual(expect.arrayContaining(["initialize", "plugin/list"]));
    expect(calls.map((call) => call.method)).not.toContain("turn/start");
  });

  test("refuses to load the Codex plugin catalog when the Codex runtime is unavailable", async () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    (hub as unknown as { runtimes: Map<string, unknown> }).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "missing-codex-for-test",
      version: null,
      available: false,
      error: "spawn missing-codex-for-test ENOENT",
    });

    await expect(hub.listCodexPluginCatalog()).rejects.toThrow("Codex CLI unavailable: spawn missing-codex-for-test ENOENT");
  });

  test("lists Codex models through app-server RPC", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-model-list-"));
    const fake = await writeCodexAppServerFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("/app models", chatId);

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.messages.at(-1)).toMatchObject({
      role: "assistant",
      local: true,
      content: expect.stringContaining("GPT-6 Preview"),
    });
    const calls = (await readFile(fake.callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { method: string });
    expect(calls.map((call) => call.method)).toContain("model/list");
  });

  test("asks a workflow agent through Codex without creating a visible chat or task", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-workflow-agent-"));
    const fake = await writeSequentialCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "test",
      available: true,
    });
    const before = hub.snapshot();

    const events: any[] = [];
    const response = await (hub as any).askWorkflowAgent({
      requestId: "workflow-test",
      prompt: "You are a Loop Engineering Agent. Ask one question.",
      configuredAgentId: "default-agent",
      workDir: dir,
    }, (event: any) => events.push(event));

    expect(response).toEqual({ content: "artifact-1", sessionId: "thread-1" });
    expect(events).toEqual([
      { requestId: "workflow-test", type: "delta", content: "artifact-1" },
      { requestId: "workflow-test", type: "completed", content: "artifact-1", sessionId: "thread-1" },
    ]);
    const after = hub.snapshot();
    expect(after.chats).toHaveLength(before.chats.length);
    expect(after.tasks).toHaveLength(0);

    const calls = (await readFile(fake.callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as any);
    expect(calls.some((call) => call.method === "turn/start" && call.params.input[0].text.includes("Loop Engineering Agent"))).toBe(true);
    expect(calls.some((call) => call.method === "thread/start" && call.params.developerInstructions.includes("Final User Report"))).toBe(true);
  });

  test("keeps workflow draft replies in main-owned snapshot state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-workflow-draft-reply-"));
    const fake = await writeSequentialCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "test",
      available: true,
    });
    const before = hub.snapshot();
    const created = hub.createWorkflowDraft({ configuredAgentId: "default-agent" });
    const workflowId = created.workflowDraft?.workflowId;
    expect(workflowId).toBeTruthy();

    const first = await hub.sendWorkflowDraftReply({
      workflowId: workflowId!,
      reply: "Ask one question about the repo layout.",
    });
    expect(first.workflowDraft).toMatchObject({
      workflowId,
      objective: "Ask one question about the repo layout.",
      agentSessionId: "thread-1",
      messages: [
        { role: "user", content: "Ask one question about the repo layout." },
        { role: "assistant", content: "artifact-1" },
      ],
    });

    const second = await hub.sendWorkflowDraftReply({
      workflowId: workflowId!,
      reply: "Use that answer and propose the next step.",
    });
    expect(second.workflowDraft).toMatchObject({
      workflowId,
      objective: "Ask one question about the repo layout.",
      agentSessionId: "thread-1",
      messages: [
        { role: "user", content: "Ask one question about the repo layout." },
        { role: "assistant", content: "artifact-1" },
        { role: "user", content: "Use that answer and propose the next step." },
        { role: "assistant", content: "artifact-2" },
      ],
    });
    expect(second.chats).toHaveLength(before.chats.length);
    expect(second.tasks).toHaveLength(before.tasks.length);

    const calls = (await readFile(fake.callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as any);
    expect(calls.some((call) => call.method === "thread/start")).toBe(true);
    expect(calls.some((call) => call.method === "thread/resume" && call.params.threadId === "thread-1")).toBe(true);
  });

  test("uses the workflow-selected model for workflow agent API requests", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-workflow-model-"));
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    await hub.loadModelChannels(path.join(dir, "model-channels.json"));
    await hub.saveModelChannels([
      {
        id: "deepseek-api",
        agentId: "api",
        label: "DeepSeek API",
        baseUrl: "https://api.deepseek.test/v1",
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
          { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
        ],
      },
    ]);
    hub.updateConfiguredAgents([
      configuredAgent("api-agent", {
        runtimeAgentId: "api",
        channelId: "deepseek-api",
        modelId: "deepseek-v4-flash",
      }),
    ]);
    (hub as any).runtimes.set("api", {
      id: "api",
      label: "API",
      command: "api",
      version: "test",
      available: true,
    });
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: "workflow-ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    await (hub as any).askWorkflowAgent({
      prompt: "Use workflow selected model.",
      configuredAgentId: "api-agent",
      modelId: "deepseek-v4-pro",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      model: "deepseek-v4-pro",
    });
    vi.unstubAllGlobals();
  });

  test("persists and restores app-owned chat history", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-"));
    const storagePath = path.join(dir, "app-chats.json");
    const hub = new AgentHub();

    await hub.loadPersistedState(storagePath);
    hub.setWorkDir("/tmp/project");
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);
    const chat = hub.createChat("claude-agent");
    const chatState = (hub as any).chats.get(chat.id);
    (hub as any).handleAgentEvent(chatState, { type: "meta", content: "→ shell_command\npwd" });
    (hub as any).handleAgentEvent(chatState, { type: "delta", content: "Saved response" });
    (hub as any).handleAgentEvent(chatState, { type: "completed" });
    await hub.flushPersistence();

    const persisted = JSON.parse(await readFile(storagePath, "utf8")) as any;
    expect(persisted.version).toBe(3);
    expect(persisted.sessions).toEqual([expect.objectContaining({ id: expect.any(String) }), expect.objectContaining({ id: chat.id })]);
    expect(persisted.messages).toEqual(expect.arrayContaining([expect.objectContaining({ chatId: chat.id, role: "assistant" })]));
    expect(persisted.events).toEqual(expect.arrayContaining([expect.objectContaining({ chatId: chat.id, type: "meta", content: "→ shell_command\npwd" })]));

    const restored = new AgentHub();
    await restored.loadPersistedState(storagePath);
    const snapshot = restored.snapshot();
    const restoredChat = snapshot.chats.find((item) => item.id === chat.id);

    expect(snapshot.workDir).toBe("/tmp/project");
    expect(snapshot.activeChatId).toBe(chat.id);
    expect(restoredChat?.configuredAgentId).toBe("claude-agent");
    expect(restoredChat?.running).toBe(false);
    expect(restoredChat?.messages).toEqual([
      expect.objectContaining({
        role: "assistant",
        content: "Saved response",
        events: [expect.objectContaining({ type: "meta", content: "→ shell_command\npwd" })],
      }),
    ]);
  });

  test("persists runtime command configs across an AgentHub restart", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-configs-"));
    const storagePath = path.join(dir, "app-chats.json");
    const persistedConfigs = [
      { runtimeId: "claude", override: { executable: "/custom/bin/claude", fixedArgs: ["--dangerously-skip-permissions"] } },
      { runtimeId: "codex", override: { executable: "/custom/bin/codex", fixedArgs: ["--profile", "team-a"] } },
    ];
    const hub = new AgentHub({ codex: "bootstrap-codex", claude: "bootstrap-claude" });

    await hub.loadPersistedState(storagePath);
    (hub as any).runtimeCommandConfigs = persistedConfigs;
    await hub.flushPersistence();

    const restored = new AgentHub({ codex: "bootstrap-codex", claude: "bootstrap-claude" });
    await restored.loadPersistedState(storagePath);

    expect(restored.snapshot().runtimeCommandConfigs).toEqual(persistedConfigs);
  });

  test("ignores a corrupt runtime-command sidecar during persisted-state load", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-corrupt-runtime-sidecar-"));
    const storagePath = path.join(dir, "app-chats.json");
    await writeFile(
      storagePath,
      JSON.stringify({
        version: 3,
        activeChatId: "chat-1",
        workDir: dir,
        sessions: [
          {
            id: "chat-1",
            title: "Recovered chat",
            configuredAgentId: "default-agent",
            modelId: DEFAULT_MODEL_ID,
            sessionId: undefined,
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        ],
        messages: [],
        events: [],
        tasks: [],
        taskMessages: [],
        taskEvents: [],
        teams: [],
        teamRuns: [],
        runtimeCommandConfigs: [],
      }),
      "utf8",
    );
    await writeFile(runtimeCommandStatePathFor(storagePath), "{", "utf8");

    const restored = new AgentHub({ codex: "bootstrap-codex", claude: "bootstrap-claude" });
    await expect(restored.loadPersistedState(storagePath)).resolves.toBeUndefined();

    const snapshot = restored.snapshot();
    expect(snapshot.activeChatId).toBe("chat-1");
    expect(snapshot.chats.find((item) => item.id === "chat-1")?.title).toBe("Recovered chat");
  });

  test("migrates a legacy chat sessionId into detached runtime resume state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-session-migration-"));
    const storagePath = path.join(dir, "app-chats.json");
    await writeFile(
      storagePath,
      JSON.stringify({
        version: 2,
        activeChatId: "chat-1",
        workDir: dir,
        sessions: [
          {
            id: "chat-1",
            title: "Legacy chat",
            configuredAgentId: "default-agent",
            modelId: DEFAULT_MODEL_ID,
            sessionId: "thread-1",
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        ],
        messages: [],
        events: [],
        tasks: [],
        taskMessages: [],
        taskEvents: [],
        teams: [],
        teamRuns: [],
      }),
      "utf8",
    );

    const hub = new AgentHub();
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

  test("restores interactive chats as detached and clears ephemeral turn state", () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    addConfiguredAgents(hub, [configuredAgent("claude-agent", { runtimeAgentId: "claude", name: "Claude Agent" })]);

    const restored = (hub as any).restoreChatState({
      id: "chat-restore-1",
      title: "Claude restore",
      configuredAgentId: "claude-agent",
      modelId: DEFAULT_MODEL_ID,
      sessionId: "session-1",
      runtimeSession: {
        executionStyle: "interactive",
        attachmentState: "running",
        attachmentGeneration: 12,
        activeTurnId: "turn-9",
        resumeState: {
          runtimeId: "claude",
          native: { sessionId: "session-1" },
        },
      },
      messages: [],
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    });

    expect(restored.runtimeSession).toMatchObject({
      executionStyle: "interactive",
      attachmentState: "detached",
      attachmentGeneration: 0,
      resumeState: {
        runtimeId: "claude",
        native: { sessionId: "session-1" },
      },
    });
    expect(restored.runtimeSession?.activeTurnId).toBeUndefined();
  });

  test("falls back to legacy session migration when persisted runtimeSession is malformed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-session-fallback-"));
    const storagePath = path.join(dir, "app-chats.json");
    await writeFile(
      storagePath,
      JSON.stringify({
        version: 3,
        activeChatId: "chat-1",
        workDir: dir,
        sessions: [
          {
            id: "chat-1",
            title: "Broken runtime session",
            configuredAgentId: "default-agent",
            modelId: DEFAULT_MODEL_ID,
            sessionId: "thread-legacy-1",
            runtimeSession: {
              executionStyle: "interactive",
            },
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        ],
        messages: [],
        events: [],
        tasks: [],
        taskMessages: [],
        taskEvents: [],
        teams: [],
        teamRuns: [],
      }),
      "utf8",
    );

    const hub = new AgentHub();
    await hub.loadPersistedState(storagePath);

    const chat = hub.snapshot().chats.find((item) => item.id === "chat-1");
    expect(chat?.runtimeSession).toMatchObject({
      executionStyle: "interactive",
      attachmentState: "detached",
      attachmentGeneration: 0,
      resumeState: {
        runtimeId: "codex",
        native: { threadId: "thread-legacy-1" },
      },
    });
  });

  test("persists runtimeSession as V3 and restores durable fields while clearing ephemeral state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-session-roundtrip-"));
    const storagePath = path.join(dir, "app-chats.json");
    const hub = new AgentHub();
    await hub.loadPersistedState(storagePath);
    const chat = hub.createChat("default-agent");
    const state = (hub as any).chats.get(chat.id);
    state.runtimeSession = {
      executionStyle: "interactive",
      attachmentState: "running",
      attachmentGeneration: 7,
      activeTurnId: "turn-7",
      lastMeaningfulActivityAt: 1710000000500,
      resumeState: {
        runtimeId: "codex",
        native: { threadId: "thread-roundtrip-1", sessionTreeRootId: "tree-root-1" },
        appContext: {
          cwd: dir,
          modelId: DEFAULT_MODEL_ID,
          approvalPolicy: "never",
          sandboxPolicy: { mode: "workspace-write" },
        },
        extensions: { source: "test" },
      },
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
    };

    await hub.flushPersistence();

    const persisted = JSON.parse(await readFile(storagePath, "utf8")) as any;
    expect(persisted.version).toBe(3);
    expect(persisted.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: chat.id,
          runtimeSession: expect.objectContaining({
            executionStyle: "interactive",
            attachmentState: "running",
            attachmentGeneration: 7,
            activeTurnId: "turn-7",
            resumeState: expect.objectContaining({
              runtimeId: "codex",
              native: expect.objectContaining({ threadId: "thread-roundtrip-1" }),
            }),
          }),
        }),
      ]),
    );

    const restored = new AgentHub();
    await restored.loadPersistedState(storagePath);
    const restoredChat = restored.snapshot().chats.find((item) => item.id === chat.id);
    expect(restoredChat?.runtimeSession).toMatchObject({
      executionStyle: "interactive",
      attachmentState: "detached",
      attachmentGeneration: 0,
      lastMeaningfulActivityAt: 1710000000500,
      resumeState: {
        runtimeId: "codex",
        native: { threadId: "thread-roundtrip-1", sessionTreeRootId: "tree-root-1" },
        appContext: {
          cwd: dir,
          modelId: DEFAULT_MODEL_ID,
          approvalPolicy: "never",
          sandboxPolicy: { mode: "workspace-write" },
        },
        extensions: { source: "test" },
      },
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
    });
    expect(restoredChat?.runtimeSession?.activeTurnId).toBeUndefined();
  });

  test("falls back to legacy sessionId when persisted resumeState is partially malformed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-session-resume-fallback-"));
    const storagePath = path.join(dir, "app-chats.json");
    await writeFile(
      storagePath,
      JSON.stringify({
        version: 3,
        activeChatId: "chat-1",
        workDir: dir,
        sessions: [
          {
            id: "chat-1",
            title: "Broken resume state",
            configuredAgentId: "default-agent",
            modelId: DEFAULT_MODEL_ID,
            sessionId: "thread-legacy-2",
            runtimeSession: {
              executionStyle: "interactive",
              attachmentState: "idle",
              attachmentGeneration: 3,
              resumeState: {
                runtimeId: "codex",
                native: {},
              },
              capabilities: {
                supportsInProcessConversationResume: true,
                supportsResumeAfterDetach: true,
                supportsResumeAfterAppRestart: true,
                supportsTurnResume: false,
                supportsInterrupt: true,
                supportsContinue: true,
                supportsApprovalRequests: false,
                supportsUserInputRequests: false,
              },
            },
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        ],
        messages: [],
        events: [],
        tasks: [],
        taskMessages: [],
        taskEvents: [],
        teams: [],
        teamRuns: [],
      }),
      "utf8",
    );

    const hub = new AgentHub();
    await hub.loadPersistedState(storagePath);

    const chat = hub.snapshot().chats.find((item) => item.id === "chat-1");
    expect(chat?.runtimeSession).toMatchObject({
      executionStyle: "interactive",
      attachmentState: "detached",
      attachmentGeneration: 0,
      resumeState: {
        runtimeId: "codex",
        native: { threadId: "thread-legacy-2" },
      },
      capabilities: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: true,
        supportsResumeAfterAppRestart: true,
        supportsTurnResume: false,
        supportsInterrupt: true,
        supportsContinue: true,
        supportsApprovalRequests: false,
        supportsUserInputRequests: false,
      },
    });
  });

  test("persists execution channel config in app state and restores it ahead of legacy channel file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-channels-"));
    const storagePath = path.join(dir, "app-chats.json");
    const channelPath = path.join(dir, "model-channels.json");
    const persistedChannels: AgentChannel[] = [
      {
        id: "codex-deepseek",
        agentId: "codex",
        label: "Codex DeepSeek",
        providerName: "DeepSeek",
        modelProvider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        wireApi: "responses",
        httpHeaders: { Authorization: "Bearer persisted-key" },
        plugins: [{ id: "github@openai-curated", enabled: true }],
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "deepseek-chat", label: "DeepSeek Chat" },
        ],
      },
    ];

    const hub = new AgentHub();
    await hub.loadModelChannels(channelPath);
    await hub.loadPersistedState(storagePath);
    await hub.saveModelChannels(persistedChannels);
    await hub.flushPersistence();

    const persisted = JSON.parse(await readFile(storagePath, "utf8")) as { channels?: AgentChannel[] };
    expect(persisted.channels).toEqual([
      expect.objectContaining({
        id: "codex-deepseek",
        providerName: "DeepSeek",
        httpHeaders: { Authorization: "Bearer persisted-key" },
        plugins: [{ id: "github@openai-curated", enabled: true }],
      }),
    ]);

    const legacyHub = new AgentHub();
    await legacyHub.loadModelChannels(channelPath);
    await legacyHub.saveModelChannels([
      {
        id: "codex-openai",
        agentId: "codex",
        label: "Codex OpenAI",
        providerName: "OpenAI",
        modelProvider: "openai",
        models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
      },
    ]);

    const restored = new AgentHub();
    await restored.loadModelChannels(channelPath);
    await restored.loadPersistedState(storagePath);
    const snapshot = restored.snapshot();

    expect(snapshot.channels.map((channel) => channel.id)).toEqual(["codex-deepseek"]);
    expect(snapshot.channels[0]).toMatchObject({
      providerName: "DeepSeek",
      httpHeaders: { Authorization: "Bearer persisted-key" },
      plugins: [{ id: "github@openai-curated", enabled: true }],
    });
  });

  test("stores execution channel config in app state without rewriting the legacy channel file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-channel-db-"));
    const dbPath = path.join(dir, "app.db");
    const channelPath = path.join(dir, "model-channels.json");
    const storedChannels: AgentChannel[] = [
      {
        id: "deepseek-api-agent-channel",
        agentId: "api",
        label: "DeepSeek API Agent",
        providerName: "DeepSeek",
        modelProvider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        httpHeaders: { Authorization: "Bearer db-key" },
        models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
      },
    ];

    const hub = new AgentHub({ codex: "missing-codex-for-test" });
    await hub.loadModelChannels(channelPath);
    await hub.loadPersistedState(dbPath);
    await hub.saveModelChannels(storedChannels);
    await hub.flushPersistence();

    await expect(readFile(channelPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const restored = new AgentHub({ codex: "missing-codex-for-test" });
    await restored.loadModelChannels(channelPath);
    await restored.loadPersistedState(dbPath);

    expect(restored.snapshot().channels).toEqual([
      expect.objectContaining({
        id: "deepseek-api-agent-channel",
        providerName: "DeepSeek",
        httpHeaders: { Authorization: "Bearer db-key" },
      }),
    ]);
  });

  test("persists and restores a stored preset id through SQLite-backed app state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-preset-id-db-"));
    const dbPath = path.join(dir, "app.db");
    const channelPath = path.join(dir, "model-channels.json");
    const storedChannels: AgentChannel[] = [
      {
        id: "codex-default-runtime",
        agentId: "codex",
        label: "Codex Default",
        presetId: "codex-default",
        modelProvider: "bridge",
        providerName: "Bridge",
        baseUrl: "https://bridge.example/v1",
        wireApi: "responses",
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "gpt-5.5", label: "gpt-5.5" },
        ],
      },
    ];

    const hub = new AgentHub({ codex: "missing-codex-for-test" });
    await hub.loadModelChannels(channelPath);
    await hub.loadPersistedState(dbPath);
    await hub.saveModelChannels(storedChannels);
    await hub.flushPersistence();

    const restored = new AgentHub({ codex: "missing-codex-for-test" });
    await restored.loadModelChannels(channelPath);
    await restored.loadPersistedState(dbPath);

    expect(restored.snapshot().channels).toEqual([
      expect.objectContaining({
        id: "codex-default-runtime",
        presetId: "codex-default",
        modelProvider: "bridge",
        providerName: "Bridge",
      }),
    ]);
  });

  test("compacts generated execution channel records when restoring app state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-generated-channels-"));
    const storagePath = path.join(dir, "app-chats.json");
    const realChannel: AgentChannel = {
      id: "codex-deepseek",
      agentId: "codex",
      label: "Codex DeepSeek",
      providerName: "DeepSeek",
      modelProvider: "deepseek",
      models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
    };

    await writeFile(
      storagePath,
      JSON.stringify({
        version: 2,
        channels: [
          realChannel,
          {
            ...realChannel,
            id: "repo-reviewer-channel",
            label: "Repo Reviewer Runtime",
          },
          {
            ...realChannel,
            id: "codex-multi-agent-repo-reviewer-default",
            label: "Codex multi-agent-repo-reviewer-default",
          },
        ],
        sessions: [],
        messages: [],
        events: [],
        tasks: [],
        taskMessages: [],
        taskEvents: [],
        teams: [],
        teamRuns: [],
      }),
      "utf8",
    );

    const restored = new AgentHub();
    await restored.loadPersistedState(storagePath);

    expect(restored.snapshot().channels.map((channel) => channel.id)).toEqual(["codex-deepseek"]);
  });

  test("migrates legacy JSON history into SQLite storage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-sqlite-"));
    const legacyPath = path.join(dir, "app-chats.json");
    const dbPath = path.join(dir, "app.db");
    const legacyHub = new AgentHub();

    await legacyHub.loadPersistedState(legacyPath);
    legacyHub.setWorkDir("/tmp/legacy-project");
    const chat = legacyHub.createChat("default-agent");
    await legacyHub.flushPersistence();

    const migrated = new AgentHub();
    await migrated.loadPersistedState(dbPath, legacyPath);
    expect(migrated.snapshot().chats.some((item) => item.id === chat.id)).toBe(true);
    migrated.setWorkDir("/tmp/sqlite-project");
    await migrated.flushPersistence();
    expect((await readFile(dbPath)).byteLength).toBeGreaterThan(0);

    const restored = new AgentHub();
    await restored.loadPersistedState(dbPath);
    const snapshot = restored.snapshot();
    expect(snapshot.workDir).toBe("/tmp/sqlite-project");
    expect(snapshot.chats.some((item) => item.id === chat.id)).toBe(true);
  });

  test("registers an artifact for a validated file and rejects a missing one", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-artifacts-"));
    await writeFile(path.join(dir, "report.md"), "# Report\nDone.", "utf8");
    const hub = new AgentHub({ codex: "codex-for-test", claude: "missing-claude-for-test" });
    hub.setWorkDir(dir);

    const ok = await (hub as any).registerArtifact({ target: "chat-1", path: "report.md", description: "final report" });
    expect(ok).toMatchObject({ ok: true });
    expect(ok.artifact).toMatchObject({ target: "chat-1", kind: "file", title: "report.md", description: "final report" });
    expect(ok.artifact.path).toBe(path.join(dir, "report.md"));

    const snapshot = hub.snapshot() as any;
    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.artifacts[0]).toMatchObject({ target: "chat-1", title: "report.md" });

    const missing = await (hub as any).registerArtifact({ target: "chat-1", path: "does-not-exist.md" });
    expect(missing.ok).toBe(false);
    expect((hub.snapshot() as any).artifacts).toHaveLength(1);

    const url = await (hub as any).registerArtifact({ target: "chat-1", url: "https://example.com/x", title: "Spec" });
    expect(url).toMatchObject({ ok: true, artifact: { kind: "url", url: "https://example.com/x", title: "Spec" } });
  });

  test("persists and restores multiple workflow drafts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-"));
    const storagePath = path.join(dir, "app-chats.json");
    const hub = new AgentHub();

    await hub.loadPersistedState(storagePath);
    const first = (hub as any).createWorkflow({
      configuredAgentId: "default-agent",
      title: "sample repo review",
      objective: "Review sample repo",
      graphReady: true,
      graph: {
        title: "sample repo review",
        objective: "Review sample repo",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map repo."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->inventory", fromNodeId: "start", toNodeId: "inventory" },
          { id: "inventory->end", fromNodeId: "inventory", toNodeId: "end" },
        ],
      },
      messages: [
        { id: "m-1", role: "user", content: "Review sample repo" },
        { id: "m-2", role: "assistant", content: "Workflow graph ready: sample repo review" },
      ],
      reply: "looks good",
      error: undefined,
      runProgress: [{ nodeId: "inventory", title: "Inventory", status: "completed", detail: "Output captured", taskId: "task-1" }],
      runContextDocument: "# Workflow Context\n\n## Inventory (inventory)\nMapped repo.",
      contextDocument: "# Workflow Context\n\nLong lived context.",
      agentSessionId: "thread-1",
      createdAt: 1710000000000,
      updatedAt: 1710002000000,
    });
    const second = (hub as any).createWorkflow({
      title: "release workflow",
      objective: "Prepare release",
      createdAt: 1710001000000,
      updatedAt: 1710001000000,
      graph: {
        title: "release workflow",
        objective: "Prepare release",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "plan", kind: "agent", title: "Plan", prompt: "Plan release."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->plan", fromNodeId: "start", toNodeId: "plan" },
          { id: "plan->end", fromNodeId: "plan", toNodeId: "end" },
        ],
      },
    });
    (hub as any).selectWorkflow(first.workflowId);
    (hub as any).appendWorkflowContext({
      workflowId: first.workflowId,
      report: "Added architecture note.",
      handoff: "Use this note later.",
      artifacts: [{ kind: "text", title: "Note", content: "Architecture note." }],
    });
    await hub.flushPersistence();

    const persisted = JSON.parse(await readFile(storagePath, "utf8")) as any;
    expect(persisted.workflowStore.activeWorkflowId).toBe(first.workflowId);
    expect(persisted.workflowStore.workflows).toHaveLength(2);
    expect(persisted.workflowStore.workflows.map((workflow: any) => workflow.workflowId)).toEqual([second.workflowId, first.workflowId]);
    expect(persisted.workflowStore.workflows[1]).toMatchObject({
      title: "sample repo review",
      objective: "Review sample repo",
      revision: 2,
      graphReady: true,
      contextDocument: expect.stringContaining("Added architecture note."),
      runProgress: [{ nodeId: "inventory", status: "completed" }],
    });

    const restored = new AgentHub();
    await restored.loadPersistedState(storagePath);
    const snapshot = restored.snapshot() as any;

    expect(snapshot.workflowStore.activeWorkflowId).toBe(first.workflowId);
    expect(snapshot.workflowStore.workflows).toHaveLength(2);
    expect(snapshot.workflowStore.workflows.map((workflow: any) => workflow.workflowId)).toEqual([second.workflowId, first.workflowId]);
    expect(snapshot.workflowStore.workflows[1]).toMatchObject({
      workflowId: first.workflowId,
      title: "sample repo review",
      objective: "Review sample repo",
      revision: 2,
      status: "draft",
      graphReady: true,
      graph: { title: "sample repo review" },
      messages: [{ id: "m-1", role: "user" }, { id: "m-2", role: "assistant" }],
      runProgress: [{ nodeId: "inventory", status: "completed", detail: "Output captured" }],
      runContextDocument: "# Workflow Context\n\n## Inventory (inventory)\nMapped repo.",
      contextDocument: expect.stringContaining("Architecture note."),
    });
  });

  test("renames a workflow draft without changing its graph", () => {
    const hub = new AgentHub();
    const created = (hub as any).createWorkflow({
      title: "Original workflow",
      objective: "Review sample repo",
      graph: {
        title: "Original workflow",
        objective: "Review sample repo",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map repo."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->inventory", fromNodeId: "start", toNodeId: "inventory" },
          { id: "inventory->end", fromNodeId: "inventory", toNodeId: "end" },
        ],
      },
    });

    const snapshot = (hub as any).renameWorkflow(created.workflowId, "  Renamed workflow  ");
    const workflow = snapshot.workflowStore.workflows.find((item: any) => item.workflowId === created.workflowId);

    expect(workflow).toMatchObject({
      title: "Renamed workflow",
      objective: "Review sample repo",
      revision: 2,
      graph: { title: "Original workflow", objective: "Review sample repo" },
    });
    expect(snapshot.workflowDraft.title).toBe("Renamed workflow");
  });

  test("preserves explicit node positions through create and update", () => {
    const hub = new AgentHub();
    const created = (hub as any).createWorkflow({
      title: "Positioned workflow",
      objective: "Pin nodes",
      graph: {
        title: "Positioned workflow",
        objective: "Pin nodes",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "", position: { x: 12, y: 34 } },
          { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map repo."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->inventory", fromNodeId: "start", toNodeId: "inventory" },
          { id: "inventory->end", fromNodeId: "inventory", toNodeId: "end" },
        ],
      },
    });

    const graphOf = (workflowId: string) =>
      (hub as any).snapshot().workflowStore.workflows.find((item: any) => item.workflowId === workflowId).graph;
    const createdNodes = new Map<string, any>(graphOf(created.workflowId).nodes.map((node: any) => [node.id, node]));
    expect(createdNodes.get("start").position).toEqual({ x: 12, y: 34 });
    expect(createdNodes.get("inventory").position).toBeUndefined();

    (hub as any).updateWorkflow({
      workflowId: created.workflowId,
      graph: {
        ...graphOf(created.workflowId),
        nodes: graphOf(created.workflowId).nodes.map((node: any) =>
          node.id === "inventory" ? { ...node, position: { x: 200, y: 80 } } : node,
        ),
      },
    });
    const updatedNodes = new Map<string, any>(graphOf(created.workflowId).nodes.map((node: any) => [node.id, node]));
    expect(updatedNodes.get("inventory").position).toEqual({ x: 200, y: 80 });
    expect(updatedNodes.get("start").position).toEqual({ x: 12, y: 34 });
  });

  test("deletes a workflow draft with its runs and selects the next remaining workflow", () => {
    const hub = new AgentHub();
    const first = (hub as any).createWorkflow({
      title: "First workflow",
      objective: "Review sample repo",
      graph: {
        title: "First workflow",
        objective: "Review sample repo",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map repo."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->inventory", fromNodeId: "start", toNodeId: "inventory" },
          { id: "inventory->end", fromNodeId: "inventory", toNodeId: "end" },
        ],
      },
    });
    const run = (hub as any).startWorkflowRun({ workflowId: first.workflowId, contextDocument: "# Run context" });
    const second = (hub as any).createWorkflow({
      title: "Second workflow",
      objective: "Prepare release",
      graph: {
        title: "Second workflow",
        objective: "Prepare release",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "plan", kind: "agent", title: "Plan", prompt: "Plan release."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->plan", fromNodeId: "start", toNodeId: "plan" },
          { id: "plan->end", fromNodeId: "plan", toNodeId: "end" },
        ],
      },
    });
    (hub as any).selectWorkflow(first.workflowId);

    const snapshot = (hub as any).deleteWorkflow(first.workflowId);

    expect(snapshot.workflowStore.workflows.map((workflow: any) => workflow.workflowId)).toEqual([second.workflowId]);
    expect(snapshot.workflowStore.runs.some((item: any) => item.runId === run.runId || item.workflowId === first.workflowId)).toBe(false);
    expect(snapshot.workflowStore.activeWorkflowId).toBe(second.workflowId);
    expect(snapshot.workflowDraft.workflowId).toBe(second.workflowId);
  });

  test("resets one workflow draft session without dropping other drafts", () => {
    const hub = new AgentHub();
    const first = hub.createWorkflowDraft({ title: "First draft" }).workflowDraft!;
    const patched = hub.patchWorkflowDraft({
      workflowId: first.workflowId,
      messages: [
        { id: "m-1", role: "user", content: "Initial objective" },
        { id: "m-2", role: "assistant", content: "Initial reply" },
      ],
      agentSessionId: "thread-1",
      contextDocument: "# Durable context",
      runContextDocument: "# Run context",
    }).workflowDraft!;
    const started = hub.startWorkflowRun({
      workflowId: patched.workflowId,
      contextDocument: "# Run context",
    });
    hub.finishWorkflowRun({
      workflowId: patched.workflowId,
      runId: started.runId!,
      status: "completed",
      progress: [{ nodeId: "plan", title: "Plan", status: "completed" }],
      finalReport: "## Final User Report\nDone.",
    });
    const second = hub.createWorkflowDraft({ title: "Second draft" }).workflowDraft!;

    const reset = hub.resetWorkflowDraftSession(first.workflowId);
    const resetFirst = reset.workflowStore.workflows.find((workflow) => workflow.workflowId === first.workflowId);
    const preservedSecond = reset.workflowStore.workflows.find((workflow) => workflow.workflowId === second.workflowId);

    expect(reset.workflowStore.workflows).toHaveLength(2);
    expect(reset.workflowStore.activeWorkflowId).toBe(first.workflowId);
    expect(reset.workflowDraft?.workflowId).toBe(first.workflowId);
    expect(resetFirst).toMatchObject({
      workflowId: first.workflowId,
      title: "Untitled workflow",
      status: "draft",
      objective: "",
      graphReady: false,
      messages: [],
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      agentSessionId: undefined,
    });
    expect(resetFirst?.finalReport).toBeUndefined();
    expect(preservedSecond).toMatchObject({
      workflowId: second.workflowId,
      title: "Second draft",
      status: "draft",
    });
  });

  test("rejects invalid workflow creation with validation reasons", () => {
    const hub = new AgentHub();

    const result = (hub as any).createWorkflow({
      title: "Broken",
      objective: "Broken",
      graph: {
        title: "Broken",
        objective: "Broken",
        nodes: [{ id: "agent-a", kind: "agent", title: "Agent A", prompt: "Work" }],
        edges: [],
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Workflow graph must have exactly one start node.",
      validation: {
        valid: false,
        errors: ["Workflow graph must have exactly one start node."],
      },
    });
    expect((hub.snapshot() as any).workflowStore.workflows).toHaveLength(0);
  });

  test("rejects workflow graphs that exceed node limits", () => {
    const hub = new AgentHub();
    const nodes = [
      { id: "start", kind: "start", title: "Start", prompt: "" },
      ...Array.from({ length: 49 }, (_value, index) => ({
        id: `agent_${index}`,
        kind: "agent",
        title: `Agent ${index}`,
        prompt: "Work.",
      })),
      { id: "end", kind: "end", title: "Done", prompt: "" },
    ];
    const edges = nodes.slice(0, -1).map((node, index) => ({
      id: `${node.id}->${nodes[index + 1]!.id}`,
      fromNodeId: node.id,
      toNodeId: nodes[index + 1]!.id,
    }));

    const result = (hub as any).createWorkflow({
      title: "Too large",
      objective: "Too large",
      graph: { title: "Too large", objective: "Too large", nodes, edges },
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Workflow graph exceeds 50 nodes.",
    });
    expect((hub.snapshot() as any).workflowStore.workflows).toHaveLength(0);
  });

  test("tracks workflow runs separately from editable workflow drafts", () => {
    const hub = new AgentHub();
    const created = (hub as any).createWorkflow({
      title: "Run tracked workflow",
      objective: "Run tracked workflow",
      graph: {
        title: "Run tracked workflow",
        objective: "Run tracked workflow",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "work", kind: "agent", title: "Work", prompt: "Work."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->work", fromNodeId: "start", toNodeId: "work" },
          { id: "work->end", fromNodeId: "work", toNodeId: "end" },
        ],
      },
    });

    const started = (hub as any).startWorkflowRun({
      workflowId: created.workflowId,
      contextDocument: "# Workflow Context\nLong lived.",
    });
    expect(started).toMatchObject({ ok: true, workflowId: created.workflowId });
    expect(started.runId).toMatch(/^run_/);

    (hub as any).appendWorkflowRunContext({
      workflowId: created.workflowId,
      runId: started.runId,
      nodeId: "work",
      report: "Finished the work.",
      handoff: "Ready for review.",
    });
    (hub as any).finishWorkflowRun({
      workflowId: created.workflowId,
      runId: started.runId,
      status: "completed",
      progress: [{ nodeId: "work", title: "Work", status: "completed" }],
      finalReport: "## Final User Report\nThe workflow completed successfully.",
    });

    const snapshot = hub.snapshot() as any;
    expect(snapshot.workflowStore.workflows[0]).toMatchObject({
      workflowId: created.workflowId,
      status: "completed",
      runIds: [started.runId],
      revision: 1,
      finalReport: "## Final User Report\nThe workflow completed successfully.",
    });
    expect(snapshot.workflowStore.runs[0]).toMatchObject({
      runId: started.runId,
      workflowId: created.workflowId,
      status: "completed",
      contextDocument: expect.stringContaining("Finished the work."),
      progress: [{ nodeId: "work", status: "completed" }],
      finalReport: "## Final User Report\nThe workflow completed successfully.",
    });
  });

  test("runs a workflow graph from the main process runtime", async () => {
    const contexts: AgentExecutionContext[] = [];
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      {
        create: (context) => {
          contexts.push(context);
          return {
            start: async () => {
              const content = context.prompt.includes("workflow judge")
                ? 'workflowEvaluation.submit({ complete: true, reason: "good enough", retryPrompt: "" })'
                : context.prompt.includes("main workflow agent")
                  ? "## Final User Report\nWorkflow completed from main runtime."
                  : "### Work Completion Report\nWorker finished.\n\n### Handoff\nReady for downstream work.";
              context.emit({ type: "completed", content });
            },
            stop: async () => undefined,
          };
        },
      },
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex-for-test",
      version: "test",
      available: true,
    });
    const created = (hub as any).createWorkflow({
      title: "Runtime workflow",
      objective: "Run from main",
      graph: {
        title: "Runtime workflow",
        objective: "Run from main",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "work", kind: "agent", title: "Work", prompt: "Do the work." },
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->work", fromNodeId: "start", toNodeId: "work" },
          { id: "work->end", fromNodeId: "work", toNodeId: "end" },
        ],
      },
    });

    expect(typeof (hub as any).runWorkflowGraph).toBe("function");
    const started = await (hub as any).runWorkflowGraph({
      workflowId: created.workflowId,
      contextDocument: "# Initial context",
    });

    expect(started).toMatchObject({ ok: true, workflowId: created.workflowId });
    const snapshot = await waitFor(
      () => hub.snapshot() as any,
      (value) => value.workflowStore.runs.some((run: any) => run.workflowId === created.workflowId && run.status === "completed"),
    );
    const run = snapshot.workflowStore.runs.find((item: any) => item.workflowId === created.workflowId);
    expect(run).toMatchObject({
      status: "completed",
      progress: [
        expect.objectContaining({ nodeId: "work", status: "completed" }),
        expect.objectContaining({ nodeId: "__final_review__", status: "completed" }),
      ],
      contextDocument: expect.stringContaining("Worker finished."),
      finalReport: "## Final User Report\nWorkflow completed from main runtime.",
    });
    expect(snapshot.workflowStore.workflows.find((item: any) => item.workflowId === created.workflowId)).toMatchObject({
      status: "completed",
      finalReport: "## Final User Report\nWorkflow completed from main runtime.",
    });
    expect(contexts.map((context) => context.runKind)).toEqual(["task", "task", "task"]);

    const eventTypesForWork = run.events.filter((event: any) => event.nodeId === "work").map((event: any) => event.type);
    expect(eventTypesForWork).toEqual(["node_started", "node_output", "node_judged", "node_completed"]);
    expect(run.events.some((event: any) => event.nodeId === "__final_review__" && event.type === "node_completed")).toBe(true);
    const projected = projectNodeStates(
      run.events,
      [{ nodeId: "work", title: "Work" }],
      [{ nodeId: "__final_review__", title: "Main agent review" }],
    );
    expect(projected.map((item) => ({ nodeId: item.nodeId, status: item.status }))).toEqual(
      run.progress.map((item: any) => ({ nodeId: item.nodeId, status: item.status })),
    );
  });

  test("pauses a running workflow node without evaluating it or starting downstream nodes", async () => {
    const contexts: AgentExecutionContext[] = [];
    let stopCount = 0;
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      {
        create: (context) => {
          contexts.push(context);
          return {
            start: async () => new Promise<void>(() => undefined),
            stop: async () => {
              stopCount += 1;
            },
          };
        },
      },
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex-for-test",
      version: "test",
      available: true,
    });
    const created = (hub as any).createWorkflow({
      title: "Pausable workflow",
      objective: "Pause one node",
      graph: {
        title: "Pausable workflow",
        objective: "Pause one node",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "work", kind: "agent", title: "Work", prompt: "Do the work." },
          { id: "followup", kind: "agent", title: "Follow up", prompt: "Use the work output." },
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->work", fromNodeId: "start", toNodeId: "work" },
          { id: "work->followup", fromNodeId: "work", toNodeId: "followup" },
          { id: "followup->end", fromNodeId: "followup", toNodeId: "end" },
        ],
      },
    });
    const started = (hub as any).runWorkflowGraph({ workflowId: created.workflowId });
    expect(started).toMatchObject({ ok: true });
    await waitFor(
      () => hub.snapshot() as any,
      (value) => value.workflowStore.runs.some((run: any) => run.runId === started.runId && run.progress.some((item: any) => item.nodeId === "work" && item.status === "running" && item.taskId)),
    );

    expect(typeof (hub as any).pauseWorkflowNode).toBe("function");
    const paused = await (hub as any).pauseWorkflowNode({
      workflowId: created.workflowId,
      runId: started.runId,
      nodeId: "work",
    });

    expect(paused).toMatchObject({ ok: true, workflowId: created.workflowId, runId: started.runId });
    const snapshot = hub.snapshot() as any;
    const run = snapshot.workflowStore.runs.find((item: any) => item.runId === started.runId);
    expect(run.progress).toEqual([
      expect.objectContaining({ nodeId: "work", status: "paused" }),
      expect.objectContaining({ nodeId: "followup", status: "queued" }),
    ]);
    // Pausing the only running node leaves nothing in progress, so the run stops.
    expect(run.status).toBe("stopped");
    expect(snapshot.workflowStore.workflows.find((w: any) => w.workflowId === created.workflowId).status).toBe("stopped");
    expect(stopCount).toBe(1);
    expect(contexts).toHaveLength(1);
  });

  test("starts a paused workflow node and continues downstream execution", async () => {
    const contexts: AgentExecutionContext[] = [];
    let stopCount = 0;
    let hangingStarted = false;
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      {
        create: (context) => {
          contexts.push(context);
          const countsAsPauseStop = !hangingStarted && context.prompt.includes("Current node: Work");
          return {
            start: async () => {
              if (!hangingStarted && context.prompt.includes("Current node: Work")) {
                hangingStarted = true;
                return new Promise<void>(() => undefined);
              }
              const content = context.prompt.includes("workflow judge")
                ? 'workflowEvaluation.submit({ complete: true, reason: "approved", retryPrompt: "" })'
                : context.prompt.includes("main workflow agent")
                  ? "## Final User Report\nResumed workflow completed."
                  : context.prompt.includes("Current node: Follow up")
                    ? "### Work Completion Report\nFollow-up finished.\n\n### Handoff\nDone."
                    : "### Work Completion Report\nWork finished after resume.\n\n### Handoff\nReady.";
              context.emit({ type: "completed", content });
            },
            stop: async () => {
              if (countsAsPauseStop) stopCount += 1;
            },
          };
        },
      },
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex-for-test",
      version: "test",
      available: true,
    });
    const created = (hub as any).createWorkflow({
      title: "Resume node workflow",
      objective: "Resume one node",
      graph: {
        title: "Resume node workflow",
        objective: "Resume one node",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "work", kind: "agent", title: "Work", prompt: "Do the work." },
          { id: "followup", kind: "agent", title: "Follow up", prompt: "Use the work output." },
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->work", fromNodeId: "start", toNodeId: "work" },
          { id: "work->followup", fromNodeId: "work", toNodeId: "followup" },
          { id: "followup->end", fromNodeId: "followup", toNodeId: "end" },
        ],
      },
    });
    const started = (hub as any).runWorkflowGraph({ workflowId: created.workflowId });
    await waitFor(
      () => hub.snapshot() as any,
      (value) => value.workflowStore.runs.some((run: any) => run.runId === started.runId && run.progress.some((item: any) => item.nodeId === "work" && item.status === "running" && item.taskId)),
    );
    await (hub as any).pauseWorkflowNode({
      workflowId: created.workflowId,
      runId: started.runId,
      nodeId: "work",
    });

    expect(typeof (hub as any).startWorkflowNode).toBe("function");
    const resumed = await (hub as any).startWorkflowNode({
      workflowId: created.workflowId,
      runId: started.runId,
      nodeId: "work",
    });

    expect(resumed).toMatchObject({ ok: true, workflowId: created.workflowId, runId: started.runId });
    const snapshot = await waitFor(
      () => hub.snapshot() as any,
      (value) => value.workflowStore.runs.some((run: any) => run.runId === started.runId && run.status === "completed"),
    );
    const run = snapshot.workflowStore.runs.find((item: any) => item.runId === started.runId);
    expect(run).toMatchObject({
      status: "completed",
      finalReport: "## Final User Report\nResumed workflow completed.",
    });
    expect(run.progress).toEqual([
      expect.objectContaining({ nodeId: "work", status: "completed" }),
      expect.objectContaining({ nodeId: "followup", status: "completed" }),
      expect.objectContaining({ nodeId: "__final_review__", status: "completed" }),
    ]);
    expect(stopCount).toBe(1);
    expect(contexts.map((context) => (context.prompt.includes("workflow judge") ? "judge" : context.prompt.includes("main workflow agent") ? "final" : context.prompt.includes("Current node: Follow up") ? "followup" : "work"))).toEqual([
      "work",
      "work",
      "judge",
      "followup",
      "judge",
      "final",
    ]);
  });

  test("opens a human gate when a node asks, then resumes with the answer in context", async () => {
    const contexts: AgentExecutionContext[] = [];
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      {
        create: (context) => {
          contexts.push(context);
          return {
            start: async () => {
              const content = context.prompt.includes("workflow judge")
                ? 'workflowEvaluation.submit({ complete: true, reason: "approved", retryPrompt: "" })'
                : context.prompt.includes("main workflow agent")
                  ? "## Final User Report\nGated workflow completed."
                  : context.prompt.includes("Current node: Work") && !context.prompt.includes("Human decision")
                    ? 'I need a human decision.\nworkflowGate.ask("Deploy to prod or staging?")'
                    : "### Work Completion Report\nWork finished after human decision.\n\n### Handoff\nReady.";
              context.emit({ type: "completed", content });
            },
            stop: async () => undefined,
          };
        },
      },
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex-for-test",
      version: "test",
      available: true,
    });
    const created = (hub as any).createWorkflow({
      title: "Gate workflow",
      objective: "Ask a human when needed",
      graph: {
        title: "Gate workflow",
        objective: "Ask a human when needed",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "work", kind: "agent", title: "Work", prompt: "Do the work." },
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->work", fromNodeId: "start", toNodeId: "work" },
          { id: "work->end", fromNodeId: "work", toNodeId: "end" },
        ],
      },
    });
    const started = (hub as any).runWorkflowGraph({ workflowId: created.workflowId });

    const gatedSnapshot = await waitFor(
      () => hub.snapshot() as any,
      (value) =>
        value.workflowStore.runs.some(
          (run: any) => run.runId === started.runId && run.progress.some((item: any) => item.nodeId === "work" && item.status === "awaiting_input"),
        ),
    );
    const gatedRun = gatedSnapshot.workflowStore.runs.find((item: any) => item.runId === started.runId);
    expect(gatedRun.status).toBe("running");
    expect(gatedRun.progress.find((item: any) => item.nodeId === "work")).toMatchObject({
      status: "awaiting_input",
      detail: "Deploy to prod or staging?",
    });
    // Gate must not run the final review while waiting for the human.
    expect(gatedRun.progress.some((item: any) => item.nodeId === "__final_review__")).toBe(false);
    expect(gatedRun.events.some((event: any) => event.type === "gate_opened" && event.nodeId === "work" && event.question === "Deploy to prod or staging?")).toBe(true);

    expect(typeof (hub as any).answerWorkflowGate).toBe("function");
    const answered = await (hub as any).answerWorkflowGate({
      workflowId: created.workflowId,
      runId: started.runId,
      nodeId: "work",
      answer: "staging",
    });
    expect(answered).toMatchObject({ ok: true });

    const doneSnapshot = await waitFor(
      () => hub.snapshot() as any,
      (value) => value.workflowStore.runs.some((run: any) => run.runId === started.runId && run.status === "completed"),
    );
    const doneRun = doneSnapshot.workflowStore.runs.find((item: any) => item.runId === started.runId);
    expect(doneRun).toMatchObject({ status: "completed", finalReport: "## Final User Report\nGated workflow completed." });
    expect(doneRun.progress.find((item: any) => item.nodeId === "work")).toMatchObject({ status: "completed" });
    expect(doneRun.events.some((event: any) => event.type === "gate_answered" && event.nodeId === "work" && event.answer === "staging")).toBe(true);
    // The resumed work run must see the human decision in its prompt context.
    const resumedWorkPrompt = contexts
      .map((context) => context.prompt)
      .filter((prompt) => prompt.includes("Current node: Work") && prompt.includes("Human decision"))
      .at(-1);
    expect(resumedWorkPrompt).toContain("staging");
  });

  test("persists scheduled workflow config, schedules, and run history", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-scheduled-workflows-"));
    const storagePath = path.join(dir, "app-state.json");
    const hub = new AgentHub();
    await hub.loadPersistedState(storagePath);

    const created = (hub as any).createWorkflow({
      title: "Daily repo review",
      objective: "Review repository changes every morning",
      graph: {
        title: "Daily repo review",
        objective: "Review repository changes every morning",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "review", kind: "agent", title: "Review", prompt: "Review recent changes."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->review", fromNodeId: "start", toNodeId: "review" },
          { id: "review->end", fromNodeId: "review", toNodeId: "end" },
        ],
      },
    });

    (hub as any).saveScheduledWorkflowRunnerConfig({
      baseUrl: "https://scheduler.example.com",
      deviceId: "device-local",
      runnerToken: "runner-token",
    });
    const upserted = (hub as any).upsertScheduledWorkflowSchedule({
      scheduleId: "sched_daily_review",
      workflowId: created.workflowId,
      title: "Daily repo review",
      enabled: true,
      intervalSeconds: 86400,
      frequency: "daily",
      timeOfDay: "09:00",
      timezone: "Asia/Shanghai",
      nextRunAt: 1710003600000,
      lastRunAt: undefined,
      source: "cloud",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    });
    expect(upserted).toMatchObject({ ok: true, scheduleId: "sched_daily_review" });

    const runningSnapshot = (hub as any).recordScheduledWorkflowRun({
      runId: "scheduled_run_1",
      scheduleId: "sched_daily_review",
      workflowId: created.workflowId,
      eventId: "event_1",
      title: "Daily repo review",
      status: "running",
      startedAt: 1710003600000,
      finishedAt: undefined,
      message: "Runner started workflow.",
    });
    expect(runningSnapshot.scheduledWorkflowStore.runs[0]).toMatchObject({
      runId: "scheduled_run_1",
      status: "running",
      eventId: "event_1",
    });

    (hub as any).finishScheduledWorkflowRun("scheduled_run_1", {
      status: "completed",
      workflowRunId: "run_workflow_1",
      message: "Workflow completed.",
      finishedAt: 1710003900000,
    });
    await hub.flushPersistence();

    const persisted = JSON.parse(await readFile(storagePath, "utf8")) as any;
    expect(persisted.scheduledWorkflowStore.runnerConfig).toMatchObject({
      baseUrl: "https://scheduler.example.com",
      deviceId: "device-local",
      runnerToken: "runner-token",
    });
    expect(persisted.scheduledWorkflowStore.schedules).toHaveLength(1);
    expect(persisted.scheduledWorkflowStore.runs[0]).toMatchObject({
      runId: "scheduled_run_1",
      scheduleId: "sched_daily_review",
      status: "completed",
      workflowRunId: "run_workflow_1",
    });

    const restored = new AgentHub();
    await restored.loadPersistedState(storagePath);
    const snapshot = restored.snapshot() as any;

    expect(snapshot.scheduledWorkflowStore.runnerConfig).toMatchObject({
      baseUrl: "https://scheduler.example.com",
      deviceId: "device-local",
      runnerToken: "runner-token",
    });
    expect(snapshot.scheduledWorkflowStore.schedules[0]).toMatchObject({
      scheduleId: "sched_daily_review",
      workflowId: created.workflowId,
      title: "Daily repo review",
      enabled: true,
      intervalSeconds: 86400,
      frequency: "daily",
      timeOfDay: "09:00",
      timezone: "Asia/Shanghai",
      nextRunAt: 1710003600000,
      source: "cloud",
    });
    expect(snapshot.scheduledWorkflowStore.runs[0]).toMatchObject({
      runId: "scheduled_run_1",
      status: "completed",
      workflowRunId: "run_workflow_1",
      message: "Workflow completed.",
    });
  });

  test("runs a scheduled workflow event in main and acks after local completion", async () => {
    const contexts: AgentExecutionContext[] = [];
    const ackEvent = vi.fn(async () => undefined);
    const hub = new AgentHub(
      { codex: "codex-for-test", claude: "missing-claude-for-test" },
      {
        create: (context) => {
          contexts.push(context);
          return {
            start: async () => {
              const content = context.prompt.includes("workflow judge")
                ? 'workflowEvaluation.submit({ complete: true, reason: "approved", retryPrompt: "" })'
                : context.prompt.includes("main workflow agent")
                  ? "## Final User Report\nScheduled workflow completed."
                  : "### Work Completion Report\nScheduled work finished.\n\n### Handoff\nReady.";
              context.emit({ type: "completed", content });
            },
            stop: async () => undefined,
          };
        },
      },
    );
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: "codex-for-test",
      version: "test",
      available: true,
    });
    const created = (hub as any).createWorkflow({
      title: "Scheduled workflow",
      objective: "Run from scheduled event",
      graph: {
        title: "Scheduled workflow",
        objective: "Run from scheduled event",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "work", kind: "agent", title: "Work", prompt: "Do the scheduled work." },
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->work", fromNodeId: "start", toNodeId: "work" },
          { id: "work->end", fromNodeId: "work", toNodeId: "end" },
        ],
      },
    });
    (hub as any).upsertScheduledWorkflowSchedule({
      scheduleId: "sched_1",
      workflowId: created.workflowId,
      title: "Scheduled workflow",
      enabled: true,
      intervalSeconds: 86400,
      frequency: "daily",
      timeOfDay: "09:00",
      timezone: "Asia/Shanghai",
      source: "cloud",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    });

    await hub.runScheduledWorkflowEvent({
      eventId: "event_1",
      type: "scheduled.workflow.due",
      title: "Scheduled workflow",
      message: "Cloud runner triggered this workflow.",
      payload: {
        scheduleId: "sched_1",
        workflowId: created.workflowId,
      },
    }, ackEvent);

    const snapshot = hub.snapshot() as any;
    expect(snapshot.scheduledWorkflowStore.runs[0]).toMatchObject({
      runId: "scheduled_run_event_1",
      scheduleId: "sched_1",
      workflowId: created.workflowId,
      status: "completed",
      message: "Workflow completed.",
      workflowRunId: expect.stringMatching(/^run_/),
    });
    expect(snapshot.workflowStore.runs.find((run: any) => run.runId === snapshot.scheduledWorkflowStore.runs[0].workflowRunId)).toMatchObject({
      workflowId: created.workflowId,
      status: "completed",
      finalReport: "## Final User Report\nScheduled workflow completed.",
    });
    expect(ackEvent).toHaveBeenCalledTimes(1);
    expect(ackEvent).toHaveBeenCalledWith("event_1", expect.objectContaining({
      status: "completed",
      workflowRunId: snapshot.scheduledWorkflowStore.runs[0].workflowRunId,
      message: "Workflow completed.",
    }));
    expect(contexts.map((context) => (context.prompt.includes("workflow judge") ? "judge" : context.prompt.includes("main workflow agent") ? "final" : "work"))).toEqual([
      "work",
      "judge",
      "final",
    ]);
  });

  test("rejects schedules for missing workflows", () => {
    const hub = new AgentHub();

    const result = (hub as any).upsertScheduledWorkflowSchedule({
      scheduleId: "sched_missing",
      workflowId: "wf_missing",
      title: "Missing workflow",
      enabled: true,
      intervalSeconds: 3600,
      frequency: "daily",
      timeOfDay: "09:00",
      timezone: "Asia/Shanghai",
      source: "cloud",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Workflow wf_missing was not found.",
    });
    expect((hub.snapshot() as any).scheduledWorkflowStore.schedules).toEqual([]);
  });
});

describe("AgentHub task runs", () => {
  test("creates a task run with selected execution config without changing the active chat", async () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    const activeChatId = hub.snapshot().activeChatId;

    const snapshot = await hub.runTask({
      prompt: "Inspect the repo and summarize risks",
      configuredAgentId: "default-agent",
      workDir: "/tmp/project",
    });

    expect(snapshot.activeChatId).toBe(activeChatId);
    expect(snapshot.activeTaskId).toBe(snapshot.tasks[0]?.id);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0]).toMatchObject({
      title: "Inspect the repo and summarize risks",
      prompt: "Inspect the repo and summarize risks",
      configuredAgentId: "default-agent",
      workDir: "/tmp/project",
      progress: "todo",
      status: "failed",
      running: false,
      messages: [
        expect.objectContaining({ role: "user", content: "Inspect the repo and summarize risks" }),
        expect.objectContaining({ role: "error", content: "Default Agent is not available on this machine." }),
      ],
    });
  });

  test("keeps user progress separate from agent execution status", () => {
    const hub = new AgentHub();
    const task = (hub as any).createTaskState({
      prompt: "Run a focused task",
      configuredAgentId: "default-agent",
      workDir: "/tmp/project",
    });
    (hub as any).tasks.set(task.id, task);
    hub.selectTask(task.id);

    let snapshot = hub.updateTaskProgress(task.id, "done");
    expect(snapshot.tasks[0]).toMatchObject({
      id: task.id,
      progress: "done",
      status: "queued",
    });

    (hub as any).handleAgentEvent(task, { type: "delta", content: "Working" });
    snapshot = hub.snapshot();
    expect(snapshot.tasks[0]).toMatchObject({
      progress: "done",
      status: "queued",
    });

    (hub as any).handleAgentEvent(task, { type: "completed" });
    snapshot = hub.snapshot();
    expect(snapshot.tasks[0]).toMatchObject({
      progress: "in_review",
      status: "completed",
    });
  });

  test("stores task transcript events separately from chat transcript", () => {
    const hub = new AgentHub();
    const task = (hub as any).createTaskState({
      prompt: "Run a focused task",
      configuredAgentId: "default-agent",
      workDir: "/tmp/project",
    });
    (hub as any).tasks.set(task.id, task);
    (hub as any).handleAgentEvent(task, { type: "delta", content: "Working" });
    (hub as any).handleAgentEvent(task, { type: "meta", content: "→ shell_command\npwd" });
    (hub as any).handleAgentEvent(task, { type: "completed" });

    const snapshot = hub.snapshot();
    expect(snapshot.tasks[0]?.status).toBe("completed");
    expect(snapshot.tasks[0]?.messages).toEqual([
      expect.objectContaining({
        role: "assistant",
        content: "Working",
        events: [expect.objectContaining({ type: "meta", content: "→ shell_command\npwd" })],
      }),
    ]);
    expect(snapshot.chats[0]?.messages).toEqual([]);
  });

  test("deletes a task run and selects the next remaining task", async () => {
    const hub = new AgentHub();
    const first = (hub as any).createTaskState({
      prompt: "First task",
      configuredAgentId: "default-agent",
      workDir: "/tmp/project",
    });
    const second = (hub as any).createTaskState({
      prompt: "Second task",
      configuredAgentId: "default-agent",
      workDir: "/tmp/project",
    });
    (hub as any).tasks.set(first.id, first);
    (hub as any).tasks.set(second.id, second);
    hub.selectTask(first.id);

    const snapshot = await (hub as any).deleteTask(first.id);

    expect(snapshot.tasks.map((task: any) => task.id)).toEqual([second.id]);
    expect(snapshot.activeTaskId).toBe(second.id);
  });

  test("archives the Codex session when deleting a task with a session id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-archive-"));
    const argsPath = path.join(dir, "args.txt");
    const executable = await writeNodeCliLauncher(
      dir,
      "codex-fake",
      `const fs = require("fs");
fs.writeFileSync(${JSON.stringify(argsPath)}, process.argv.slice(2).join("\\n") + "\\n", "utf8");
`,
    );

    const hub = new AgentHub({ codex: executable, claude: "missing-claude-for-test" });
    const task = (hub as any).createTaskState({
      prompt: "Task with session",
      configuredAgentId: "default-agent",
      workDir: "/tmp/project",
    });
    task.sessionId = "019e9143-2451-7612-a62d-e65389574d7d";
    (hub as any).tasks.set(task.id, task);

    await hub.deleteTask(task.id);

    expect(await readFile(argsPath, "utf8")).toBe("archive\n019e9143-2451-7612-a62d-e65389574d7d\n");
  });
});

describe("AgentHub agent teams", () => {
  test("creates an agent team with ordered members and shared context", () => {
    const hub = new AgentHub();

    const snapshot = (hub as any).createTeam({
      name: "Review Team",
      sharedContext: "Focus on repo risks and public dependencies.",
      members: [
        {
          roleName: "Reviewer",
          prompt: "Review the implementation for correctness.",
          configuredAgentId: "default-agent",
          canvasPosition: { x: 120, y: 90 },
        },
        {
          roleName: "Verifier",
          configuredAgentId: "default-agent",
        },
      ],
    });

    expect(snapshot.activeTeamId).toBe(snapshot.teams[0]?.id);
    expect(snapshot.teams[0]).toMatchObject({
      name: "Review Team",
      mode: "pipeline",
      sharedContext: "Focus on repo risks and public dependencies.",
      members: [
        expect.objectContaining({
          roleName: "Reviewer",
          prompt: "Review the implementation for correctness.",
          configuredAgentId: "default-agent",
          canvasPosition: { x: 120, y: 90 },
        }),
        expect.objectContaining({ roleName: "Verifier"}),
      ],
    });
    const [reviewer, verifier] = snapshot.teams[0]!.members;
    expect(snapshot.teams[0]!.workflow).toMatchObject({
      mode: "pipeline",
      phases: [
        expect.objectContaining({ title: "Start" }),
        expect.objectContaining({ title: "Reviewer" }),
        expect.objectContaining({ title: "Verifier" }),
        expect.objectContaining({ title: "Done" }),
      ],
      nodes: [
        expect.objectContaining({ id: "start", kind: "start", label: "Start", status: "idle" }),
        expect.objectContaining({
          id: `member:${reviewer!.id}`,
          kind: "agent",
          label: "Reviewer",
          teamMemberId: reviewer!.id,
          status: "idle",
          canvasPosition: { x: 120, y: 90 },
        }),
        expect.objectContaining({ id: `member:${verifier!.id}`, kind: "agent", label: "Verifier", teamMemberId: verifier!.id, status: "idle" }),
        expect.objectContaining({ id: "done", kind: "done", label: "Done", status: "idle" }),
      ],
      edges: [
        expect.objectContaining({ fromNodeId: "start", toNodeId: `member:${reviewer!.id}` }),
        expect.objectContaining({ fromNodeId: `member:${reviewer!.id}`, toNodeId: `member:${verifier!.id}` }),
        expect.objectContaining({ fromNodeId: `member:${verifier!.id}`, toNodeId: "done" }),
      ],
    });
  });

  test("preserves agent team member canvas positions when updating members", () => {
    const hub = new AgentHub();
    const created = (hub as any).createTeam({
      name: "Layout Team",
      members: [
        {
          id: "member-a",
          roleName: "Planner",
          prompt: "Plan",
          configuredAgentId: "default-agent",
        },
      ],
    });
    const teamId = created.teams[0]!.id;

    const updated = (hub as any).updateTeam(teamId, {
      members: [
        {
          ...created.teams[0]!.members[0],
          canvasPosition: { x: 240, y: 180 },
        },
      ],
    });

    expect(updated.teams[0]!.members[0]!.canvasPosition).toEqual({ x: 240, y: 180 });
  });

  test("runs a parallel team by starting all members at once", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-team-parallel-"));
    const fake = await writeSequentialCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "test",
      available: true,
    });

    const created = (hub as any).createTeam({
      name: "Parallel Review",
      mode: "parallel",
      sharedContext: "Shared parallel context",
      members: [
        {
          roleName: "Security",
          prompt: "Check auth and dependency risks.",
          configuredAgentId: "default-agent",
        },
        {
          roleName: "Testing",
          prompt: "Check missing verification and flaky tests.",
          configuredAgentId: "default-agent",
        },
      ],
    });
    const teamId = created.teams[0].id;

    const started = await (hub as any).runTeam({
      teamId,
      prompt: "Review the release branch",
      target: { kind: "workspace", label: "Current workspace", value: dir },
      workDir: dir,
    });

    expect(started.teamRuns[0]).toMatchObject({
      teamId,
      teamName: "Parallel Review",
      mode: "parallel",
      status: "running",
      target: { kind: "workspace", label: "Current workspace", value: dir },
      steps: [
        expect.objectContaining({ roleName: "Security", status: "running" }),
        expect.objectContaining({ roleName: "Testing", status: "running" }),
      ],
    });
    expect(started.teamRuns[0].steps[0].taskId).toBeDefined();
    expect(started.teamRuns[0].steps[1].taskId).toBeDefined();
    expect(started.teamRuns[0].steps[1].taskId).not.toBe(started.teamRuns[0].steps[0].taskId);

    const completed = await waitFor(
      () => (hub as any).snapshot(),
      (snapshot: any) => snapshot.teamRuns[0]?.status === "completed",
    );

    expect(completed.teamRuns[0]).toMatchObject({
      status: "completed",
      steps: [
        expect.objectContaining({ roleName: "Security", status: "completed", artifact: expect.stringMatching(/^artifact-\d+$/) }),
        expect.objectContaining({ roleName: "Testing", status: "completed", artifact: expect.stringMatching(/^artifact-\d+$/) }),
      ],
    });
  });

  test("runs a supervisor team as lead plan, parallel workers, then lead synthesis", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-team-supervisor-"));
    const fake = await writeSequentialCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "test",
      available: true,
    });

    const created = (hub as any).createTeam({
      name: "Supervisor Review",
      mode: "supervisor",
      sharedContext: "Shared supervisor context",
      members: [
        {
          roleName: "Lead",
          prompt: "Plan the work and coordinate outputs.",
          configuredAgentId: "default-agent",
        },
        {
          roleName: "Reviewer",
          prompt: "Review correctness.",
          configuredAgentId: "default-agent",
        },
        {
          roleName: "Verifier",
          prompt: "Verify test coverage.",
          configuredAgentId: "default-agent",
        },
      ],
    });
    const teamId = created.teams[0].id;

    const started = await (hub as any).runTeam({
      teamId,
      prompt: "Ship the workflow builder safely",
      workDir: dir,
    });

    expect(started.teamRuns[0]).toMatchObject({
      mode: "supervisor",
      status: "running",
      steps: [
        expect.objectContaining({ roleName: "Lead", status: "running" }),
        expect.objectContaining({ roleName: "Reviewer", status: "queued" }),
        expect.objectContaining({ roleName: "Verifier", status: "queued" }),
        expect.objectContaining({ roleName: "Lead Synthesis", status: "queued" }),
      ],
    });

    const workersRunning = await waitFor(
      () => (hub as any).snapshot(),
      (snapshot: any) =>
        snapshot.teamRuns[0]?.steps[0]?.status === "completed" &&
        snapshot.teamRuns[0]?.steps[1]?.status === "running" &&
        snapshot.teamRuns[0]?.steps[2]?.status === "running" &&
        snapshot.teamRuns[0]?.steps[3]?.status === "queued",
    );
    expect(workersRunning.teamRuns[0].steps[1].taskId).not.toBe(workersRunning.teamRuns[0].steps[2].taskId);
    const workerTask = workersRunning.tasks.find((task: any) => task.id === workersRunning.teamRuns[0].steps[1].taskId);
    expect(workerTask?.prompt).toContain("Lead");
    expect(workerTask?.prompt).toContain("artifact-1");

    const synthesisRunning = await waitFor(
      () => (hub as any).snapshot(),
      (snapshot: any) => snapshot.teamRuns[0]?.steps[3]?.status === "running",
    );
    const synthesisTask = synthesisRunning.tasks.find((task: any) => task.id === synthesisRunning.teamRuns[0].steps[3].taskId);
    expect(synthesisTask?.prompt).toContain("Reviewer");
    expect(synthesisTask?.prompt).toContain("Verifier");

    const completed = await waitFor(
      () => (hub as any).snapshot(),
      (snapshot: any) => snapshot.teamRuns[0]?.status === "completed",
    );
    expect(completed.teamRuns[0]).toMatchObject({
      status: "completed",
      steps: [
        expect.objectContaining({ roleName: "Lead", status: "completed", artifact: "artifact-1" }),
        expect.objectContaining({ roleName: "Reviewer", status: "completed", artifact: expect.stringMatching(/^artifact-\d+$/) }),
        expect.objectContaining({ roleName: "Verifier", status: "completed", artifact: expect.stringMatching(/^artifact-\d+$/) }),
        expect.objectContaining({ roleName: "Lead Synthesis", status: "completed", artifact: expect.stringMatching(/^artifact-\d+$/) }),
      ],
    });
  });

  test("runs a pipeline team in member order and passes artifacts to the next member", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-team-run-"));
    const fake = await writeSequentialCodexFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    (hub as any).runtimes.set("codex", {
      id: "codex",
      label: "Codex",
      command: fake.executable,
      version: "test",
      available: true,
    });

    const created = (hub as any).createTeam({
      name: "Sequential Review",
      sharedContext: "Shared repo context",
      members: [
        {
          roleName: "Planner",
          prompt: "Create a short review plan before touching code.",
          configuredAgentId: "default-agent",
        },
        {
          roleName: "Checker",
          prompt: "Use prior artifacts, then verify risks and missing tests.",
          configuredAgentId: "default-agent",
        },
      ],
    });
    const teamId = created.teams[0].id;

    const started = await (hub as any).runTeam({
      teamId,
      prompt: "Review cd ../example-service",
      workDir: dir,
    });

    expect(started.teamRuns[0]).toMatchObject({
      teamId,
      teamName: "Sequential Review",
      status: "running",
      currentStepIndex: 0,
      sharedContextSnapshot: "Shared repo context",
      steps: [
        expect.objectContaining({ roleName: "Planner", status: "running" }),
        expect.objectContaining({ roleName: "Checker", status: "queued" }),
      ],
    });
    expect(started.teamRuns[0].workflow).toMatchObject({
      mode: "pipeline",
      nodes: [
        expect.objectContaining({ id: "start", status: "completed" }),
        expect.objectContaining({
          id: `member:${created.teams[0].members[0].id}`,
          kind: "agent",
          label: "Planner",
          stepId: started.teamRuns[0].steps[0].id,
          status: "running",
        }),
        expect.objectContaining({
          id: `member:${created.teams[0].members[1].id}`,
          kind: "agent",
          label: "Checker",
          stepId: started.teamRuns[0].steps[1].id,
          status: "queued",
        }),
        expect.objectContaining({ id: "done", status: "queued" }),
      ],
    });

    const firstTaskId = started.teamRuns[0].steps[0].taskId;
    const firstTask = started.tasks.find((task: any) => task.id === firstTaskId);
    expect(firstTask?.prompt).toContain("Review cd ../example-service");
    expect(firstTask?.prompt).toContain("Shared repo context");
    expect(firstTask?.prompt).toContain("Create a short review plan before touching code.");
    expect(firstTask?.sessionId).toBeUndefined();
    expect(firstTask?.prompt).not.toContain("artifact-1");

    const afterFirst = await waitFor(
      () => (hub as any).snapshot(),
      (snapshot: any) => snapshot.teamRuns[0]?.steps[1]?.status === "running",
    );
    expect(afterFirst.teamRuns[0]).toMatchObject({
      status: "running",
      currentStepIndex: 1,
      steps: [
        expect.objectContaining({ roleName: "Planner", status: "completed", artifact: "artifact-1" }),
        expect.objectContaining({ roleName: "Checker", status: "running" }),
      ],
    });
    expect(afterFirst.teamRuns[0].workflow.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `member:${created.teams[0].members[0].id}`, status: "completed" }),
        expect.objectContaining({ id: `member:${created.teams[0].members[1].id}`, status: "running" }),
        expect.objectContaining({ id: "done", status: "queued" }),
      ]),
    );

    const secondTaskId = afterFirst.teamRuns[0].steps[1].taskId;
    const secondTask = afterFirst.tasks.find((task: any) => task.id === secondTaskId);
    expect(secondTask?.prompt).toContain("Previous Agent Artifacts");
    expect(secondTask?.prompt).toContain("Planner");
    expect(secondTask?.prompt).toContain("artifact-1");
    expect(secondTask?.prompt).toContain("Use prior artifacts, then verify risks and missing tests.");
    expect(secondTask?.sessionId).toBeUndefined();
    expect(secondTask?.id).not.toBe(firstTaskId);

    const completed = await waitFor(
      () => (hub as any).snapshot(),
      (snapshot: any) => snapshot.teamRuns[0]?.status === "completed",
    );
    expect(completed.teamRuns[0]).toMatchObject({
      status: "completed",
      steps: [
        expect.objectContaining({ roleName: "Planner", status: "completed", artifact: "artifact-1" }),
        expect.objectContaining({ roleName: "Checker", status: "completed", artifact: "artifact-2" }),
      ],
    });
    expect(completed.teamRuns[0].workflow.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `member:${created.teams[0].members[0].id}`, status: "completed" }),
        expect.objectContaining({ id: `member:${created.teams[0].members[1].id}`, status: "completed" }),
        expect.objectContaining({ id: "done", status: "completed" }),
      ]),
    );
  });
});
