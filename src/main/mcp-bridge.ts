import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { AgentHub } from "./agent-hub";
import type { CreateWorkflowRequest, UpdateWorkflowRequest, WorkflowArtifactReference, WorkflowGraph, AppendWorkflowRunContextRequest } from "../shared/types";
import { validateWorkflowGraph } from "../shared/workflow-graph";

export interface McpBridgeServer {
  host: string;
  port: number;
  token: string;
  discoveryPath: string;
  stop: () => Promise<void>;
}

export interface StartMcpBridgeOptions {
  discoveryPath: string;
}

function jsonResponse(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

function isAuthorized(request: http.IncomingMessage, token: string): boolean {
  return request.headers.authorization === `Bearer ${token}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function workflowListPayload(hub: AgentHub): unknown {
  return {
    ok: true,
    workflows: hub.snapshot().workflowStore.workflows.map((workflow) => ({
      workflowId: workflow.workflowId,
      title: workflow.title,
      objective: workflow.objective,
      status: workflow.status,
      revision: workflow.revision,
      updatedAt: workflow.updatedAt,
      lastRunStatus: workflow.runProgress.length > 0 ? workflow.runProgress.at(-1)?.status : undefined,
      nodeCount: workflow.graph.nodes.length,
    })),
  };
}

async function routeWorkflowRequest(hub: AgentHub, route: string, body: unknown): Promise<unknown> {
  const record = asRecord(body);
  if (route === "/mcp/workflow/list") return workflowListPayload(hub);
  if (route === "/mcp/workflow/get") {
    const workflowId = typeof record.workflowId === "string" ? record.workflowId : "";
    const workflow = hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId);
    return workflow ? { ok: true, workflow } : { ok: false, error: `Workflow ${workflowId} was not found.` };
  }
  if (route === "/mcp/workflow/create") {
    const request: CreateWorkflowRequest = {
      title: typeof record.title === "string" ? record.title : "",
      objective: typeof record.objective === "string" ? record.objective : "",
      graph: record.graph as WorkflowGraph,
      agentId: record.agentId === "claude" ? "claude" : "codex",
    };
    if (typeof record.channelId === "string") request.channelId = record.channelId;
    if (typeof record.modelId === "string") request.modelId = record.modelId;
    return hub.createWorkflow(request);
  }
  if (route === "/mcp/workflow/update") {
    const request: UpdateWorkflowRequest = {
      workflowId: typeof record.workflowId === "string" ? record.workflowId : "",
    };
    if (typeof record.expectedRevision === "number") request.expectedRevision = record.expectedRevision;
    if (typeof record.title === "string") request.title = record.title;
    if (typeof record.objective === "string") request.objective = record.objective;
    if (record.graph) request.graph = record.graph as WorkflowGraph;
    return hub.updateWorkflow(request);
  }
  if (route === "/mcp/workflow/validate") {
    const workflowId = typeof record.workflowId === "string" ? record.workflowId : "";
    const workflow = workflowId ? hub.snapshot().workflowStore.workflows.find((item) => item.workflowId === workflowId) : undefined;
    const graph = (record.graph as WorkflowGraph | undefined) ?? workflow?.graph;
    if (!graph) return { ok: false, error: "workflow_validate requires graph or workflowId." };
    const validation = validateWorkflowGraph(graph);
    return { ok: validation.valid, validation, error: validation.valid ? undefined : validation.errors[0] };
  }
  if (route === "/mcp/workflow/context/append") {
    return hub.appendWorkflowContext({
      workflowId: typeof record.workflowId === "string" ? record.workflowId : "",
      report: typeof record.report === "string" ? record.report : "",
      handoff: typeof record.handoff === "string" ? record.handoff : "",
      artifacts: Array.isArray(record.artifacts) ? (record.artifacts as WorkflowArtifactReference[]) : [],
    });
  }
  if (route === "/mcp/workflow/run-context/append") {
    const request: AppendWorkflowRunContextRequest = {
      workflowId: typeof record.workflowId === "string" ? record.workflowId : "",
      runId: typeof record.runId === "string" ? record.runId : "",
      report: typeof record.report === "string" ? record.report : "",
      handoff: typeof record.handoff === "string" ? record.handoff : "",
      artifacts: Array.isArray(record.artifacts) ? (record.artifacts as WorkflowArtifactReference[]) : [],
    };
    if (typeof record.nodeId === "string") request.nodeId = record.nodeId;
    return hub.appendWorkflowRunContext(request);
  }
  return { ok: false, error: `Unknown MCP bridge route: ${route}` };
}

export async function startMcpBridge(hub: AgentHub, options: StartMcpBridgeOptions): Promise<McpBridgeServer> {
  const host = "127.0.0.1";
  const token = randomBytes(32).toString("hex");
  const server = http.createServer((request, response) => {
    void (async () => {
      if (request.method !== "POST") {
        jsonResponse(response, 405, { ok: false, error: "Method not allowed." });
        return;
      }
      if (!isAuthorized(request, token)) {
        jsonResponse(response, 401, { ok: false, error: "Unauthorized." });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const payload = await routeWorkflowRequest(hub, request.url ?? "", body);
        jsonResponse(response, 200, payload);
      } catch (error) {
        jsonResponse(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  await mkdir(path.dirname(options.discoveryPath), { recursive: true });
  await writeFile(
    options.discoveryPath,
    `${JSON.stringify({ host, port: address.port, token, pid: process.pid, startedAt: Date.now() }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  return {
    host,
    port: address.port,
    token,
    discoveryPath: options.discoveryPath,
    stop: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await rm(options.discoveryPath, { force: true });
    },
  };
}
