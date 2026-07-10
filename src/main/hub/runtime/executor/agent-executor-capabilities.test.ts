import { describe, expect, test } from "vitest";
import type { AgentRuntime } from "../../../shared/types";
import { createRuntimeDriverRegistry } from "./agent-executor";
import { getApiCapabilities, apiSurfaceSupport } from "./api/api-capabilities";
import { getClaudeCapabilities, claudeSurfaceSupport } from "./claude/claude-capabilities";
import { getCodexCapabilities, codexSurfaceSupport } from "./codex/codex-capabilities";
import { getHermesCapabilities, hermesSurfaceSupport } from "./hermes/hermes-capabilities";

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

function runtime(id: AgentRuntime["id"]): AgentRuntime {
  return {
    id,
    label: id.toUpperCase(),
    command: id,
    version: "test",
    available: true,
  };
}

describe("runtime capability declarations", () => {
  test("exposes each runtime's support matrix and capability contract through the runtime driver registry", () => {
    const registry = createRuntimeDriverRegistry(buildOptions());

    expect(registry.driverFor("codex").surfaceSupport).toEqual(codexSurfaceSupport);
    expect(registry.driverFor("codex").getCapabilities(runtime("codex"))).toEqual(getCodexCapabilities(runtime("codex")));

    expect(registry.driverFor("claude").surfaceSupport).toEqual(claudeSurfaceSupport);
    expect(registry.driverFor("claude").getCapabilities(runtime("claude"))).toEqual(
      getClaudeCapabilities(runtime("claude")),
    );

    expect(registry.driverFor("api").surfaceSupport).toEqual(apiSurfaceSupport);
    expect(registry.driverFor("api").getCapabilities(runtime("api"))).toEqual(getApiCapabilities(runtime("api")));

    expect(registry.driverFor("hermes").surfaceSupport).toEqual(hermesSurfaceSupport);
    expect(registry.driverFor("hermes").getCapabilities(runtime("hermes"))).toEqual(
      getHermesCapabilities(runtime("hermes")),
    );
  });

  test("keeps chat execution ownership explicit per runtime", () => {
    expect(getCodexCapabilities(runtime("codex")).chatStyle).toBe("interactive");
    expect(getClaudeCapabilities(runtime("claude")).chatStyle).toBe("interactive");
    expect(getApiCapabilities(runtime("api")).chatStyle).toBe("oneshot");
    expect(getHermesCapabilities(runtime("hermes")).chatStyle).toBe("oneshot");
  });
});
