import { existsSync } from "node:fs";
import path from "node:path";

interface WorkflowMcpLaunchConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

function launchConfig(discoveryPath: string | undefined): WorkflowMcpLaunchConfig | undefined {
  if (!discoveryPath) return undefined;
  const cwd = process.cwd();
  const tsxCli = [
    path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx"),
  ].find(existsSync);
  const serverScript = [
    path.join(cwd, "src", "mcp", "server.ts"),
    path.join(cwd, "out", "mcp", "server.js"),
  ].find(existsSync);
  if (!tsxCli || !serverScript) return undefined;
  return {
    command: "node",
    args: [tsxCli, serverScript],
    env: { MULTI_AGENT_CHAT_MCP_BRIDGE: discoveryPath },
  };
}

export function codexWorkflowMcpArgs(discoveryPath: string | undefined): string[] {
  const config = launchConfig(discoveryPath);
  if (!config) return [];
  return [
    "-c",
    `mcp_servers.multi_agent_chat.command=${JSON.stringify(config.command)}`,
    "-c",
    `mcp_servers.multi_agent_chat.args=[${config.args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
    "-c",
    `mcp_servers.multi_agent_chat.env.MULTI_AGENT_CHAT_MCP_BRIDGE=${JSON.stringify(config.env.MULTI_AGENT_CHAT_MCP_BRIDGE)}`,
  ];
}

export function claudeWorkflowMcpServers(
  discoveryPath: string | undefined,
): Record<string, { type: "stdio"; command: string; args: string[]; env: Record<string, string> }> | undefined {
  const config = launchConfig(discoveryPath);
  if (!config) return undefined;
  return { multi_agent_chat: { type: "stdio", ...config } };
}
