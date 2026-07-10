import path from "node:path";
import { describe, expect, test } from "vitest";
import { createMainAppResourceLocator } from "./app-paths";

describe("createMainAppResourceLocator", () => {
  test("constructs the main-process resource locator", () => {
    const locator = createMainAppResourceLocator({
      mainBundleDir: path.join("/workspace", "out", "main"),
      isPackaged: false,
      resourcesPath: "/unused/electron/resources",
    });

    expect(locator.rendererHtmlPath()).toBe(path.join("/workspace", "out", "renderer", "index.html"));
    expect(locator.bundledWorkflowsRoot()).toBe(
      path.join("/workspace", "out", "shared", "bundled-workflows"),
    );
  });
});
