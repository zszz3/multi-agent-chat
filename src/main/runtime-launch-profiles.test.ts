import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildCliFingerprint, createRuntimeLaunchProfiles } from "./runtime-launch-profiles";

describe("createRuntimeLaunchProfiles", () => {
  test("prefers app-level overrides over environment and path defaults", async () => {
    const probeCalls: string[] = [];
    const profile = createRuntimeLaunchProfiles({
      shellPathLookup: async () => null,
      probeVersion: async ({ executable }) => {
        probeCalls.push(executable);
        if (executable === "/custom/bin/codex") return "0.136.0";
        throw new Error(`unexpected executable: ${executable}`);
      },
    }).driverFor("codex");

    const resolved = await profile.resolveCommand({
      runtimeId: "codex",
      override: { executable: "/custom/bin/codex", fixedArgs: ["--profile", "team-a"] },
      env: { CODEX_PATH: "/env/bin/codex" },
      platform: "darwin",
    });

    expect(resolved).toMatchObject({
      executable: "/custom/bin/codex",
      fixedArgs: ["--profile", "team-a"],
      command: "/custom/bin/codex",
      source: "app_override",
      version: "0.136.0",
      available: true,
    });
    expect(probeCalls).toEqual(["/custom/bin/codex"]);
  });

  test("hydrates PATH from the login shell for darwin GUI launches", async () => {
    const probeCalls: string[] = [];
    const profile = createRuntimeLaunchProfiles({
      shellPathLookup: async () => ["/opt/homebrew/bin"],
      probeVersion: async ({ executable }) => {
        probeCalls.push(executable);
        if (executable === "claude") throw new Error("spawn claude ENOENT");
        if (executable === path.posix.join("/opt/homebrew/bin", "claude")) return "2.1.121";
        throw new Error(`unexpected executable: ${executable}`);
      },
    }).driverFor("claude");

    const resolved = await profile.resolveCommand({
      runtimeId: "claude",
      env: {},
      platform: "darwin",
    });

    expect(resolved).toMatchObject({
      executable: path.posix.join("/opt/homebrew/bin", "claude"),
      command: path.posix.join("/opt/homebrew/bin", "claude"),
      source: "shell_hydrated_path",
      version: "2.1.121",
      available: true,
    });
    expect(probeCalls).toEqual(["claude", path.posix.join("/opt/homebrew/bin", "claude")]);
  });

  test("changes the cli fingerprint when executable, fixed args, or version changes", () => {
    const base = buildCliFingerprint({
      executable: "codex",
      fixedArgs: ["--profile", "a"],
      version: "0.136.0",
    });

    expect(base).not.toBe(
      buildCliFingerprint({
        executable: "codex",
        fixedArgs: ["--profile", "b"],
        version: "0.136.0",
      }),
    );
    expect(base).not.toBe(
      buildCliFingerprint({
        executable: "/usr/local/bin/codex",
        fixedArgs: ["--profile", "a"],
        version: "0.136.0",
      }),
    );
    expect(base).not.toBe(
      buildCliFingerprint({
        executable: "codex",
        fixedArgs: ["--profile", "a"],
        version: "0.137.0",
      }),
    );
  });
});
