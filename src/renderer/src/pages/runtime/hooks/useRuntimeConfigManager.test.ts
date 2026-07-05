import type { RuntimeCommandConfig } from "../../../../../shared/types";
import { describe, expect, test } from "vitest";
import {
  codexRuntimeAvailability,
  runtimeCommandArgsFromText,
  seedRuntimeCommandConfigs,
  upsertRuntimeCommandConfig,
} from "./useRuntimeConfigManager";

describe("codexRuntimeAvailability", () => {
  test("returns undetected before runtime probing completes", () => {
    expect(codexRuntimeAvailability([])).toEqual({
      detected: false,
      available: false,
      message: "",
    });
  });

  test("returns a friendly unavailable message when Codex CLI detection fails", () => {
    expect(
      codexRuntimeAvailability([
        {
          id: "codex",
          label: "Codex",
          command: "codex",
          version: null,
          available: false,
          error: "spawn codex ENOENT",
        },
      ]),
    ).toEqual({
      detected: true,
      available: false,
      message: "Codex CLI unavailable: spawn codex ENOENT",
    });
  });
});

describe("runtime command config helpers", () => {
  test("seed runtime executor drafts from snapshot configs and update them per runtime", () => {
    const snapshotConfigs: RuntimeCommandConfig[] = [
      {
        runtimeId: "claude",
        override: {
          executable: "/custom/bin/claude",
          fixedArgs: ["--dangerously-skip-permissions"],
        },
      },
    ];

    const seeded = seedRuntimeCommandConfigs(snapshotConfigs);
    const next = upsertRuntimeCommandConfig(seeded, "codex", () => ({
      runtimeId: "codex",
      override: {
        executable: "/custom/bin/codex",
        fixedArgs: runtimeCommandArgsFromText('--profile "team space" --sandbox workspace-write'),
      },
    }));

    expect(seeded).toEqual(snapshotConfigs);
    expect(seeded).not.toBe(snapshotConfigs);
    expect(next).toEqual([
      {
        runtimeId: "claude",
        override: {
          executable: "/custom/bin/claude",
          fixedArgs: ["--dangerously-skip-permissions"],
        },
      },
      {
        runtimeId: "codex",
        override: {
          executable: "/custom/bin/codex",
          fixedArgs: ["--profile", "team space", "--sandbox", "workspace-write"],
        },
      },
    ]);
  });
});
