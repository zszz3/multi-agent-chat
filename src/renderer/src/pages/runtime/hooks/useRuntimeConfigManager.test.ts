import { describe, expect, test } from "vitest";
import { codexRuntimeAvailability } from "./useRuntimeConfigManager";

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
