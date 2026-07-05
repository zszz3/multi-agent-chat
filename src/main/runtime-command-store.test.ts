import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadOptionalRuntimeCommandState, loadRuntimeCommandState, saveRuntimeCommandState } from "./runtime-command-store";

describe("runtime command state", () => {
  test("loads an empty state when the file does not exist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-command-store-"));
    const state = await loadRuntimeCommandState(path.join(dir, "missing.json"));

    expect(state).toEqual({
      version: 1,
      runtimeCommandConfigs: [],
      learnedNativeCommands: [],
    });
  });

  test("treats a corrupt sidecar as unavailable instead of throwing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-command-store-"));
    const filePath = path.join(dir, "corrupt.json");
    await writeFile(filePath, "{", "utf8");

    await expect(loadOptionalRuntimeCommandState(filePath)).resolves.toBeUndefined();
    await expect(loadRuntimeCommandState(filePath)).resolves.toEqual({
      version: 1,
      runtimeCommandConfigs: [],
      learnedNativeCommands: [],
    });
  });

  test("saves runtime configs and learned commands in deterministic order", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-command-store-"));
    const filePath = path.join(dir, "runtime-command-state.json");

    await saveRuntimeCommandState(filePath, {
      version: 1,
      runtimeCommandConfigs: [
        { runtimeId: "claude", override: { executable: "/usr/local/bin/claude" } },
        { runtimeId: "codex", override: { executable: "/usr/local/bin/codex", fixedArgs: ["--profile", "team-a"] } },
      ],
      learnedNativeCommands: [
        {
          runtimeId: "claude",
          cliFingerprint: "claude|2.1.121|default",
          commandStem: "/review",
          example: "/review",
          successCount: 2,
          lastUsedAt: 1710000000200,
        },
        {
          runtimeId: "codex",
          cliFingerprint: "codex|0.136.0|team-a",
          commandStem: "/model",
          example: "/model gpt-5.5",
          successCount: 3,
          lastUsedAt: 1710000000100,
        },
      ],
    });

    const parsed = JSON.parse(await readFile(filePath, "utf8")) as {
      version: number;
      runtimeCommandConfigs: Array<{ runtimeId: string }>;
      learnedNativeCommands: Array<{ runtimeId: string; commandStem: string }>;
    };

    expect(parsed).toEqual({
      version: 1,
      runtimeCommandConfigs: [
        { runtimeId: "claude", override: { executable: "/usr/local/bin/claude" } },
        { runtimeId: "codex", override: { executable: "/usr/local/bin/codex", fixedArgs: ["--profile", "team-a"] } },
      ],
      learnedNativeCommands: [
        { runtimeId: "claude", cliFingerprint: "claude|2.1.121|default", commandStem: "/review", example: "/review", successCount: 2, lastUsedAt: 1710000000200 },
        { runtimeId: "codex", cliFingerprint: "codex|0.136.0|team-a", commandStem: "/model", example: "/model gpt-5.5", successCount: 3, lastUsedAt: 1710000000100 },
      ],
    });
  });
});
