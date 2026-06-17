import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

const TOOL_ROUTES: Record<string, string> = {
  agent_templates_list: "/mcp/agent-templates/list",
  agents_list: "/mcp/agents/list",
  agents_create: "/mcp/agents/create",
  agents_update: "/mcp/agents/update",
  agents_delete: "/mcp/agents/delete",
  agents_test: "/mcp/agents/test",
  channels_list: "/mcp/channels/list",
  models_list: "/mcp/models/list",
  workflow_create: "/mcp/workflow/create",
  workflow_list: "/mcp/workflow/list",
  workflow_get: "/mcp/workflow/get",
  workflow_update: "/mcp/workflow/update",
  workflow_validate: "/mcp/workflow/validate",
  workflow_context_append: "/mcp/workflow/context/append",
  workflow_run_context_append: "/mcp/workflow/run-context/append",
};

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const workflowGraphSchema = {
  type: "object",
  description: "WorkflowGraph with title, objective, nodes, and edges.",
  additionalProperties: true,
};

const artifactsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["text", "file", "url"] },
      title: { type: "string" },
      content: { type: "string" },
      path: { type: "string" },
      url: { type: "string" },
    },
    required: ["kind", "title"],
    additionalProperties: false,
  },
};

export function mcpToolDefinitions(): McpToolDefinition[] {
  return [
    {
      name: "agent_templates_list",
      description: "List built-in agent templates. Templates only contain agent persona fields: name, description, tags, and prompt. Runtime, provider, and model remain user configuration.",
      inputSchema: objectSchema({}),
    },
    {
      name: "agents_list",
      description: "List configured agents and their runtime/channel/model selections.",
      inputSchema: objectSchema({}),
    },
    {
      name: "agents_create",
      description: "Create a configured agent. Use agent_templates_list first when you want a reusable persona template.",
      inputSchema: objectSchema(
        {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          runtimeAgentId: { type: "string", enum: ["codex", "claude", "api"] },
          channelId: { type: "string" },
          modelId: { type: "string" },
          prompt: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          templateId: { type: "string" },
        },
        ["id", "name"],
      ),
    },
    {
      name: "agents_update",
      description: "Update an existing configured agent. Omitted fields keep their current values.",
      inputSchema: objectSchema(
        {
          agentId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          runtimeAgentId: { type: "string", enum: ["codex", "claude", "api"] },
          channelId: { type: "string" },
          modelId: { type: "string" },
          prompt: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          templateId: { type: "string" },
        },
        ["agentId"],
      ),
    },
    {
      name: "agents_delete",
      description: "Delete a configured agent by id. This does not delete workflow graphs that reference it.",
      inputSchema: objectSchema({ agentId: { type: "string" } }, ["agentId"]),
    },
    {
      name: "agents_test",
      description: "Run the same connectivity smoke test as the desktop UI for a configured agent.",
      inputSchema: objectSchema({ agentId: { type: "string" } }, ["agentId"]),
    },
    {
      name: "channels_list",
      description: "List available runtime provider channels. Secrets and HTTP authorization headers are not returned.",
      inputSchema: objectSchema({ agentId: { type: "string", enum: ["codex", "claude", "api"] } }),
    },
    {
      name: "models_list",
      description: "List models available on channels, optionally filtered by channelId or agent runtime.",
      inputSchema: objectSchema({
        agentId: { type: "string", enum: ["codex", "claude", "api"] },
        channelId: { type: "string" },
      }),
    },
    {
      name: "workflow_create",
      description: "Create a new editable workflow DAG in Multi Agent Chat. Invalid graphs are rejected with validation errors.",
      inputSchema: objectSchema(
        {
          title: { type: "string" },
          objective: { type: "string" },
          graph: workflowGraphSchema,
          agentId: { type: "string", enum: ["codex", "claude"] },
          channelId: { type: "string" },
          modelId: { type: "string" },
        },
        ["title", "objective", "graph"],
      ),
    },
    {
      name: "workflow_list",
      description: "List workflow summaries in Multi Agent Chat.",
      inputSchema: objectSchema({}),
    },
    {
      name: "workflow_get",
      description: "Get a workflow by workflowId, including graph, status, revision, and context.",
      inputSchema: objectSchema({ workflowId: { type: "string" } }, ["workflowId"]),
    },
    {
      name: "workflow_update",
      description: "Update workflow metadata or replace the full graph. Requires expectedRevision for overwrite protection.",
      inputSchema: objectSchema({
        workflowId: { type: "string" },
        expectedRevision: { type: "number" },
        title: { type: "string" },
        objective: { type: "string" },
        graph: workflowGraphSchema,
      }, ["workflowId"]),
    },
    {
      name: "workflow_validate",
      description: "Validate a workflow graph or an existing workflowId without modifying state.",
      inputSchema: objectSchema({
        workflowId: { type: "string" },
        graph: workflowGraphSchema,
      }),
    },
    {
      name: "workflow_context_append",
      description: "Append long-lived context to a workflow. File and URL artifacts are stored as references only.",
      inputSchema: objectSchema(
        {
          workflowId: { type: "string" },
          report: { type: "string" },
          handoff: { type: "string" },
          artifacts: artifactsSchema,
        },
        ["workflowId", "report", "handoff"],
      ),
    },
    {
      name: "workflow_run_context_append",
      description: "Append context to one running workflow run. This does not modify graph structure.",
      inputSchema: objectSchema(
        {
          workflowId: { type: "string" },
          runId: { type: "string" },
          nodeId: { type: "string" },
          report: { type: "string" },
          handoff: { type: "string" },
          artifacts: artifactsSchema,
        },
        ["workflowId", "runId", "report", "handoff"],
      ),
    },
  ];
}

export function resolveBridgeDiscoveryPath(): string {
  if (process.env.MULTI_AGENT_CHAT_MCP_BRIDGE) return process.env.MULTI_AGENT_CHAT_MCP_BRIDGE;
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "multi-agent-chat", "mcp-bridge.json");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "multi-agent-chat", "mcp-bridge.json");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "multi-agent-chat", "mcp-bridge.json");
}

async function readBridgeDiscovery(): Promise<{ host: string; port: number; token: string }> {
  const discoveryPath = resolveBridgeDiscoveryPath();
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(discoveryPath, "utf8")) as unknown;
  } catch {
    throw new Error("Multi Agent Chat app is not running. Open the desktop app first, then retry this tool call.");
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  if (typeof record.host !== "string" || typeof record.port !== "number" || typeof record.token !== "string") {
    throw new Error("Multi Agent Chat MCP bridge discovery file is invalid.");
  }
  return { host: record.host, port: record.port, token: record.token };
}

export async function callMcpTool(name: string, args: unknown): Promise<unknown> {
  const route = TOOL_ROUTES[name];
  if (!route) throw new Error(`Unknown MCP tool: ${name}`);
  const discovery = await readBridgeDiscovery();
  const response = await fetch(`http://${discovery.host}:${discovery.port}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${discovery.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args ?? {}),
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok) throw new Error(`MCP bridge request failed with ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function writeJsonRpc(payload: unknown): void {
  const text = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`);
}

async function handleJsonRpc(request: JsonRpcRequest): Promise<void> {
  if (request.id === undefined) return;
  try {
    if (request.method === "initialize") {
      writeJsonRpc({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "multi-agent-chat", version: "0.1.0" },
        },
      });
      return;
    }
    if (request.method === "tools/list") {
      writeJsonRpc({ jsonrpc: "2.0", id: request.id, result: { tools: mcpToolDefinitions() } });
      return;
    }
    if (request.method === "tools/call") {
      const params = request.params && typeof request.params === "object" ? (request.params as Record<string, unknown>) : {};
      const name = typeof params.name === "string" ? params.name : "";
      const result = await callMcpTool(name, params.arguments ?? {});
      const ok = Boolean(result && typeof result === "object" && "ok" in result ? (result as { ok?: unknown }).ok : true);
      writeJsonRpc({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: !ok,
        },
      });
      return;
    }
    writeJsonRpc({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Unknown method: ${request.method}` } });
  } catch (error) {
    writeJsonRpc({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    });
  }
}

export function startStdioMcpServer(): void {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const separatorIndex = buffer.indexOf("\r\n\r\n");
      if (separatorIndex < 0) return;
      const header = buffer.slice(0, separatorIndex).toString("utf8");
      const lengthMatch = /content-length:\s*(\d+)/i.exec(header);
      if (!lengthMatch) {
        buffer = buffer.slice(separatorIndex + 4);
        continue;
      }
      const contentLength = Number(lengthMatch[1]);
      const messageStart = separatorIndex + 4;
      const messageEnd = messageStart + contentLength;
      if (buffer.length < messageEnd) return;
      const rawMessage = buffer.slice(messageStart, messageEnd).toString("utf8");
      buffer = buffer.slice(messageEnd);
      void handleJsonRpc(JSON.parse(rawMessage) as JsonRpcRequest);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStdioMcpServer();
}
