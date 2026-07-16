import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolveBundledWorkflowsPath, resolvePreloadBundlePath } from "./app-paths";

describe("resolvePreloadBundlePath", () => {
  test("points the main bundle at the built preload bundle", () => {
    const mainBundleDir = path.join("/workspace", "out", "main");

    expect(resolvePreloadBundlePath(mainBundleDir)).toBe(
      path.join("/workspace", "out", "preload", "index.mjs"),
    );
  });
});

describe("resolveBundledWorkflowsPath", () => {
  test("points the main bundle at copied bundled workflow assets", () => {
    const mainBundleDir = path.join("/workspace", "out", "main");

    expect(resolveBundledWorkflowsPath(mainBundleDir)).toBe(
      path.join("/workspace", "out", "shared", "bundled-workflows"),
    );
  });
});
