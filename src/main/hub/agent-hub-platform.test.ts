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
});
