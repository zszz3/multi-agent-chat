import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { AgentHub, createWorkflowAgentTimeout } from "./agent-hub";
import { DEFAULT_MODEL_ID } from "../shared/models";

async function writeCodexAppServerFake(dir: string): Promise<{ executable: string; callsPath: string }> {
  const executable = path.join(dir, "codex-fake");
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
  await writeFile(executable, script, "utf8");
  await chmod(executable, 0o755);
  return { executable, callsPath };
}

async function writeSequentialCodexFake(dir: string): Promise<{ executable: string; callsPath: string }> {
  const executable = path.join(dir, "codex-sequential-fake");
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
  await writeFile(executable, script, "utf8");
  await chmod(executable, 0o755);
  return { executable, callsPath };
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
    const hub = new AgentHub(
      { codex: "missing-codex-for-test", claude: "missing-claude-for-test" },
      {
        create: (context: any) => ({
          start: async () => {
            events.push(context);
            context.emit({ type: "session", sessionId: "executor-session" });
            context.emit({ type: "delta", content: "executor response" });
            context.emit({ type: "completed" });
          },
          stop: async () => undefined,
        }),
      },
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

  test("starts with one codex chat selected", () => {
    const hub = new AgentHub();
    const snapshot = hub.snapshot();
    const activeChat = snapshot.chats.find((chat) => chat.id === snapshot.activeChatId);

    expect(snapshot.chats).toHaveLength(1);
    expect(activeChat?.agentId).toBe("codex");
    expect(activeChat?.channelId).toBe("codex-openai");
  });

  test("creates isolated chats with their own agent provider", () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });

    const claudeChat = hub.createChat("claude");
    const snapshot = hub.snapshot();
    const activeChat = snapshot.chats.find((chat) => chat.id === snapshot.activeChatId);

    expect(claudeChat.agentId).toBe("claude");
    expect(snapshot.chats).toHaveLength(2);
    expect(activeChat?.id).toBe(claudeChat.id);
    expect(activeChat?.agentId).toBe("claude");
  });

  test("changes the active chat agent without affecting other chats", () => {
    const hub = new AgentHub();
    const firstChatId = hub.snapshot().activeChatId!;
    const secondChat = hub.createChat("claude");

    hub.setChatAgent(secondChat.id, "codex");

    const snapshot = hub.snapshot();
    const firstChat = snapshot.chats.find((chat) => chat.id === firstChatId);
    const activeChat = snapshot.chats.find((chat) => chat.id === snapshot.activeChatId);

    expect(firstChat?.agentId).toBe("codex");
    expect(activeChat?.id).toBe(secondChat.id);
    expect(activeChat?.agentId).toBe("codex");
  });

  test("tracks the selected model per chat before a conversation starts", () => {
    const hub = new AgentHub();
    const chatId = hub.snapshot().activeChatId!;

    hub.setChatModel(chatId, "gpt-5.5");

    const activeChat = hub.snapshot().chats.find((chat) => chat.id === chatId);
    expect(activeChat?.modelId).toBe("gpt-5.5");

    hub.setChatAgent(chatId, "claude");

    const switchedChat = hub.snapshot().chats.find((chat) => chat.id === chatId);
    expect(switchedChat?.agentId).toBe("claude");
    expect(switchedChat?.channelId).toBe("claude-code");
    expect(switchedChat?.modelId).toBe(DEFAULT_MODEL_ID);
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
    expect(activeChat?.channelId).toBe("codex-bridge");
    expect(activeChat?.modelId).toBe("gpt-5.4");
  });

  test("does not change agent or model after a conversation has started", () => {
    const hub = new AgentHub();
    const chatId = hub.snapshot().activeChatId!;
    const chat = (hub as any).chats.get(chatId);

    (hub as any).handleAgentEvent(chat, { type: "delta", content: "Started" });

    hub.setChatAgent(chatId, "claude");
    hub.setChatChannel(chatId, "claude-code");
    hub.setChatModel(chatId, "gpt-5.5");

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.agentId).toBe("codex");
    expect(activeChat?.channelId).toBe("codex-openai");
    expect(activeChat?.modelId).toBe(DEFAULT_MODEL_ID);
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

  test("reads Codex status through app-server RPC without starting an agent conversation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-status-"));
    const fake = await writeCodexAppServerFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("/status", chatId);
    hub.setChatAgent(chatId, "claude");

    const activeChat = hub.snapshot().chats.find((item) => item.id === chatId);
    expect(activeChat?.agentId).toBe("claude");
    expect(activeChat?.running).toBe(false);
    expect(activeChat?.lastError).toBeUndefined();
    expect(activeChat?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "/status", local: true }),
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

    await hub.sendPrompt("/plugins", chatId);

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

  test("lists Codex models through app-server RPC", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-model-list-"));
    const fake = await writeCodexAppServerFake(dir);
    const hub = new AgentHub({ codex: fake.executable, claude: "missing-claude-for-test" });
    const chatId = hub.snapshot().activeChatId!;

    await hub.sendPrompt("/models", chatId);

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
      agentId: "codex",
      channelId: "codex-openai",
      modelId: DEFAULT_MODEL_ID,
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

  test("persists and restores app-owned chat history", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-"));
    const storagePath = path.join(dir, "app-chats.json");
    const hub = new AgentHub();

    await hub.loadPersistedState(storagePath);
    hub.setWorkDir("/tmp/project");
    const chat = hub.createChat("claude");
    const chatState = (hub as any).chats.get(chat.id);
    (hub as any).handleAgentEvent(chatState, { type: "meta", content: "→ shell_command\npwd" });
    (hub as any).handleAgentEvent(chatState, { type: "delta", content: "Saved response" });
    (hub as any).handleAgentEvent(chatState, { type: "completed" });
    await hub.flushPersistence();

    const persisted = JSON.parse(await readFile(storagePath, "utf8")) as any;
    expect(persisted.version).toBe(2);
    expect(persisted.sessions).toEqual([expect.objectContaining({ id: expect.any(String) }), expect.objectContaining({ id: chat.id })]);
    expect(persisted.messages).toEqual(expect.arrayContaining([expect.objectContaining({ chatId: chat.id, role: "assistant" })]));
    expect(persisted.events).toEqual(expect.arrayContaining([expect.objectContaining({ chatId: chat.id, type: "meta", content: "→ shell_command\npwd" })]));

    const restored = new AgentHub();
    await restored.loadPersistedState(storagePath);
    const snapshot = restored.snapshot();
    const restoredChat = snapshot.chats.find((item) => item.id === chat.id);

    expect(snapshot.workDir).toBe("/tmp/project");
    expect(snapshot.activeChatId).toBe(chat.id);
    expect(restoredChat?.agentId).toBe("claude");
    expect(restoredChat?.running).toBe(false);
    expect(restoredChat?.messages).toEqual([
      expect.objectContaining({
        role: "assistant",
        content: "Saved response",
        events: [expect.objectContaining({ type: "meta", content: "→ shell_command\npwd" })],
      }),
    ]);
  });

  test("migrates legacy JSON history into SQLite storage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-sqlite-"));
    const legacyPath = path.join(dir, "app-chats.json");
    const dbPath = path.join(dir, "app.db");
    const legacyHub = new AgentHub();

    await legacyHub.loadPersistedState(legacyPath);
    legacyHub.setWorkDir("/tmp/legacy-project");
    const chat = legacyHub.createChat("codex");
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

  test("persists and restores multiple workflow drafts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-"));
    const storagePath = path.join(dir, "app-chats.json");
    const hub = new AgentHub();

    await hub.loadPersistedState(storagePath);
    const first = (hub as any).createWorkflow({
      agentId: "codex",
      channelId: "codex-openai",
      modelId: DEFAULT_MODEL_ID,
      title: "sample repo review",
      objective: "Review sample repo",
      graphReady: true,
      graph: {
        title: "sample repo review",
        objective: "Review sample repo",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map repo.", agentId: "codex", channelId: "codex-openai", modelId: DEFAULT_MODEL_ID },
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
          { id: "plan", kind: "agent", title: "Plan", prompt: "Plan release.", agentId: "codex", channelId: "codex-openai", modelId: DEFAULT_MODEL_ID },
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
        agentId: "codex",
        channelId: "codex-openai",
        modelId: DEFAULT_MODEL_ID,
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
          { id: "work", kind: "agent", title: "Work", prompt: "Work.", agentId: "codex", channelId: "codex-openai", modelId: DEFAULT_MODEL_ID },
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
});

describe("AgentHub task runs", () => {
  test("creates a task run with selected execution config without changing the active chat", async () => {
    const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
    const activeChatId = hub.snapshot().activeChatId;

    const snapshot = await hub.runTask({
      prompt: "Inspect the repo and summarize risks",
      agentId: "codex",
      channelId: "codex-openai",
      modelId: "gpt-5.5",
      workDir: "/tmp/project",
    });

    expect(snapshot.activeChatId).toBe(activeChatId);
    expect(snapshot.activeTaskId).toBe(snapshot.tasks[0]?.id);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0]).toMatchObject({
      title: "Inspect the repo and summarize risks",
      prompt: "Inspect the repo and summarize risks",
      agentId: "codex",
      channelId: "codex-openai",
      modelId: "gpt-5.5",
      workDir: "/tmp/project",
      progress: "todo",
      status: "failed",
      running: false,
      messages: [
        expect.objectContaining({ role: "user", content: "Inspect the repo and summarize risks" }),
        expect.objectContaining({ role: "error", content: "codex is not available on this machine." }),
      ],
    });
  });

  test("keeps user progress separate from agent execution status", () => {
    const hub = new AgentHub();
    const task = (hub as any).createTaskState({
      prompt: "Run a focused task",
      agentId: "codex",
      channelId: "codex-openai",
      modelId: DEFAULT_MODEL_ID,
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
      agentId: "claude",
      channelId: "claude-code",
      modelId: DEFAULT_MODEL_ID,
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
      agentId: "codex",
      channelId: "codex-openai",
      modelId: DEFAULT_MODEL_ID,
      workDir: "/tmp/project",
    });
    const second = (hub as any).createTaskState({
      prompt: "Second task",
      agentId: "codex",
      channelId: "codex-openai",
      modelId: DEFAULT_MODEL_ID,
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
    const executable = path.join(dir, "codex-fake");
    const argsPath = path.join(dir, "args.txt");
    await writeFile(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsPath}'\n`, "utf8");
    await chmod(executable, 0o755);

    const hub = new AgentHub({ codex: executable, claude: "missing-claude-for-test" });
    const task = (hub as any).createTaskState({
      prompt: "Task with session",
      agentId: "codex",
      channelId: "codex-openai",
      modelId: DEFAULT_MODEL_ID,
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
          agentId: "codex",
          channelId: "codex-openai",
          modelId: "gpt-5.5",
          canvasPosition: { x: 120, y: 90 },
        },
        {
          roleName: "Verifier",
          agentId: "claude",
          channelId: "claude-code",
          modelId: DEFAULT_MODEL_ID,
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
          agentId: "codex",
          channelId: "codex-openai",
          modelId: "gpt-5.5",
          canvasPosition: { x: 120, y: 90 },
        }),
        expect.objectContaining({ roleName: "Verifier", agentId: "claude", channelId: "claude-code", modelId: DEFAULT_MODEL_ID }),
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
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
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
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
        },
        {
          roleName: "Testing",
          prompt: "Check missing verification and flaky tests.",
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
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
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
        },
        {
          roleName: "Reviewer",
          prompt: "Review correctness.",
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
        },
        {
          roleName: "Verifier",
          prompt: "Verify test coverage.",
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
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
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
        },
        {
          roleName: "Checker",
          prompt: "Use prior artifacts, then verify risks and missing tests.",
          agentId: "codex",
          channelId: "codex-openai",
          modelId: DEFAULT_MODEL_ID,
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
