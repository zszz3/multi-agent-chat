import { APP_COMMANDS } from "../shared/app-commands";
import type { AgentChannel, AgentId, AppSnapshot, ConfiguredAgent, SlashCompletionGroup, SlashCompletionItem } from "../shared/types";

interface RuntimeSlashCompletionInput {
  runtimeId: AgentId;
  input: string;
}

type SlashCompletionSnapshot = Pick<AppSnapshot, "chats" | "configuredAgents" | "channels">;

function normalizeSlashCompletionQuery(input: string): string | undefined {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/") || trimmed.includes("\n") || /\s/.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
}

function resolveConfiguredAgentChannel(agent: ConfiguredAgent | undefined, channels: AgentChannel[]): AgentChannel | undefined {
  if (!agent) return undefined;
  return channels.find((channel) => channel.id === agent.channelId) ?? channels.find((channel) => channel.agentId === agent.runtimeAgentId) ?? channels[0];
}

function configuredAgentRuntimeId(agent: ConfiguredAgent | undefined, channel: AgentChannel | undefined): AgentId {
  return channel?.agentId ?? agent?.runtimeAgentId ?? "codex";
}

function appCommandItems(runtimeId: AgentId, query: string): SlashCompletionItem[] {
  return APP_COMMANDS.filter((item) => !item.supportedRuntimeIds || item.supportedRuntimeIds.includes(runtimeId))
    .map((item) => ({
      id: `app:${item.id}`,
      label: item.command,
      insertText: `${item.command} `,
      description: item.summary,
      authoritative: true,
    }))
    .filter((item) => item.label.toLowerCase().startsWith(query));
}

function runtimeIdForChat(snapshot: SlashCompletionSnapshot, chatId: string): AgentId {
  const chat = snapshot.chats.find((item) => item.id === chatId);
  const agent = snapshot.configuredAgents.find((item) => item.id === chat?.configuredAgentId) ?? snapshot.configuredAgents[0];
  const channel = resolveConfiguredAgentChannel(agent, snapshot.channels);
  return configuredAgentRuntimeId(agent, channel);
}

export function listSlashCompletionGroupsForRuntime(input: RuntimeSlashCompletionInput): SlashCompletionGroup[] {
  const query = normalizeSlashCompletionQuery(input.input);
  if (!query) return [];
  const appItems = appCommandItems(input.runtimeId, query);
  return appItems.length > 0
    ? [
        {
          id: "app_commands",
          label: "App commands",
          items: appItems,
        },
      ]
    : [];
}

export function listSlashCompletionGroupsForChat(snapshot: SlashCompletionSnapshot, chatId: string, input: string): SlashCompletionGroup[] {
  return listSlashCompletionGroupsForRuntime({
    runtimeId: runtimeIdForChat(snapshot, chatId),
    input,
  });
}
