import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RuntimeDriver } from "../../../agents/runtime/runtime-driver";

function buildOptions() {
  return {
    executables: { codex: "codex", claude: "claude", api: "api", hermes: "hermes" },
    channelById: () => ({
      id: "test-channel",
      runtimeAgentId: "api",
      label: "Test Channel",
      providerId: "openai",
      modelId: "default",
      settings: {},
    }),
    respondToCodexServerRequest: () => undefined,
  } as any;
}

function createMockDriver(runtimeId: RuntimeDriver["runtimeId"]): RuntimeDriver {
  return {
    runtimeId,
    surfaceSupport: [],
    getCapabilities: () => {
      throw new Error("not implemented in test");
    },
  };
}

const builderMocks = vi.hoisted(() => ({
  codex: vi.fn(),
  claude: vi.fn(),
  api: vi.fn(),
  hermes: vi.fn(),
}));

const runtimeModuleMocks = vi.hoisted(() => ({
  codexWorkflow: vi.fn(async () => ({ content: "codex workflow" })),
  claudeWorkflow: vi.fn(async () => ({ content: "claude workflow" })),
  hermesWorkflow: vi.fn(async () => ({ content: "hermes workflow" })),
  hermesChannelTest: vi.fn(async () => "hermes channel test"),
  codexCleanup: vi.fn(async () => undefined),
  claudeCleanup: vi.fn(async () => undefined),
}));

vi.mock("./codex/codex-workflow", () => ({
  runCodexWorkflow: runtimeModuleMocks.codexWorkflow,
}));
vi.mock("./claude/claude-workflow", () => ({
  runClaudeWorkflow: runtimeModuleMocks.claudeWorkflow,
}));
vi.mock("./hermes/hermes-workflow", () => ({
  runHermesWorkflow: runtimeModuleMocks.hermesWorkflow,
  runHermesChannelTest: runtimeModuleMocks.hermesChannelTest,
}));
vi.mock("./codex/codex-cleanup", () => ({
  deleteCodexSessionArtifacts: runtimeModuleMocks.codexCleanup,
}));
vi.mock("./claude/claude-cleanup", () => ({
  deleteClaudeSessionArtifacts: runtimeModuleMocks.claudeCleanup,
}));

describe("createRuntimeDriverRegistry", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(builderMocks)) mock.mockReset();
    for (const mock of Object.values(runtimeModuleMocks)) mock.mockClear();
  });

  test("composes the registry through runtime-local builder entrypoints", async () => {
    const options = buildOptions();
    const drivers = {
      codex: createMockDriver("codex"),
      claude: createMockDriver("claude"),
      api: createMockDriver("api"),
      hermes: createMockDriver("hermes"),
    };

    builderMocks.codex.mockReturnValue(drivers.codex);
    builderMocks.claude.mockReturnValue(drivers.claude);
    builderMocks.api.mockReturnValue(drivers.api);
    builderMocks.hermes.mockReturnValue(drivers.hermes);

    vi.doMock("./codex/create-codex-driver", () => ({ createCodexDriver: builderMocks.codex }));
    vi.doMock("./claude/create-claude-driver", () => ({ createClaudeDriver: builderMocks.claude }));
    vi.doMock("./api/create-api-driver", () => ({ createApiDriver: builderMocks.api }));
    vi.doMock("./hermes/create-hermes-driver", () => ({ createHermesDriver: builderMocks.hermes }));

    const { createRuntimeDriverRegistry } = await import("./agent-executor");
    const registry = createRuntimeDriverRegistry(options);

    for (const mock of Object.values(builderMocks)) {
      expect(mock).toHaveBeenCalledOnce();
      expect(mock).toHaveBeenCalledWith(options);
    }
    expect(registry.driverFor("codex")).toBe(drivers.codex);
    expect(registry.driverFor("claude")).toBe(drivers.claude);
    expect(registry.driverFor("api")).toBe(drivers.api);
    expect(registry.driverFor("hermes")).toBe(drivers.hermes);
  });

  test("runtime-local builders own their workflow, cleanup, and test hooks", async () => {
    const options = buildOptions();
    const workflowInput = {
      requestId: "request-1",
      prompt: "hello",
      runtime: { type: "stdio", command: "cmd" },
      channelId: "test-channel",
      workDir: "/tmp/runtime",
    } as any;
    const cleanupInput = {
      workDir: "/tmp/runtime",
      runtimeConversation: { id: "conversation-1" },
    } as any;
    const channelTestInput = {
      runtime: { type: "stdio", command: "cmd" },
      channelId: "test-channel",
      modelId: "default",
      workDir: "/tmp/runtime",
      emit: vi.fn(),
    } as any;

    vi.doUnmock("./codex/create-codex-driver");
    vi.doUnmock("./claude/create-claude-driver");
    vi.doUnmock("./hermes/create-hermes-driver");
    const [{ createCodexDriver }, { createClaudeDriver }, { createHermesDriver }] = await Promise.all([
      import("./codex/create-codex-driver"),
      import("./claude/create-claude-driver"),
      import("./hermes/create-hermes-driver"),
    ]);

    const codexDriver = createCodexDriver(options);
    const claudeDriver = createClaudeDriver(options);
    const hermesDriver = createHermesDriver(options);

    await codexDriver.askWorkflow?.(workflowInput);
    await codexDriver.deleteSessionArtifacts?.(cleanupInput);
    await claudeDriver.askWorkflow?.(workflowInput);
    await claudeDriver.deleteSessionArtifacts?.(cleanupInput);
    await hermesDriver.askWorkflow?.(workflowInput);
    await hermesDriver.testChannel?.(channelTestInput);

    expect(runtimeModuleMocks.codexWorkflow).toHaveBeenCalledWith(workflowInput, options);
    expect(runtimeModuleMocks.codexCleanup).toHaveBeenCalledWith(options.executables.codex, cleanupInput);
    expect(runtimeModuleMocks.claudeWorkflow).toHaveBeenCalledWith(workflowInput, options, expect.any(Function));
    expect(runtimeModuleMocks.claudeCleanup).toHaveBeenCalledWith(cleanupInput);
    expect(runtimeModuleMocks.hermesWorkflow).toHaveBeenCalledWith(workflowInput, options);
    expect(runtimeModuleMocks.hermesChannelTest).toHaveBeenCalledWith(channelTestInput, options);
  });

  test("runtime-local builders expose only explicitly supported hooks", async () => {
    const options = buildOptions();
    vi.doUnmock("./codex/create-codex-driver");
    vi.doUnmock("./claude/create-claude-driver");
    vi.doUnmock("./api/create-api-driver");
    vi.doUnmock("./hermes/create-hermes-driver");
    const [codex, claude, api, hermes] = await Promise.all([
      import("./codex/create-codex-driver").then(({ createCodexDriver }) => createCodexDriver(options)),
      import("./claude/create-claude-driver").then(({ createClaudeDriver }) => createClaudeDriver(options)),
      import("./api/create-api-driver").then(({ createApiDriver }) => createApiDriver(options)),
      import("./hermes/create-hermes-driver").then(({ createHermesDriver }) => createHermesDriver(options)),
    ]);

    for (const driver of [codex, claude, api, hermes]) {
      expect(driver.surfaceSupport.length).toBeGreaterThan(0);
    }
    expect(hermes.runtimeStateCodec).toBeUndefined();
    expect(hermes.createInteractiveSession).toBeUndefined();
    expect(hermes.deleteSessionArtifacts).toBeUndefined();
  });
});
