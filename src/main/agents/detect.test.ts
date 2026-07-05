import { afterEach, describe, expect, test, vi } from "vitest";
import { parseCliVersion } from "./detect";

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
  test("passes app runtime overrides into launch profile detection and preserves metadata", async () => {
    vi.resetModules();

    const codexResolveCommand = vi.fn(async () => ({
      runtimeId: "codex" as const,
      executable: "/custom/bin/codex",
      fixedArgs: ["--profile", "team-a"],
      command: "/custom/bin/codex",
      source: "app_override" as const,
      version: "0.136.0",
      fingerprint: "codex|custom|0.136.0",
      available: true,
    }));
    const claudeResolveCommand = vi.fn(async () => ({
      runtimeId: "claude" as const,
      executable: "claude",
      fixedArgs: [],
      command: "claude",
      source: "path" as const,
      version: "2.1.121",
      fingerprint: "claude|path|2.1.121",
      available: true,
    }));

    vi.doMock("../runtime-launch-profiles", () => ({
      createRuntimeLaunchProfiles: () => ({
        driverFor: (runtimeId: "codex" | "claude") =>
          runtimeId === "codex"
            ? { label: "Codex", resolveCommand: codexResolveCommand }
            : { label: "Claude Code", resolveCommand: claudeResolveCommand },
      }),
    }));
    const { detectAgentRuntimes } = await import("./detect");

    const runtimes = await detectAgentRuntimes({
      runtimeCommandConfigs: [{ runtimeId: "codex", override: { executable: "/custom/bin/codex", fixedArgs: ["--profile", "team-a"] } }],
      env: { CODEX_PATH: "/env/bin/codex" },
      platform: "darwin",
    });

    expect(codexResolveCommand).toHaveBeenCalledWith({
      runtimeId: "codex",
      override: { executable: "/custom/bin/codex", fixedArgs: ["--profile", "team-a"] },
      env: { CODEX_PATH: "/env/bin/codex" },
      platform: "darwin",
    });
    expect(runtimes.find((runtime) => runtime.id === "codex")).toMatchObject({
      command: "/custom/bin/codex",
      fixedArgs: ["--profile", "team-a"],
      source: "app_override",
      fingerprint: "codex|custom|0.136.0",
      available: true,
    });
    expect(runtimes.find((runtime) => runtime.id === "api")).toMatchObject({
      id: "api",
      source: "path",
      fingerprint: "api",
      available: true,
    });
  });

  test("treats Windows codex.cmd overrides as available when exec succeeds through the launcher adapter", async () => {
    vi.resetModules();
    vi.doUnmock("../runtime-launch-profiles");
    vi.stubEnv("CODEX_PATH", "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd");

    const execCli = vi.fn(async (request: { executable: string; args?: string[] }) => {
      if (request.executable === "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd") {
        return { stdout: "codex-cli 0.136.0\n", stderr: "" };
      }
      throw new Error(`unexpected executable: ${request.executable}`);
    });

    vi.doMock("../cli-launcher", () => ({ execCli }));
    const { detectAgentRuntimes } = await import("./detect");

    const runtimes = await detectAgentRuntimes();
    const codex = runtimes.find((runtime) => runtime.id === "codex");

    expect(codex).toMatchObject({
      id: "codex",
      command: "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd",
      available: true,
      version: "0.136.0",
      source: "env_override",
    });
    expect(execCli).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd",
        args: ["--version"],
      }),
    );
  });
});
