import { APP_COMMANDS } from "../shared/app-commands";
import type { AgentId, LearnedNativeCommandRecord, SlashCompletionGroup, SlashCompletionItem } from "../shared/types";

interface CommandIdRecord {
  id: string;
}

interface ImportedSkillRecord {
  id: string;
  name: string;
  description: string;
}

interface ClaudeCommandRecord {
  name: string;
  argumentHint?: string;
  description?: string;
  userInvocable?: boolean;
}

export interface RuntimeSlashCompletionInput {
  runtimeId: AgentId;
  input: string;
  cliFingerprint?: string;
  learnedNativeCommands?: LearnedNativeCommandRecord[];
  codexModels?: CommandIdRecord[];
  codexPlugins?: CommandIdRecord[];
  importedSkills?: ImportedSkillRecord[];
  claudeCommands?: ClaudeCommandRecord[];
}

function normalizeSlashCompletionQuery(input: string): string | undefined {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/") || trimmed.includes("\n") || /\s/.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
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

function codexMetadataItems(input: RuntimeSlashCompletionInput, query: string): SlashCompletionItem[] {
  if (input.runtimeId !== "codex") return [];
  const models = (input.codexModels ?? []).map((model) => ({
    id: `codex:model:${model.id}`,
    label: `/model ${model.id}`,
    insertText: `/model ${model.id} `,
    description: "Use a specific Codex model.",
    authoritative: true,
  }));
  const plugins = (input.codexPlugins ?? []).map((plugin) => ({
    id: `codex:plugin:${plugin.id}`,
    label: `/plugin ${plugin.id}`,
    insertText: `/plugin ${plugin.id} `,
    description: "Target a Codex plugin.",
    authoritative: true,
  }));
  const skills = (input.importedSkills ?? []).map((skill) => ({
    id: `codex:skill:${skill.id}`,
    label: `/skill ${skill.name}`,
    insertText: `/skill ${skill.name} `,
    description: skill.description || "Target an imported skill.",
    authoritative: true,
  }));
  return [...models, ...plugins, ...skills].filter((item) => item.label.toLowerCase().startsWith(query));
}

function claudeMetadataItems(input: RuntimeSlashCompletionInput, query: string): SlashCompletionItem[] {
  if (input.runtimeId !== "claude") return [];
  return (input.claudeCommands ?? [])
    .filter((command) => command.userInvocable !== false)
    .map((command) => ({
      id: `claude:${command.name}`,
      label: `/${command.name}`,
      insertText: command.argumentHint ? `/${command.name} ${command.argumentHint} ` : `/${command.name} `,
      description: command.description ?? "Custom Claude command",
      authoritative: true,
    }))
    .filter((item) => item.label.toLowerCase().startsWith(query));
}

function learnedNativeSuggestionItems(input: RuntimeSlashCompletionInput, query: string): SlashCompletionItem[] {
  if (!input.cliFingerprint || input.runtimeId === "api") return [];
  return (input.learnedNativeCommands ?? [])
    .filter((item) => item.runtimeId === input.runtimeId && item.cliFingerprint === input.cliFingerprint)
    .sort((left, right) => right.successCount - left.successCount || right.lastUsedAt - left.lastUsedAt)
    .map((item) => ({
      id: `${item.runtimeId}:${item.cliFingerprint}:${item.commandStem}`,
      label: item.example,
      insertText: `${item.example} `,
      description: `Learned from successful ${item.runtimeId} usage`,
      authoritative: false,
    }))
    .filter((item) => item.label.toLowerCase().startsWith(query));
}

export function listSlashCompletionGroupsForRuntime(input: RuntimeSlashCompletionInput): SlashCompletionGroup[] {
  const query = normalizeSlashCompletionQuery(input.input);
  if (!query) return [];

  const groups: SlashCompletionGroup[] = [];
  const appItems = appCommandItems(input.runtimeId, query);
  if (appItems.length > 0) {
    groups.push({
      id: "app_commands",
      label: "App commands",
      items: appItems,
    });
  }

  const nativeMetadataItems = input.runtimeId === "claude" ? claudeMetadataItems(input, query) : codexMetadataItems(input, query);
  if (nativeMetadataItems.length > 0) {
    groups.push({
      id: "native_metadata",
      label: "Native metadata",
      items: nativeMetadataItems,
    });
  }

  const suggestionItems = learnedNativeSuggestionItems(input, query);
  if (suggestionItems.length > 0) {
    groups.push({
      id: "suggested_native_commands",
      label: "Suggested native commands",
      items: suggestionItems,
    });
  }

  return groups;
}
