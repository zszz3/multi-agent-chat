import { DEFAULT_MODEL_ID } from "../../../shared/models";
import type { AgentChannel, AgentId, AgentModelOption, AgentRuntime, ConfiguredAgent } from "../../../shared/types";

export function agentLabel(agentId: AgentId): string {
  if (agentId === "codex") return "Codex";
  if (agentId === "claude") return "Claude Code";
  if (agentId === "hermes") return "Hermes";
  return "API";
}

export function agentAccent(agentId: AgentId): string {
  if (agentId === "codex") return "agent-codex";
  if (agentId === "claude") return "agent-claude";
  if (agentId === "hermes") return "agent-hermes";
  return "agent-api";
}

export function fallbackRuntime(agentId: AgentId): AgentRuntime {
  return {
    id: agentId,
    label: agentLabel(agentId),
    command: agentId,
    version: null,
    available: false,
    error: "Detecting",
  };
}

export function runtimeStatus(runtime: AgentRuntime): string {
  if (runtime.available) return runtime.version ?? "available";
  return runtime.error ?? "missing";
}

export function resolveConfiguredAgentChannel(agent: ConfiguredAgent | undefined, channels: AgentChannel[]): AgentChannel | undefined {
  if (!agent) return undefined;
  return channels.find((channel) => channel.id === agent.channelId) ?? channels.find((channel) => channel.agentId === agent.runtimeAgentId) ?? channels[0];
}

export function configuredAgentById(configuredAgentId: string | undefined, configuredAgents: ConfiguredAgent[]): ConfiguredAgent | undefined {
  return configuredAgents.find((agent) => agent.id === configuredAgentId)
    ?? configuredAgents.find((agent) => agent.id === "default-agent")
    ?? configuredAgents[0];
}

export function defaultConfiguredAgentId(configuredAgents: ConfiguredAgent[]): string {
  return configuredAgents.find((agent) => agent.id === "default-agent")?.id ?? configuredAgents[0]?.id ?? "";
}

export function resolveFindSkillConfiguredAgentId(configuredAgentId: string | undefined, configuredAgents: ConfiguredAgent[]): string {
  if (configuredAgentId && configuredAgents.some((agent) => agent.id === configuredAgentId)) return configuredAgentId;
  return defaultConfiguredAgentId(configuredAgents);
}

export function configuredAgentModel(
  agent: ConfiguredAgent | undefined,
  channel: AgentChannel | undefined,
  modelId?: string,
): AgentModelOption | undefined {
  if (!agent || !channel) return undefined;
  const selectedModelId = modelId || agent.modelId;
  return channel.models.find((model) => model.id === selectedModelId) ?? channel.models.find((model) => model.id === DEFAULT_MODEL_ID) ?? channel.models[0];
}

export function configuredAgentRuntimeId(agent: ConfiguredAgent | undefined, channel: AgentChannel | undefined): AgentId {
  return channel?.agentId ?? agent?.runtimeAgentId ?? "codex";
}

export function configuredAgentModelId(configuredAgentId: string | undefined, modelId: string | undefined, configuredAgents: ConfiguredAgent[], channels: AgentChannel[]): string {
  const agent = configuredAgentById(configuredAgentId, configuredAgents);
  const channel = resolveConfiguredAgentChannel(agent, channels);
  return configuredAgentModel(agent, channel, modelId)?.id ?? DEFAULT_MODEL_ID;
}
