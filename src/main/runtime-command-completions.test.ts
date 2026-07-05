import { describe, expect, test } from "vitest";
import { listSlashCompletionGroupsForRuntime } from "./runtime-command-completions";

describe("runtime command completions", () => {
  test("groups app commands for codex runtimes", () => {
    expect(listSlashCompletionGroupsForRuntime({ runtimeId: "codex", input: "/" })).toEqual([
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

  test("adds codex metadata and learned native suggestions for the active fingerprint", () => {
    expect(
      listSlashCompletionGroupsForRuntime({
        runtimeId: "codex",
        input: "/",
        cliFingerprint: "codex|0.136.0|team-a",
        codexModels: [{ id: "gpt-5.5" }],
        codexPlugins: [{ id: "documents@openai-primary-runtime" }],
        importedSkills: [
          {
            id: "resume-optimization",
            name: "resume-optimization",
            description: "Rewrite resumes for a target role.",
          },
        ],
        learnedNativeCommands: [
          {
            runtimeId: "codex",
            cliFingerprint: "codex|0.136.0|team-a",
            commandStem: "/memory",
            example: "/memory add release notes",
            successCount: 4,
            lastUsedAt: 1710000000000,
          },
        ],
      }),
    ).toEqual([
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
      {
        id: "native_metadata",
        label: "Native metadata",
        items: [
          {
            id: "codex:model:gpt-5.5",
            label: "/model gpt-5.5",
            insertText: "/model gpt-5.5 ",
            description: "Use a specific Codex model.",
            authoritative: true,
          },
          {
            id: "codex:plugin:documents@openai-primary-runtime",
            label: "/plugin documents@openai-primary-runtime",
            insertText: "/plugin documents@openai-primary-runtime ",
            description: "Target a Codex plugin.",
            authoritative: true,
          },
          {
            id: "codex:skill:resume-optimization",
            label: "/skill resume-optimization",
            insertText: "/skill resume-optimization ",
            description: "Rewrite resumes for a target role.",
            authoritative: true,
          },
        ],
      },
      {
        id: "suggested_native_commands",
        label: "Suggested native commands",
        items: [
          {
            id: "codex:codex|0.136.0|team-a:/memory",
            label: "/memory add release notes",
            insertText: "/memory add release notes ",
            description: "Learned from successful codex usage",
            authoritative: false,
          },
        ],
      },
    ]);
  });

  test("uses Claude command metadata and argument hints when available", () => {
    expect(
      listSlashCompletionGroupsForRuntime({
        runtimeId: "claude",
        input: "/re",
        claudeCommands: [
          {
            name: "review",
            argumentHint: "<target>",
            description: "Review a target from the current workspace.",
          },
          {
            name: "hidden",
            description: "Should stay hidden",
            userInvocable: false,
          },
        ],
      }),
    ).toEqual([
      {
        id: "native_metadata",
        label: "Native metadata",
        items: [
          {
            id: "claude:review",
            label: "/review",
            insertText: "/review <target> ",
            description: "Review a target from the current workspace.",
            authoritative: true,
          },
        ],
      },
    ]);
  });

  test("limits app commands for api runtimes and never offers native suggestions there", () => {
    expect(
      listSlashCompletionGroupsForRuntime({
        runtimeId: "api",
        input: "/",
        cliFingerprint: "api",
        learnedNativeCommands: [
          {
            runtimeId: "api",
            cliFingerprint: "api",
            commandStem: "/review",
            example: "/review",
            successCount: 3,
            lastUsedAt: 1710000000000,
          },
        ],
      }),
    ).toEqual([
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
