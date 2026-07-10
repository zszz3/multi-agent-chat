import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadRuntimeExecutableOverrides, saveRuntimeExecutableOverrides } from "./executable-config-store";

const temporaryDirectories: string[] = [];

async function temporaryConfigPath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "runtime-executables-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "runtime-executables.json");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runtime executable configuration", () => {
  test("treats a missing file as no overrides", async () => {
    await expect(loadRuntimeExecutableOverrides(await temporaryConfigPath())).resolves.toEqual({});
  });

  test("persists only trimmed paths for known runtimes", async () => {
    const configPath = await temporaryConfigPath();
    await saveRuntimeExecutableOverrides(configPath, {
      codex: "  C:\\Tools\\codex.exe  ",
      hermes: "",
    });

    await expect(loadRuntimeExecutableOverrides(configPath)).resolves.toEqual({
      codex: "C:\\Tools\\codex.exe",
    });
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      executables: { codex: "C:\\Tools\\codex.exe" },
    });
  });

  test("ignores unknown runtime ids and non-string values", async () => {
    const configPath = await temporaryConfigPath();
    await writeFile(configPath, JSON.stringify({
      executables: { codex: "C:\\codex.cmd", unknown: "unsafe.exe", claude: 42 },
    }), "utf8");

    await expect(loadRuntimeExecutableOverrides(configPath)).resolves.toEqual({ codex: "C:\\codex.cmd" });
  });
});
