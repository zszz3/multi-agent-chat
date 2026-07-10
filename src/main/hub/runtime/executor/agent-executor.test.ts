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

vi.mock("./codex/create-codex-driver", () => ({
  createCodexDriver: builderMocks.codex,
}));

vi.mock("./claude/create-claude-driver", () => ({
  createClaudeDriver: builderMocks.claude,
}));

vi.mock("./api/create-api-driver", () => ({
  createApiDriver: builderMocks.api,
}));

vi.mock("./hermes/create-hermes-driver", () => ({
  createHermesDriver: builderMocks.hermes,
}));

describe("createRuntimeDriverRegistry", () => {
  beforeEach(() => {
    vi.resetModules();
    builderMocks.codex.mockReset();
    builderMocks.claude.mockReset();
    builderMocks.api.mockReset();
    builderMocks.hermes.mockReset();
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
});
