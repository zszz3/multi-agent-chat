import type { AgentChannel, AgentRevision, AgentType, ConfiguredAgent } from "./types";

export function configuredAgentType(agent: Pick<ConfiguredAgent, "agentType" | "managed">): AgentType {
  return agent.agentType ?? (agent.managed ? "execution" : "composed");
}

export function agentBehaviorConfig(agent: ConfiguredAgent): Record<string, unknown> {
  return {
    agentType: configuredAgentType(agent),
    baseAgentId: agent.baseAgentId ?? null,
    runtimeAgentId: agent.runtimeAgentId,
    channelId: agent.channelId,
    modelId: agent.modelId,
    reasoningEffort: agent.reasoningEffort ?? null,
    instructions: agent.instructions ?? "",
    mcpBindings: (agent.mcpBindings ?? []).map((binding) => ({
      serverId: binding.serverId,
      toolAllowlist: [...binding.toolAllowlist].sort(),
    })).sort((left, right) => left.serverId.localeCompare(right.serverId)),
  };
}

export function executionChannelConfig(channel: AgentChannel): Record<string, unknown> {
  return {
    runtimeAgentId: channel.agentId,
    channelId: channel.id,
    modelProvider: channel.modelProvider ?? null,
    providerName: channel.providerName ?? null,
    baseUrl: channel.baseUrl ?? null,
    wireApi: channel.wireApi ?? null,
    apiFormat: channel.apiFormat ?? null,
    models: channel.models.map((model) => ({
      id: model.id,
      reasoningEfforts: model.reasoningEfforts ?? [],
      defaultReasoningEffort: model.defaultReasoningEffort ?? null,
    })),
    modelCatalogJson: channel.modelCatalogJson ?? null,
    modelReasoningEffort: channel.modelReasoningEffort ?? null,
  };
}

export function stableConfigHash(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createAgentRevision(agent: ConfiguredAgent, revision: number, createdAt = Date.now()): AgentRevision {
  const configHash = stableConfigHash(agentBehaviorConfig(agent));
  return {
    id: `${agent.id}:v${revision}:${configHash}`,
    agentId: agent.id,
    agentType: configuredAgentType(agent),
    revision,
    ...(agent.baseAgentId ? { baseAgentId: agent.baseAgentId } : {}),
    runtimeAgentId: agent.runtimeAgentId,
    channelId: agent.channelId,
    modelId: agent.modelId,
    ...(agent.reasoningEffort ? { reasoningEffort: agent.reasoningEffort } : {}),
    instructions: agent.instructions ?? "",
    mcpBindings: (agent.mcpBindings ?? []).map((binding) => ({
      serverId: binding.serverId,
      toolAllowlist: [...binding.toolAllowlist],
    })),
    configHash,
    createdAt,
  };
}

export function createExecutionAgentRevision(
  agent: ConfiguredAgent,
  channel: AgentChannel,
  revision: number,
  createdAt = Date.now(),
): AgentRevision {
  const configHash = stableConfigHash({
    agent: agentBehaviorConfig(agent),
    channel: executionChannelConfig(channel),
  });
  return {
    ...createAgentRevision(agent, revision, createdAt),
    id: `${agent.id}:v${revision}:${configHash}`,
    agentType: "execution",
    configHash,
  };
}
