import { describe, expect, test } from "vitest";
import { routeChatPrompt } from "./chat-command-router";

describe("routeChatPrompt", () => {
  test("defaults /app to help", () => {
    expect(routeChatPrompt("codex", "/app")).toEqual({
      kind: "app_command",
      commandId: "help",
      commandText: "/app help",
      args: [],
    });
  });

  test.each([
    ["/app help", "help"],
    ["/app status", "status"],
    ["/app models", "models"],
    ["/app plugins", "plugins"],
  ] as const)("routes %s as an app-owned command", (input, commandId) => {
    expect(routeChatPrompt("codex", input)).toEqual({
      kind: "app_command",
      commandId,
      commandText: `/app ${commandId}`,
      args: [],
    });
  });

  test("routes /app commands with non-space whitespace separators, case-insensitively", () => {
    expect(routeChatPrompt("codex", "/APP\tplugins list")).toEqual({
      kind: "app_command",
      commandId: "plugins",
      commandText: "/app plugins",
      args: ["list"],
    });
  });

  test("routes arg-bearing /app commands", () => {
    expect(routeChatPrompt("codex", "/app plugins list")).toEqual({
      kind: "app_command",
      commandId: "plugins",
      commandText: "/app plugins",
      args: ["list"],
    });
  });

  test("routes bare slash to the runtime for codex and claude", () => {
    expect(routeChatPrompt("codex", "/help")).toEqual({ kind: "runtime_slash", prompt: "/help" });
    expect(routeChatPrompt("claude", "/status")).toEqual({ kind: "runtime_slash", prompt: "/status" });
  });

  test("rejects bare slash honestly for api runtimes", () => {
    expect(routeChatPrompt("api", "/help")).toEqual({
      kind: "unsupported_runtime_slash",
      prompt: "/help",
      reason: "Native slash commands are not supported by API runtimes. Use /app help for app-local commands.",
    });
  });

  test("leaves plain prompts untouched", () => {
    expect(routeChatPrompt("claude", "hello")).toEqual({ kind: "plain_prompt", prompt: "hello" });
  });
});
