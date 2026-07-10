import type { AgentChannel, ConfiguredAgent, RuntimeBindingSnapshot } from "../../../shared/types";

function cloneChannel(channel: AgentChannel): AgentChannel {
  return {
    ...channel,
    models: channel.models.map((model) => ({ ...model })),
    ...(channel.httpHeaders ? { httpHeaders: { ...channel.httpHeaders } } : {}),
    ...(channel.plugins ? { plugins: channel.plugins.map((plugin) => ({ ...plugin })) } : {}),
  };
}

function cloneConfiguredAgent(agent: ConfiguredAgent): ConfiguredAgent {
  return { ...agent, tags: [...agent.tags] };
}

export function createRuntimeBindingSnapshot(input: {
  agent: ConfiguredAgent;
  runtimeAgentId: RuntimeBindingSnapshot["runtimeAgentId"];
  channel: AgentChannel;
  modelId: string;
}): RuntimeBindingSnapshot {
  return {
    configuredAgent: cloneConfiguredAgent(input.agent),
    runtimeAgentId: input.runtimeAgentId,
    channel: cloneChannel(input.channel),
    modelId: input.modelId,
  };
}

export function cloneRuntimeBindingSnapshot(binding: RuntimeBindingSnapshot): RuntimeBindingSnapshot {
  return createRuntimeBindingSnapshot({
    agent: binding.configuredAgent,
    runtimeAgentId: binding.runtimeAgentId,
    channel: binding.channel,
    modelId: binding.modelId,
  });
}

export function restoreRuntimeBindingSnapshot(raw: unknown): RuntimeBindingSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Partial<RuntimeBindingSnapshot>;
  const agent = record.configuredAgent;
  const channel = record.channel;
  if (!agent || !channel || typeof record.modelId !== "string") return undefined;
  if (record.runtimeAgentId !== "codex" && record.runtimeAgentId !== "claude" && record.runtimeAgentId !== "api") return undefined;
  if (
    typeof agent.id !== "string" ||
    typeof agent.name !== "string" ||
    !Array.isArray(agent.tags) ||
    typeof channel.id !== "string" ||
    channel.agentId !== record.runtimeAgentId ||
    !Array.isArray(channel.models)
  ) return undefined;
  return createRuntimeBindingSnapshot({ agent, runtimeAgentId: record.runtimeAgentId, channel, modelId: record.modelId });
}
