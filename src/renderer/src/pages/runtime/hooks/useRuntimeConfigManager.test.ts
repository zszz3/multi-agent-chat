import { describe, expect, test } from "vitest";
import {
  codexRuntimeAvailability,
  configuredAgentBlockingChannelDelete,
  confirmConfigSwitch,
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

describe("confirmConfigSwitch", () => {
  test("saves dirty config before switching and stops when the user cancels", async () => {
    const save = async () => undefined;
    await expect(confirmConfigSwitch(false, () => false, save)).resolves.toBe(true);
    await expect(confirmConfigSwitch(true, () => false, save)).resolves.toBe(false);
    await expect(confirmConfigSwitch(true, () => true, save)).resolves.toBe(true);
  });
});

describe("configuredAgentBlockingChannelDelete", () => {
  test("allows deleting channels referenced only by generated managed agents", () => {
    expect(configuredAgentBlockingChannelDelete([
      {
        id: "runtime-agent:custom-channel",
        name: "Custom Channel",
        description: "",
        runtimeAgentId: "api",
        channelId: "custom-channel",
        modelId: "default",
        tags: [],
        managed: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ], "custom-channel")).toBeUndefined();
  });

  test("keeps channels referenced by user-managed agent configurations", () => {
    expect(configuredAgentBlockingChannelDelete([
      {
        id: "review-agent",
        name: "Review Agent",
        description: "",
        runtimeAgentId: "api",
        channelId: "custom-channel",
        modelId: "default",
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ], "custom-channel")?.id).toBe("review-agent");
  });
});
