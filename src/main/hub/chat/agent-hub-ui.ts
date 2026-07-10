import { randomUUID } from "node:crypto";
import type { AgentChannel, AgentId, ChatMessage } from "../../../shared/types";

export function createAssistantMessage(content = "", local = false): ChatMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content,
    timestamp: Date.now(),
    ...(local ? { local: true } : {}),
  };
}

export function createUserMessage(content: string, local = false): ChatMessage {
  return {
    id: randomUUID(),
    role: "user",
    content,
    timestamp: Date.now(),
    ...(local ? { local: true } : {}),
  };
}

export function createErrorMessage(content: string): ChatMessage {
  return {
    id: randomUUID(),
    role: "error",
    content,
    timestamp: Date.now(),
  };
}

export function titleFromPrompt(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  if (!oneLine) return "New chat";
  return oneLine.length > 56 ? `${oneLine.slice(0, 56)}...` : oneLine;
}

export function hasAgentConversationMessages(messages: ChatMessage[]): boolean {
  return messages.some((message) => !message.local);
}

export function cloneAgentChannel(channel: AgentChannel): AgentChannel {
  const cloned: AgentChannel = {
    id: channel.id,
    agentId: channel.agentId,
    label: channel.label,
    models: channel.models.map((model) => ({ ...model })),
  };
  if (channel.profileName !== undefined) cloned.profileName = channel.profileName;
  if (channel.presetId !== undefined) cloned.presetId = channel.presetId;
  if (channel.modelProvider !== undefined) cloned.modelProvider = channel.modelProvider;
  if (channel.providerName !== undefined) cloned.providerName = channel.providerName;
  if (channel.baseUrl !== undefined) cloned.baseUrl = channel.baseUrl;
  if (channel.wireApi !== undefined) cloned.wireApi = channel.wireApi;
  if (channel.modelCatalogJson !== undefined) cloned.modelCatalogJson = channel.modelCatalogJson;
  if (channel.modelReasoningEffort !== undefined) cloned.modelReasoningEffort = channel.modelReasoningEffort;
  if (channel.httpHeaders !== undefined) cloned.httpHeaders = { ...channel.httpHeaders };
  if (channel.plugins !== undefined) cloned.plugins = channel.plugins.map((plugin) => ({ ...plugin }));
  return cloned;
}

export function agentLabel(agentId: AgentId): string {
  if (agentId === "codex") return "Codex";
  if (agentId === "claude") return "Claude Code";
  if (agentId === "hermes") return "Hermes";
  if (agentId === "opencode") return "OpenCode";
  return "API";
}
