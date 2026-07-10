import { describe, expect, test, vi } from "vitest";
import type { AppResourceLocator } from "./app-resource-locator";
import type { ProcessLauncher } from "./cli-launcher";
import { createPlatformServices } from "./platform-services";
import type { ProcessTreeController } from "./process-tree";

const resourceLocator: AppResourceLocator = {
  preloadBundlePath: () => "preload",
  rendererHtmlPath: () => "renderer",
  bundledSkillsRoot: () => "skills",
  bundledWorkflowsRoot: () => "workflows",
  mcpServerBundlePath: () => "mcp",
};

const processTreeController: ProcessTreeController = {
  async terminate() {},
};

function fakeProcessLauncher(stdout = ""): ProcessLauncher & { exec: ReturnType<typeof vi.fn> } {
  return {
    spawn: () => {
      throw new Error("spawn must not be called by executable discovery");
    },
    exec: vi.fn(async () => ({ stdout, stderr: "" })),
  };
}

describe("createPlatformServices", () => {
  test.each([
    {
      platform: "win32" as const,
      cwd: "C:\\workspace",
      executable: ".\\tools\\codex.exe",
      resolvedPath: "C:\\workspace\\tools\\codex.exe",
      separator: "\\",
      caseSensitive: false,
    },
    {
      platform: "darwin" as const,
      cwd: "/workspace",
      executable: "./tools/codex",
      resolvedPath: "/workspace/tools/codex",
      separator: "/",
      caseSensitive: true,
    },
    {
      platform: "linux" as const,
      cwd: "/workspace",
      executable: "./tools/codex",
      resolvedPath: "/workspace/tools/codex",
      separator: "/",
      caseSensitive: true,
    },
  ])("constructs $platform services without using the host platform", async (fixture) => {
    const processLauncher = fakeProcessLauncher();
    const services = createPlatformServices(fixture.platform, {
      resourceLocator,
      processTreeController,
      processLauncher,
      environment: {},
      cwd: fixture.cwd,
    });

    await expect(services.executableLocator.resolve({ executable: fixture.executable })).resolves.toMatchObject({
      resolvedPath: fixture.resolvedPath,
      source: "explicit",
    });
    expect(services.pathPolicy.pathApi.sep).toBe(fixture.separator);
    expect(services.pathPolicy.caseSensitive).toBe(fixture.caseSensitive);
    expect(services.processLauncher).toBe(processLauncher);
    expect(services.processTreeController).toBe(processTreeController);
    expect(services.resourceLocator).toBe(resourceLocator);
    expect(processLauncher.exec).not.toHaveBeenCalled();
  });

  test("routes Windows PATH discovery through the injected launcher", async () => {
    const processLauncher = fakeProcessLauncher("C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd\r\n");
    const services = createPlatformServices("win32", {
      resourceLocator,
      processTreeController,
      processLauncher,
      environment: {},
    });

    await expect(services.executableLocator.resolve({ executable: "codex" })).resolves.toMatchObject({
      resolvedPath: "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd",
      source: "path",
      kind: "cmd",
    });
    expect(processLauncher.exec).toHaveBeenCalledWith(expect.objectContaining({
      executable: "where.exe",
      args: ["codex"],
    }));
  });

  test("rejects unsupported desktop platforms explicitly", () => {
    expect(() => createPlatformServices("freebsd", {
      resourceLocator,
      processTreeController,
      processLauncher: fakeProcessLauncher(),
    })).toThrow("Unsupported desktop platform: freebsd");
  });
});
