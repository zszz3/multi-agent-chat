import { APP_COMMANDS, APP_COMMAND_PREFIX, type AppCommandId } from "../shared/app-commands";
import type { AgentId } from "../shared/types";

export type ChatCommandRoute =
  | { kind: "app_command"; commandId: AppCommandId; commandText: string; args: string[] }
  | { kind: "runtime_slash"; prompt: string }
  | { kind: "plain_prompt"; prompt: string }
  | { kind: "unsupported_runtime_slash"; prompt: string; reason: string };

interface RuntimeCommandPolicy {
  runtimeId: AgentId;
  classify(input: string): Exclude<ChatCommandRoute["kind"], "app_command">;
  unsupportedSlashMessage?: (input: string) => string;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const APP_COMMAND_PREFIX_PATTERN = new RegExp(`^${escapeRegExp(APP_COMMAND_PREFIX)}(?:\\s|$)`, "i");
const DEFAULT_APP_COMMAND_ID: AppCommandId = "help";
const DEFAULT_APP_COMMAND_TEXT =
  APP_COMMANDS.find((item) => item.id === DEFAULT_APP_COMMAND_ID)?.command ?? `${APP_COMMAND_PREFIX} help`;

const POLICIES: Record<AgentId, RuntimeCommandPolicy> = {
  codex: {
    runtimeId: "codex",
    classify: (input) => (input.startsWith("/") ? "runtime_slash" : "plain_prompt"),
  },
  claude: {
    runtimeId: "claude",
    classify: (input) => (input.startsWith("/") ? "runtime_slash" : "plain_prompt"),
  },
  api: {
    runtimeId: "api",
    classify: (input) => (input.startsWith("/") ? "unsupported_runtime_slash" : "plain_prompt"),
    unsupportedSlashMessage: () => "Native slash commands are not supported by API runtimes. Use /app help for app-local commands.",
  },
};

export function routeChatPrompt(runtimeId: AgentId, rawInput: string): ChatCommandRoute {
  const input = rawInput.trim();

  if (APP_COMMAND_PREFIX_PATTERN.test(input)) {
    const [, ...parts] = input.split(/\s+/);
    const commandName = (parts[0] ?? "help").toLowerCase();
    const descriptor = APP_COMMANDS.find((item) => item.id === commandName);

    if (!descriptor) {
      return {
        kind: "app_command",
        commandId: DEFAULT_APP_COMMAND_ID,
        commandText: DEFAULT_APP_COMMAND_TEXT,
        args: [],
      };
    }

    return {
      kind: "app_command",
      commandId: descriptor.id,
      commandText: descriptor.command,
      args: parts.slice(1),
    };
  }

  const policy = POLICIES[runtimeId];
  const kind = policy.classify(input);

  if (kind === "plain_prompt") {
    return { kind, prompt: input };
  }

  if (kind === "runtime_slash") {
    return { kind, prompt: input };
  }

  return {
    kind,
    prompt: input,
    reason: policy.unsupportedSlashMessage?.(input) ?? "Unsupported slash command.",
  };
}
