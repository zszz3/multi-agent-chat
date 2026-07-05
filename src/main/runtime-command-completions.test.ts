import { describe, expect, test } from "vitest";
import type { AppSnapshot } from "../shared/types";
import { listSlashCompletionGroupsForChat, listSlashCompletionGroupsForRuntime } from "./runtime-command-completions";

const snapshot: Pick<AppSnapshot, "chats" | "configuredAgents" | "channels"> = {
  chats: [
    {
      id: "codex-chat",
      title: "Codex chat",
      configuredAgentId: "codex-agent",
      modelId: "gpt-5.5",
      sessionId: undefined,
      running: false,
      messages: [],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
    {
      id: "claude-chat",
      title: "Claude chat",
      configuredAgentId: "claude-agent",
      modelId: "sonnet",
      sessionId: undefined,
      running: false,
      messages: [],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
  ],
  configuredAgents: [
    {
      id: "codex-agent",
      name: "Codex Agent",
      description: "",
      runtimeAgentId: "codex",
      channelId: "codex-openai",
      modelId: "gpt-5.5",
      tags: [],
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
    {
      id: "claude-agent",
      name: "Claude Agent",
      description: "",
      runtimeAgentId: "claude",
      channelId: "claude-default",
      modelId: "sonnet",
      tags: [],
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
  ],
  channels: [
    { id: "codex-openai", agentId: "codex", label: "Codex OpenAI", models: [] },
    { id: "claude-default", agentId: "claude", label: "Claude", models: [] },
  ],
};

describe("runtime command completions", () => {
  test("groups app commands for codex chats", () => {
    expect(listSlashCompletionGroupsForChat(snapshot, "codex-chat", "/")).toEqual([
      {
        id: "app_commands",
        label: "App commands",
        items: [
          {
            id: "app:help",
            label: "/app help",
            insertText: "/app help ",
            description: "Show app-local commands.",
            authoritative: true,
          },
          {
            id: "app:status",
            label: "/app status",
            insertText: "/app status ",
            description: "Read Codex app-server config, model, plugin, and MCP status.",
            authoritative: true,
          },
          {
            id: "app:models",
            label: "/app models",
            insertText: "/app models ",
            description: "List models from Codex app-server.",
            authoritative: true,
          },
          {
            id: "app:plugins",
            label: "/app plugins",
            insertText: "/app plugins ",
            description: "List Codex plugins from app-server marketplaces.",
            authoritative: true,
          },
        ],
      },
    ]);
  });

  test("limits app commands for non-codex runtimes", () => {
    expect(listSlashCompletionGroupsForRuntime({ runtimeId: "claude", input: "/" })).toEqual([
      {
        id: "app_commands",
        label: "App commands",
        items: [
          {
            id: "app:help",
            label: "/app help",
            insertText: "/app help ",
            description: "Show app-local commands.",
            authoritative: true,
          },
        ],
      },
    ]);
  });

  test("returns no groups once the input is no longer a completion prefix", () => {
    expect(listSlashCompletionGroupsForRuntime({ runtimeId: "codex", input: "/app help" })).toEqual([]);
    expect(listSlashCompletionGroupsForRuntime({ runtimeId: "codex", input: "hello" })).toEqual([]);
  });
});
