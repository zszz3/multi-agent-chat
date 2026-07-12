import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface WorkflowMcpLaunchConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface WorkflowMcpLaunchOptions {
  mainBundlePath?: string;
  cwd?: string;
}

export function workflowMcpLaunchConfig(
  discoveryPath: string | undefined,
  options: WorkflowMcpLaunchOptions = {},
  workflowId?: string,
): WorkflowMcpLaunchConfig | undefined {
  if (!discoveryPath || !workflowId) return undefined;
  const mainBundlePath = options.mainBundlePath ?? fileURLToPath(import.meta.url);
  const compiledServer = path.join(path.dirname(mainBundlePath), "mcp-server.js");
  if (existsSync(compiledServer)) {
    return {
      command: process.execPath,
      args: [compiledServer],
      env: {
        MULTI_AGENT_CHAT_MCP_BRIDGE: discoveryPath,
        MULTI_AGENT_CHAT_WORKFLOW_ID: workflowId,
        ELECTRON_RUN_AS_NODE: "1",
      },
    };
  }

  const cwd = options.cwd ?? process.cwd();
  const tsxCli = [
    path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx"),
  ].find(existsSync);
  const serverScript = path.join(cwd, "src", "mcp", "server.ts");
  if (!tsxCli || !existsSync(serverScript)) return undefined;
  return {
    command: process.execPath,
    args: [tsxCli, serverScript],
    env: { MULTI_AGENT_CHAT_MCP_BRIDGE: discoveryPath, MULTI_AGENT_CHAT_WORKFLOW_ID: workflowId, ELECTRON_RUN_AS_NODE: "1" },
  };
}
