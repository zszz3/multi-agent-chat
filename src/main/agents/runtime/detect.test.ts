import { afterEach, describe, expect, test, vi } from "vitest";
import type { ExecutableLocator } from "../../platform/cli-locator";
import { parseCliVersion, resolveRuntimeExecutableConfiguration } from "./detect";

function identityExecutableLocator(): ExecutableLocator {
  return {
    async resolve({ executable, sourceHint }) {
      return {
        requested: executable,
        resolvedPath: executable,
        source: sourceHint ?? "path",
        kind: executable.toLowerCase().endsWith(".cmd") ? "cmd" : "script",
      };
    },
    invalidate() {},
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("parseCliVersion", () => {
  test("extracts semver-like versions from common agent output", () => {
    expect(parseCliVersion("codex-cli 0.136.0")).toBe("0.136.0");
    expect(parseCliVersion("2.1.121 (Claude Code)")).toBe("2.1.121");
    expect(parseCliVersion("claude v1.2.3-alpha\nextra")).toBe("1.2.3-alpha");
  });

  test("falls back to the first trimmed line when output has no semver", () => {
    expect(parseCliVersion("custom build\nmore")).toBe("custom build");
  });
});

describe("detectAgentRuntimes", () => {
  test("preserves explicit and environment executable sources with override precedence", () => {
    const configuration = resolveRuntimeExecutableConfiguration(
      { codex: "C:\\configured\\codex.exe" },
      {
        CODEX_PATH: "C:\\environment\\codex.cmd",
        HERMES_PATH: "C:\\environment\\hermes.cmd",
      },
    );

    expect(configuration.executables.codex).toBe("C:\\configured\\codex.exe");
    expect(configuration.sources.codex).toBe("explicit");
    expect(configuration.executables.hermes).toBe("C:\\environment\\hermes.cmd");
    expect(configuration.sources.hermes).toBe("environment");
    expect(configuration.sources.claude).toBeUndefined();
  });

  test("treats Windows codex.cmd overrides as available when exec succeeds through the launcher adapter", async () => {
    vi.resetModules();
    vi.stubEnv("CODEX_PATH", "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd");

    const execCli = vi.fn(async (request: { executable: string; args?: string[] }) => {
      if (request.executable === "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd") {
        return { stdout: "codex-cli 0.136.0\n", stderr: "" };
      }
      throw new Error(`unexpected executable: ${request.executable}`);
    });

    vi.doMock("../../platform/cli-launcher", () => ({ execCli }));
    const { detectAgentRuntimes } = await import("./detect");

    const runtimes = await detectAgentRuntimes(undefined, {
      execute: execCli,
      executableLocator: identityExecutableLocator(),
    });
    const codex = runtimes.find((runtime) => runtime.id === "codex");

    expect(codex).toMatchObject({
      id: "codex",
      command: "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd",
      available: true,
      version: "0.136.0",
      commandSource: "environment",
    });
    expect(execCli).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd",
        args: ["--version"],
      }),
    );
  });

  test("detects a Hermes CLI from HERMES_PATH", async () => {
    vi.resetModules();
    vi.stubEnv("HERMES_PATH", "C:\\Users\\demo\\AppData\\Local\\Programs\\Hermes\\hermes.cmd");

    const execCli = vi.fn(async (request: { executable: string; args?: string[] }) => {
      if (request.executable === "C:\\Users\\demo\\AppData\\Local\\Programs\\Hermes\\hermes.cmd") {
        return { stdout: "hermes-cli 1.2.3\n", stderr: "" };
      }
      throw new Error(`unexpected executable: ${request.executable}`);
    });

    vi.doMock("../../platform/cli-launcher", () => ({ execCli }));
    const { detectAgentRuntimes } = await import("./detect");

    const runtimes = await detectAgentRuntimes(undefined, {
      execute: execCli,
      executableLocator: identityExecutableLocator(),
    });
    expect(runtimes.find((runtime) => runtime.id === "hermes")).toMatchObject({
      id: "hermes",
      command: "C:\\Users\\demo\\AppData\\Local\\Programs\\Hermes\\hermes.cmd",
      available: true,
      version: "1.2.3",
    });
  });

  test("detects an OpenCode CLI from OPENCODE_PATH", async () => {
    vi.resetModules();
    vi.stubEnv("OPENCODE_PATH", "C:\\Users\\demo\\AppData\\Roaming\\npm\\opencode.cmd");
    const execCli = vi.fn(async (request: { executable: string; args?: string[] }) => {
      if (request.executable.endsWith("opencode.cmd")) return { stdout: "opencode 1.2.3\n", stderr: "" };
      throw new Error(`unexpected executable: ${request.executable}`);
    });
    vi.doMock("../../platform/cli-launcher", () => ({ execCli }));
    const { detectAgentRuntimes } = await import("./detect");
    const runtimes = await detectAgentRuntimes(undefined, {
      execute: execCli,
      executableLocator: identityExecutableLocator(),
    });
    expect(runtimes.find((runtime) => runtime.id === "opencode")).toMatchObject({
      id: "opencode",
      command: "C:\\Users\\demo\\AppData\\Roaming\\npm\\opencode.cmd",
      available: true,
      version: "1.2.3",
    });
  });

  test("detects an OpenClaw CLI from OPENCLAW_PATH", async () => {
    vi.resetModules();
    vi.stubEnv("OPENCLAW_PATH", "C:\\Users\\demo\\AppData\\Roaming\\npm\\openclaw.cmd");
    const execCli = vi.fn(async (request: { executable: string; args?: string[] }) => {
      if (request.executable.endsWith("openclaw.cmd")) return { stdout: "openclaw 2026.7.1\n", stderr: "" };
      throw new Error(`unexpected executable: ${request.executable}`);
    });
    vi.doMock("../../platform/cli-launcher", () => ({ execCli }));
    const { detectAgentRuntimes } = await import("./detect");
    const runtimes = await detectAgentRuntimes(undefined, {
      execute: execCli,
      executableLocator: identityExecutableLocator(),
    });
    expect(runtimes.find((runtime) => runtime.id === "openclaw")).toMatchObject({
      id: "openclaw",
      command: "C:\\Users\\demo\\AppData\\Roaming\\npm\\openclaw.cmd",
      available: true,
      version: "2026.7.1",
    });
  });
});
