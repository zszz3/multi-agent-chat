import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolvePreloadBundlePath } from "./app-paths";

describe("resolvePreloadBundlePath", () => {
  test("points the main bundle at the built preload bundle", () => {
    const mainBundleDir = path.join("/workspace", "out", "main");

    expect(resolvePreloadBundlePath(mainBundleDir)).toBe(
      path.join("/workspace", "out", "preload", "index.mjs"),
    );
  });
});
