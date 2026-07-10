import { existsSync } from "node:fs";
import path from "node:path";

export interface WorkflowMcpLaunchConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function workflowMcpLaunchConfig(discoveryPath: string | undefined): WorkflowMcpLaunchConfig | undefined {
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
