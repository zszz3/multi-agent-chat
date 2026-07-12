import type { AgentId } from "../types";
import type { AgentMcpBinding } from "../mcp/types";

export type AgentType = "execution" | "composed";

export interface AgentRevision {
  id: string;
  agentId: string;
  agentType: AgentType;
  revision: number;
  baseAgentId?: string;
  runtimeAgentId: AgentId;
  channelId: string;
  modelId: string;
  reasoningEffort?: string;
  instructions: string;
  mcpBindings: AgentMcpBinding[];
  configHash: string;
  createdAt: number;
}
