import type { ClaudeAgentSdkRunInput } from "../../../../agents/claude/claude-agent-sdk";
import { workflowMcpLaunchConfig } from "../workflow/workflow-mcp-launch";

export function claudeWorkflowMcpServers(
  discoveryPath: string | undefined,
): ClaudeAgentSdkRunInput["mcpServers"] | undefined {
  const config = workflowMcpLaunchConfig(discoveryPath);
  if (!config) return undefined;
  return { multi_agent_chat: { type: "stdio", ...config } };
}
