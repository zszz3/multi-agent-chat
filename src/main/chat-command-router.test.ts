import { describe, expect, test } from "vitest";
import { routeChatPrompt } from "./chat-command-router";

describe("routeChatPrompt", () => {
  test("routes /app help as an app-owned command", () => {
    expect(routeChatPrompt("codex", "/app help")).toEqual({
      kind: "app_command",
      commandId: "help",
      commandText: "/app help",
      args: [],
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
