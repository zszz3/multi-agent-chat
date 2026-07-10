import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createExecutableLocator } from "./cli-locator";

describe("createExecutableLocator", () => {
  test("normalizes explicit Windows paths without PATH lookup", async () => {
    const execute = vi.fn();
    const locator = createExecutableLocator({
      platform: "win32",
      cwd: "C:\\workspace",
      environment: {},
      execute,
      pathApi: path.win32,
    });

    await expect(locator.resolve({ executable: ".\\tools\\codex.exe" })).resolves.toEqual({
      requested: ".\\tools\\codex.exe",
      resolvedPath: "C:\\workspace\\tools\\codex.exe",
      source: "explicit",
      kind: "exe",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test("uses the first where.exe result for a bare Windows command", async () => {
    const execute = vi.fn(async () => ({
      stdout: "C:\\Users\\Demo User\\AppData\\Roaming\\npm\\codex.cmd\r\nC:\\tools\\codex.exe\r\n",
      stderr: "",
    }));
    const locator = createExecutableLocator({
      platform: "win32",
      environment: {},
      execute,
      pathApi: path.win32,
    });

    await expect(locator.resolve({ executable: "codex" })).resolves.toEqual({
      requested: "codex",
      resolvedPath: "C:\\Users\\Demo User\\AppData\\Roaming\\npm\\codex.cmd",
      source: "path",
      kind: "cmd",
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      executable: "where.exe",
      args: ["codex"],
    }));
  });

  test("falls back to the user npm shim when PATH lookup misses", async () => {
    const execute = vi.fn(async () => {
      throw new Error("not found");
    });
    const fileExists = vi.fn(async (filePath: string) => filePath.endsWith("\\npm\\openclaw.cmd"));
    const locator = createExecutableLocator({
      platform: "win32",
      environment: { APPDATA: "C:\\Users\\Demo User\\AppData\\Roaming" },
      execute,
      fileExists,
      pathApi: path.win32,
    });

    await expect(locator.resolve({ executable: "openclaw" })).resolves.toEqual({
      requested: "openclaw",
      resolvedPath: "C:\\Users\\Demo User\\AppData\\Roaming\\npm\\openclaw.cmd",
      source: "known-location",
      kind: "cmd",
    });
  });

  test("preserves bare commands on non-Windows platforms", async () => {
    const execute = vi.fn();
    const locator = createExecutableLocator({
      platform: "darwin",
      environment: {},
      execute,
    });

    await expect(locator.resolve({ executable: "claude" })).resolves.toEqual({
      requested: "claude",
      resolvedPath: "claude",
      source: "path",
      kind: "script",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test("preserves an environment source hint after Windows PATH resolution", async () => {
    const execute = vi.fn(async () => ({
      stdout: "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd\r\n",
      stderr: "",
    }));
    const locator = createExecutableLocator({
      platform: "win32",
      environment: {},
      execute,
      pathApi: path.win32,
    });

    await expect(locator.resolve({ executable: "codex", sourceHint: "environment" })).resolves.toMatchObject({
      resolvedPath: "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd",
      source: "environment",
    });
  });

  test("caches concurrent resolution for a bounded TTL and supports explicit invalidation", async () => {
    let currentTime = 1_000;
    const execute = vi.fn(async () => ({ stdout: "C:\\tools\\codex.exe\r\n", stderr: "" }));
    const locator = createExecutableLocator({
      platform: "win32",
      environment: {},
      execute,
      pathApi: path.win32,
      cacheTtlMs: 30_000,
      now: () => currentTime,
    });

    await Promise.all([
      locator.resolve({ executable: "codex" }),
      locator.resolve({ executable: "codex" }),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);

    currentTime += 30_001;
    await locator.resolve({ executable: "codex" });
    expect(execute).toHaveBeenCalledTimes(2);

    locator.invalidate();
    await locator.resolve({ executable: "codex" });
    expect(execute).toHaveBeenCalledTimes(3);
  });
});
