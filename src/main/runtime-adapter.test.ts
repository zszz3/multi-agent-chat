import { afterEach, describe, expect, test, vi } from "vitest";
import type { AgentChannel, AgentEvent } from "../shared/types";
import type { RuntimeAdapterRegistryOptions, RuntimeExecutorContext } from "./runtime-adapter";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function runtimeContext(overrides: Partial<RuntimeExecutorContext> = {}): RuntimeExecutorContext {
  return {
    runId: "run-1",
    runKind: "chat",
    agentId: "codex",
    runtime: {
      id: "codex",
      label: "Codex",
      command: "runtime-command",
      version: "test",
      available: true,
    },
    channelId: "channel-1",
    modelId: "default",
    prompt: "hello",
    sessionId: undefined,
    workDir: "C:\\workspace",
    developerInstructions: "Developer instructions",
    emit: () => undefined,
    onExit: () => undefined,
    ...overrides,
  };
}

function baseOptions(channelById: (channelId: string) => AgentChannel | undefined): RuntimeAdapterRegistryOptions {
  return {
    executables: {
      codex: "codex-executable",
      claude: "claude-executable",
      api: "api",
    },
    channelById,
    respondToCodexServerRequest: () => undefined,
  };
}

describe("createRuntimeAdapterRegistry", () => {
  test("dispatches codex chat execution through CodexRpcClient", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const constructorCalls: Array<Record<string, unknown>> = [];

    vi.doMock("./agents/codex-rpc", () => ({
      CodexRpcClient: class MockCodexRpcClient {
        constructor(options: Record<string, unknown>) {
          constructorCalls.push(options);
        }

        async start(): Promise<void> {
          return undefined;
        }

        async request(method: string, params: Record<string, unknown>): Promise<unknown> {
          requests.push({ method, params });
          if (method === "thread/start") return { thread: { id: "thread-1" } };
          return {};
        }

        async shutdown(): Promise<void> {
          return undefined;
        }
      },
    }));

    const { createRuntimeAdapterRegistry } = await import("./runtime-adapter");
    const events: AgentEvent[] = [];
    const exits: Array<number | null | undefined> = [];
    const registry = createRuntimeAdapterRegistry(
      baseOptions(() => ({
        id: "codex-openai",
        agentId: "codex",
        label: "Codex OpenAI",
        providerName: "OpenAI",
        modelProvider: "openai",
        wireApi: "responses",
        models: [{ id: "default", label: "Default" }],
      }) as AgentChannel),
    );

    const executor = registry.createExecutor(
      runtimeContext({
        emit: (event) => events.push(event),
        onExit: (code) => exits.push(code),
      }),
    );

    await executor.start();
    await executor.stop();

    expect(constructorCalls[0]).toMatchObject({
      executable: "runtime-command",
      cwd: "C:\\workspace",
    });
    expect(requests.map((item) => item.method)).toEqual(["thread/start", "turn/start"]);
    expect(events).toContainEqual({ type: "session", sessionId: "thread-1" });
    expect(exits).toEqual([]);
  });

  test("dispatches claude chat execution through ClaudeRunner", async () => {
    const constructorCalls: Array<Record<string, unknown>> = [];
    let stopCalls = 0;

    vi.doMock("./agents/claude-env", () => ({
      claudeEnvironmentForChannel: () => ({ CLAUDE_TEST_ENV: "1" }),
      claudeCliModelForChannel: () => "claude-opus-test",
    }));
    vi.doMock("./agents/claude-runner", () => ({
      ClaudeRunner: class MockClaudeRunner {
        constructor(options: Record<string, unknown>) {
          constructorCalls.push(options);
        }

        async start(): Promise<void> {
          return undefined;
        }

        async stop(): Promise<void> {
          stopCalls += 1;
        }
      },
    }));

    const { createRuntimeAdapterRegistry } = await import("./runtime-adapter");
    const exits: Array<number | null | undefined> = [];
    const registry = createRuntimeAdapterRegistry(
      baseOptions(() => ({
        id: "claude-code",
        agentId: "claude",
        label: "Claude Code",
        providerName: "Anthropic",
        modelProvider: "anthropic",
        models: [{ id: "default", label: "Default" }],
      }) as AgentChannel),
    );

    const executor = registry.createExecutor(
      runtimeContext({
        agentId: "claude",
        runtime: {
          id: "claude",
          label: "Claude Code",
          command: "runtime-claude",
          version: "test",
          available: true,
        },
        sessionId: "session-123",
        onExit: (code) => exits.push(code),
      }),
    );

    await executor.start();
    await executor.stop();

    expect(constructorCalls[0]).toMatchObject({
      executable: "runtime-claude",
      cwd: "C:\\workspace",
      env: { CLAUDE_TEST_ENV: "1" },
      prompt: "hello",
      modelId: "claude-opus-test",
      sessionId: "session-123",
    });
    expect(stopCalls).toBe(1);
    expect(exits).toEqual([]);
  });

  test("dispatches api chat execution through fetch", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "api-ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const { createRuntimeAdapterRegistry } = await import("./runtime-adapter");
    const events: AgentEvent[] = [];
    const exits: Array<number | null | undefined> = [];
    const registry = createRuntimeAdapterRegistry(
      baseOptions(() => ({
        id: "api-openai",
        agentId: "api",
        label: "API OpenAI",
        providerName: "OpenAI",
        modelProvider: "openai",
        baseUrl: "https://api.example.com/v1",
        models: [
          { id: "default", label: "Default" },
          { id: "gpt-5.5", label: "GPT-5.5" },
        ],
      }) as AgentChannel),
    );

    const executor = registry.createExecutor(
      runtimeContext({
        agentId: "api",
        runtime: {
          id: "api",
          label: "API",
          command: "api",
          version: "test",
          available: true,
        },
        modelId: "gpt-5.5",
        emit: (event) => events.push(event),
        onExit: (code) => exits.push(code),
      }),
    );

    await executor.start();

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const requestInit = (fetchImpl.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];

    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: "Developer instructions" },
        { role: "user", content: "hello" },
      ],
      stream: false,
    });
    expect(events).toEqual([
      { type: "session", sessionId: "run-1" },
      { type: "delta", content: "api-ok" },
      { type: "completed", content: "api-ok" },
    ]);
    expect(exits).toEqual([0]);
  });
});
