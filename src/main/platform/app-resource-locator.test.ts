import path from "node:path";
import { describe, expect, test } from "vitest";
import { createAppResourceLocator } from "./app-resource-locator";

describe("createAppResourceLocator", () => {
  test("resolves development bundles from the build output", () => {
    const locator = createAppResourceLocator({
      mainBundleDir: path.join("/workspace", "out", "main"),
      isPackaged: false,
      resourcesPath: "/unused/electron/resources",
    });

    expect(locator.preloadBundlePath()).toBe(path.join("/workspace", "out", "preload", "index.mjs"));
    expect(locator.rendererHtmlPath()).toBe(path.join("/workspace", "out", "renderer", "index.html"));
    expect(locator.bundledSkillsRoot()).toBe(path.join("/workspace", "out", "shared", "bundled-skills"));
    expect(locator.bundledWorkflowsRoot()).toBe(
      path.join("/workspace", "out", "shared", "bundled-workflows"),
    );
    expect(locator.mcpServerBundlePath()).toBe(path.join("/workspace", "out", "mcp", "server.cjs"));
  });

  test("uses packaged resources for read-only shared assets and MCP", () => {
    const locator = createAppResourceLocator({
      mainBundleDir: "C:\\Program Files\\Multi Agent Chat\\resources\\app.asar\\out\\main",
      isPackaged: true,
      resourcesPath: "C:\\Program Files\\Multi Agent Chat\\resources",
      pathApi: path.win32,
    });

    expect(locator.preloadBundlePath()).toBe(
      "C:\\Program Files\\Multi Agent Chat\\resources\\app.asar\\out\\preload\\index.mjs",
    );
    expect(locator.rendererHtmlPath()).toBe(
      "C:\\Program Files\\Multi Agent Chat\\resources\\app.asar\\out\\renderer\\index.html",
    );
    expect(locator.bundledSkillsRoot()).toBe(
      "C:\\Program Files\\Multi Agent Chat\\resources\\shared\\bundled-skills",
    );
    expect(locator.bundledWorkflowsRoot()).toBe(
      "C:\\Program Files\\Multi Agent Chat\\resources\\shared\\bundled-workflows",
    );
    expect(locator.mcpServerBundlePath()).toBe(
      "C:\\Program Files\\Multi Agent Chat\\resources\\mcp\\server.cjs",
    );
  });
});
