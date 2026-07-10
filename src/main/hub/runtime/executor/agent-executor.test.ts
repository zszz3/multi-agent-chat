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

const runtimeLocalBundleMocks = vi.hoisted(() => ({
  codexWorkflow: vi.fn(async () => ({ message: "codex workflow" })),
  claudeWorkflow: vi.fn(async () => ({ message: "claude workflow" })),
  hermesWorkflow: vi.fn(async () => ({ message: "hermes workflow" })),
  hermesChannelTest: vi.fn(async () => "hermes channel test"),
  codexCleanup: vi.fn(async () => undefined),
  claudeCleanup: vi.fn(async () => undefined),
}));

const sharedHelperMocks = vi.hoisted(() => ({
  codexWorkflow: vi.fn(async () => ({ message: "shared codex workflow" })),
  claudeWorkflow: vi.fn(async () => ({ message: "shared claude workflow" })),
  hermesWorkflow: vi.fn(async () => ({ message: "shared hermes workflow" })),
  hermesChannelTest: vi.fn(async () => "shared hermes channel test"),
  codexCleanup: vi.fn(async () => undefined),
  claudeCleanup: vi.fn(async () => undefined),
}));

vi.mock("./codex/codex-workflow", () => ({
  runCodexWorkflow: runtimeLocalBundleMocks.codexWorkflow,
}));

vi.mock("./claude/claude-workflow", () => ({
  runClaudeWorkflow: runtimeLocalBundleMocks.claudeWorkflow,
}));

vi.mock("./hermes/hermes-workflow", () => ({
  runHermesWorkflow: runtimeLocalBundleMocks.hermesWorkflow,
  runHermesChannelTest: runtimeLocalBundleMocks.hermesChannelTest,
}));

vi.mock("./codex/codex-cleanup", () => ({
  deleteCodexSessionArtifacts: runtimeLocalBundleMocks.codexCleanup,
}));

vi.mock("./claude/claude-cleanup", () => ({
  deleteClaudeSessionArtifacts: runtimeLocalBundleMocks.claudeCleanup,
}));

vi.mock("./workflow/agent-executor-workflow", () => ({
  runCodexWorkflow: sharedHelperMocks.codexWorkflow,
  runClaudeWorkflow: sharedHelperMocks.claudeWorkflow,
  runHermesWorkflow: sharedHelperMocks.hermesWorkflow,
  runHermesChannelTest: sharedHelperMocks.hermesChannelTest,
}));

vi.mock("./agent-executor-session-cleanup", () => ({
  deleteCodexSessionArtifacts: sharedHelperMocks.codexCleanup,
  deleteClaudeSessionArtifacts: sharedHelperMocks.claudeCleanup,
}));

describe("createRuntimeDriverRegistry", () => {
  beforeEach(() => {
    vi.resetModules();
    builderMocks.codex.mockReset();
    builderMocks.claude.mockReset();
    builderMocks.api.mockReset();
    builderMocks.hermes.mockReset();
    runtimeLocalBundleMocks.codexWorkflow.mockClear();
    runtimeLocalBundleMocks.claudeWorkflow.mockClear();
    runtimeLocalBundleMocks.hermesWorkflow.mockClear();
    runtimeLocalBundleMocks.hermesChannelTest.mockClear();
    runtimeLocalBundleMocks.codexCleanup.mockClear();
    runtimeLocalBundleMocks.claudeCleanup.mockClear();
    sharedHelperMocks.codexWorkflow.mockClear();
    sharedHelperMocks.claudeWorkflow.mockClear();
    sharedHelperMocks.hermesWorkflow.mockClear();
    sharedHelperMocks.hermesChannelTest.mockClear();
    sharedHelperMocks.codexCleanup.mockClear();
    sharedHelperMocks.claudeCleanup.mockClear();
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

    vi.doMock("./codex/create-codex-driver", () => ({
      createCodexDriver: builderMocks.codex,
    }));
    vi.doMock("./claude/create-claude-driver", () => ({
      createClaudeDriver: builderMocks.claude,
    }));
    vi.doMock("./api/create-api-driver", () => ({
      createApiDriver: builderMocks.api,
    }));
    vi.doMock("./hermes/create-hermes-driver", () => ({
      createHermesDriver: builderMocks.hermes,
    }));

    const { createRuntimeDriverRegistry } = await import("./agent-executor");

    const registry = createRuntimeDriverRegistry(options);

    expect(builderMocks.codex).toHaveBeenCalledOnce();
    expect(builderMocks.codex).toHaveBeenCalledWith(options);
    expect(builderMocks.claude).toHaveBeenCalledOnce();
    expect(builderMocks.claude).toHaveBeenCalledWith(options);
    expect(builderMocks.api).toHaveBeenCalledOnce();
    expect(builderMocks.api).toHaveBeenCalledWith(options);
    expect(builderMocks.hermes).toHaveBeenCalledOnce();
    expect(builderMocks.hermes).toHaveBeenCalledWith(options);

    expect(registry.driverFor("codex")).toBe(drivers.codex);
    expect(registry.driverFor("claude")).toBe(drivers.claude);
    expect(registry.driverFor("api")).toBe(drivers.api);
    expect(registry.driverFor("hermes")).toBe(drivers.hermes);
  });

  test("runtime-local builders own workflow and cleanup hooks", async () => {
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
    vi.doUnmock("./api/create-api-driver");
    vi.doUnmock("./hermes/create-hermes-driver");

    const [{ createCodexDriver }, { createClaudeDriver }, { createHermesDriver }] = await Promise.all([
      import("./codex/create-codex-driver"),
      import("./claude/create-claude-driver"),
      import("./hermes/create-hermes-driver"),
    ]);

    const codexDriver = createCodexDriver(options);
    const claudeDriver = createClaudeDriver(options);
    const hermesDriver = createHermesDriver(options);

    expect(codexDriver.askWorkflow).toBeTypeOf("function");
    expect(codexDriver.deleteSessionArtifacts).toBeTypeOf("function");
    expect(claudeDriver.askWorkflow).toBeTypeOf("function");
    expect(claudeDriver.deleteSessionArtifacts).toBeTypeOf("function");
    expect(hermesDriver.askWorkflow).toBeTypeOf("function");

    await codexDriver.askWorkflow?.(workflowInput);
    await codexDriver.deleteSessionArtifacts?.(cleanupInput);
    await claudeDriver.askWorkflow?.(workflowInput);
    await claudeDriver.deleteSessionArtifacts?.(cleanupInput);
    await hermesDriver.askWorkflow?.(workflowInput);
    await hermesDriver.testChannel?.(channelTestInput);

    expect(runtimeLocalBundleMocks.codexWorkflow).toHaveBeenCalledOnce();
    expect(runtimeLocalBundleMocks.codexCleanup).toHaveBeenCalledOnce();
    expect(runtimeLocalBundleMocks.claudeWorkflow).toHaveBeenCalledOnce();
    expect(runtimeLocalBundleMocks.claudeCleanup).toHaveBeenCalledOnce();
    expect(runtimeLocalBundleMocks.hermesWorkflow).toHaveBeenCalledOnce();
    expect(runtimeLocalBundleMocks.hermesChannelTest).toHaveBeenCalledOnce();

    expect(sharedHelperMocks.codexWorkflow).not.toHaveBeenCalled();
    expect(sharedHelperMocks.codexCleanup).not.toHaveBeenCalled();
    expect(sharedHelperMocks.claudeWorkflow).not.toHaveBeenCalled();
    expect(sharedHelperMocks.claudeCleanup).not.toHaveBeenCalled();
    expect(sharedHelperMocks.hermesWorkflow).not.toHaveBeenCalled();
    expect(sharedHelperMocks.hermesChannelTest).not.toHaveBeenCalled();
  });
});
