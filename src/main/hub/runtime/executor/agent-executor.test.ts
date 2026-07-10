import { describe, expect, test } from "vitest";
import { createRuntimeDriverRegistry } from "./agent-executor";

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

describe("createRuntimeDriverRegistry", () => {
  test("registers all runtimes through runtime-local builder entrypoints", () => {
    const registry = createRuntimeDriverRegistry(buildOptions());
    expect(registry.driverFor("codex").runtimeId).toBe("codex");
    expect(registry.driverFor("claude").runtimeId).toBe("claude");
    expect(registry.driverFor("api").runtimeId).toBe("api");
    expect(registry.driverFor("hermes").runtimeId).toBe("hermes");
  });
});
