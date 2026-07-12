import { workflowMcpLaunchConfig } from "../workflow/workflow-mcp-launch";

export function codexWorkflowMcpArgs(discoveryPath: string | undefined, workflowId: string): string[] {
  const config = workflowMcpLaunchConfig(discoveryPath, {}, workflowId);
  if (!config) return [];
  return [
    "-c",
    `mcp_servers.multi_agent_chat.command=${JSON.stringify(config.command)}`,
    "-c",
    `mcp_servers.multi_agent_chat.args=[${config.args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
    "-c",
    `mcp_servers.multi_agent_chat.env.MULTI_AGENT_CHAT_MCP_BRIDGE=${JSON.stringify(config.env.MULTI_AGENT_CHAT_MCP_BRIDGE)}`,
    "-c",
    `mcp_servers.multi_agent_chat.env.MULTI_AGENT_CHAT_WORKFLOW_ID=${JSON.stringify(config.env.MULTI_AGENT_CHAT_WORKFLOW_ID)}`,
  ];
}
