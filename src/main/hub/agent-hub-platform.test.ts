import { describe, expect, test, vi } from "vitest";
import { AgentHub } from "./agent-hub";
import type { AppResourceLocator } from "../platform/app-resource-locator";
import { createPlatformServices } from "../platform/platform-services";

const resourceLocator: AppResourceLocator = {
  preloadBundlePath: () => "preload",
  rendererHtmlPath: () => "renderer",
  bundledSkillsRoot: () => "skills",
  bundledWorkflowsRoot: () => "workflows",
  mcpServerBundlePath: () => "mcp",
};

describe("AgentHub platform discovery", () => {
  test("invalidates executable discovery before an explicit Agent refresh", async () => {
    const execute = vi.fn(async () => ({ stdout: "runtime 1.2.3\n", stderr: "" }));
    const platformServices = createPlatformServices("darwin", {
      resourceLocator,
      processLauncher: {
        spawn: () => {
          throw new Error("spawn is not used during Runtime detection");
        },
        exec: execute,
      },
      environment: {},
    });
    const invalidate = vi.spyOn(platformServices.executableLocator, "invalidate");
    const hub = new AgentHub({}, undefined, undefined, undefined, platformServices);

    const snapshot = await hub.refreshAgents();

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(snapshot.runtimes.find((runtime) => runtime.id === "codex")).toMatchObject({
      available: true,
      commandSource: "path",
    });
  });

  test("reconfigures existing Runtime drivers through the shared executable record", async () => {
    const execute = vi.fn(async () => ({ stdout: "runtime 1.2.3\n", stderr: "" }));
    const platformServices = createPlatformServices("darwin", {
      resourceLocator,
      processLauncher: {
        spawn: () => {
          throw new Error("spawn is not used during Runtime detection");
        },
        exec: execute,
      },
      environment: {},
    });
    const hub = new AgentHub({}, undefined, undefined, undefined, platformServices);

    hub.replaceRuntimeExecutableOverrides({ codex: "/Applications/Codex CLI/codex" });
    const configured = await hub.refreshAgents();
    expect(hub.getRuntimeExecutableOverrides()).toEqual({ codex: "/Applications/Codex CLI/codex" });
    expect(configured.runtimes.find((runtime) => runtime.id === "codex")).toMatchObject({
      command: "/Applications/Codex CLI/codex",
      commandSource: "explicit",
    });

    hub.replaceRuntimeExecutableOverrides({});
    const reset = await hub.refreshAgents();
    expect(reset.runtimes.find((runtime) => runtime.id === "codex")).toMatchObject({
      command: "codex",
      commandSource: "path",
    });
  });
});
