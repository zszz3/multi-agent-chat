import type { AgentChannel, AgentId, AgentModelOption } from "./types";

export const DEFAULT_MODEL_ID = "default";

export const FALLBACK_MODEL_OPTIONS: Record<AgentId, AgentModelOption[]> = {
  codex: [
    { id: DEFAULT_MODEL_ID, label: "Default" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
    { id: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
  ],
  claude: [
    { id: DEFAULT_MODEL_ID, label: "Default" },
    { id: "sonnet", label: "Sonnet" },
    { id: "opus", label: "Opus" },
  ],
};

export function defaultModelForAgent(_agentId: AgentId): string {
  return DEFAULT_MODEL_ID;
}

export function defaultChannelForAgent(agentId: AgentId, channels: AgentChannel[]): string {
  return channels.find((channel) => channel.agentId === agentId)?.id ?? `${agentId}-default`;
}

export function modelsForChannel(agentId: AgentId, channelId: string, channels: AgentChannel[]): AgentModelOption[] {
  return channels.find((channel) => channel.agentId === agentId && channel.id === channelId)?.models ?? FALLBACK_MODEL_OPTIONS[agentId];
}

export function isModelForChannel(agentId: AgentId, channelId: string, modelId: string, channels: AgentChannel[]): boolean {
  return modelsForChannel(agentId, channelId, channels).some((model) => model.id === modelId);
}

export function runtimeModelId(modelId: string): string | null {
  return modelId === DEFAULT_MODEL_ID ? null : modelId;
}
