import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  loadOptionalRuntimeCommandState,
  loadRuntimeCommandState,
  recordNativeCommandFailure,
  recordNativeCommandSuccess,
  saveRuntimeCommandState,
} from "./runtime-command-store";

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

  test("learns a successful native slash command under the current fingerprint", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-command-store-"));
    const state = await loadRuntimeCommandState(path.join(dir, "runtime-command-state.json"));

    const next = recordNativeCommandSuccess(state, {
      runtimeId: "codex",
      cliFingerprint: "codex|0.136.0|cmd",
      prompt: "/model gpt-5.5",
      at: 1710000000000,
    });

    expect(next.learnedNativeCommands).toEqual([
      expect.objectContaining({
        runtimeId: "codex",
        cliFingerprint: "codex|0.136.0|cmd",
        commandStem: "/model",
        example: "/model gpt-5.5",
        successCount: 1,
        lastUsedAt: 1710000000000,
      }),
    ]);
  });

  test("evicts a learned native command immediately after explicit invalid command evidence", () => {
    const store = {
      version: 1 as const,
      runtimeCommandConfigs: [],
      learnedNativeCommands: [
        {
          runtimeId: "claude" as const,
          cliFingerprint: "claude|2.1.121|path",
          commandStem: "/review",
          example: "/review",
          successCount: 3,
          lastUsedAt: 1710000000000,
        },
      ],
    };

    const next = recordNativeCommandFailure(store, {
      runtimeId: "claude",
      cliFingerprint: "claude|2.1.121|path",
      prompt: "/review",
      classification: "invalid_command",
    });

    expect(next.learnedNativeCommands).toEqual([]);
  });

  test("does not evict learned suggestions on transport failure", () => {
    const store = {
      version: 1 as const,
      runtimeCommandConfigs: [],
      learnedNativeCommands: [
        {
          runtimeId: "claude" as const,
          cliFingerprint: "claude|2.1.121|path",
          commandStem: "/review",
          example: "/review",
          successCount: 3,
          lastUsedAt: 1710000000000,
        },
      ],
    };

    const next = recordNativeCommandFailure(store, {
      runtimeId: "claude",
      cliFingerprint: "claude|2.1.121|path",
      prompt: "/review",
      classification: "transport_failure",
    });

    expect(next.learnedNativeCommands).toEqual(store.learnedNativeCommands);
  });
});
