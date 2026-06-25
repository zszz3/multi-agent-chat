import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { AgentHub } from "./agent-hub";
import type { AgentChannel, AgentId, ConfiguredAgent, CreateWorkflowRequest, UpdateWorkflowRequest, WorkflowArtifactReference, WorkflowGraph, AppendWorkflowRunContextRequest } from "../shared/types";
import { SKILL_TEMPLATES } from "../shared/skill-templates";
import { validateWorkflowGraph } from "../shared/workflow-graph";
import { DEFAULT_MODEL_ID, defaultChannelForAgent, defaultModelForAgent, isModelForChannel } from "../shared/models";

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

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isAgentId(value: unknown): value is AgentId {
  return value === "codex" || value === "claude" || value === "api";
}

function asTags(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.map((item) => asString(item)).filter((item): item is string => Boolean(item)))];
}

function publicChannel(channel: AgentChannel): unknown {
  return {
    id: channel.id,
    agentId: channel.agentId,
    label: channel.label,
    profileName: channel.profileName,
    modelProvider: channel.modelProvider,
    providerName: channel.providerName,
    baseUrl: channel.baseUrl,
    wireApi: channel.wireApi,
    modelReasoningEffort: channel.modelReasoningEffort,
    plugins: channel.plugins,
    models: channel.models,
    hasAuthorizationHeader: Boolean(channel.httpHeaders?.Authorization),
  };
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

function agentListPayload(hub: AgentHub): unknown {
  const snapshot = hub.snapshot();
  return {
    ok: true,
    agents: snapshot.configuredAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      runtimeAgentId: agent.runtimeAgentId,
      channelId: agent.channelId,
      modelId: agent.modelId,
      tags: agent.tags,
      updatedAt: agent.updatedAt,
    })),
    runtimes: snapshot.runtimes.map((runtime) => ({
      id: runtime.id,
      label: runtime.label,
      available: runtime.available,
      version: runtime.version,
      error: runtime.error,
    })),
    channels: snapshot.channels.map(publicChannel),
  };
}

function channelsListPayload(hub: AgentHub, record: Record<string, unknown>): unknown {
  const agentId = isAgentId(record.agentId) ? record.agentId : undefined;
  return {
    ok: true,
    channels: hub.snapshot().channels.filter((channel) => !agentId || channel.agentId === agentId).map(publicChannel),
  };
}

function modelsListPayload(hub: AgentHub, record: Record<string, unknown>): unknown {
  const agentId = isAgentId(record.agentId) ? record.agentId : undefined;
  const channelId = asString(record.channelId);
  const channels = hub.snapshot().channels.filter((channel) => (!agentId || channel.agentId === agentId) && (!channelId || channel.id === channelId));
  return {
    ok: true,
    channels: channels.map((channel) => ({
      channelId: channel.id,
      agentId: channel.agentId,
      label: channel.label,
      models: channel.models,
    })),
  };
}

function skillTemplateListPayload(): unknown {
  return {
    ok: true,
    templates: SKILL_TEMPLATES.map((template) => ({ ...template, tags: [...template.tags] })),
  };
}

function templatePatch(templateId: string | undefined): Partial<ConfiguredAgent> {
  if (!templateId) return {};
  const template = SKILL_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return {};
  return {
    name: template.name,
    description: template.description,
    tags: [...template.tags],
  };
}

function normalizeAgentInput(hub: AgentHub, record: Record<string, unknown>, existing?: ConfiguredAgent): ConfiguredAgent | { ok: false; error: string } {
  const snapshot = hub.snapshot();
  const now = Date.now();
  const template = templatePatch(asString(record.templateId));
  const runtimeAgentId = isAgentId(record.runtimeAgentId) ? record.runtimeAgentId : (existing?.runtimeAgentId ?? "codex");
  const channelIdInput = asString(record.channelId) ?? existing?.channelId;
  const channelId =
    channelIdInput && snapshot.channels.some((channel) => channel.id === channelIdInput && channel.agentId === runtimeAgentId)
      ? channelIdInput
      : defaultChannelForAgent(runtimeAgentId, snapshot.channels);
  const modelIdInput = asString(record.modelId) ?? existing?.modelId ?? DEFAULT_MODEL_ID;
  const modelId = isModelForChannel(runtimeAgentId, channelId, modelIdInput, snapshot.channels) ? modelIdInput : defaultModelForAgent(runtimeAgentId);
  const id = asString(record.id) ?? existing?.id;
  const name = asString(record.name) ?? template.name ?? existing?.name;
  if (!id) return { ok: false, error: "Agent id is required." };
  if (!name) return { ok: false, error: "Agent name is required." };
  return {
    id,
    name,
    description: asString(record.description) ?? template.description ?? existing?.description ?? "",
    runtimeAgentId,
    channelId,
    modelId,
    tags: asTags(record.tags, template.tags ?? existing?.tags ?? []),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function isAgentInputError(value: ConfiguredAgent | { ok: false; error: string }): value is { ok: false; error: string } {
  return "ok" in value && value.ok === false;
}

function upsertAgent(hub: AgentHub, agent: ConfiguredAgent, existingId?: string): unknown {
  const current = hub.listConfiguredAgents();
  const duplicate = current.find((item) => item.id === agent.id && item.id !== existingId);
  if (duplicate) return { ok: false, error: `Agent ${agent.id} already exists.` };
  const next = existingId ? current.map((item) => (item.id === existingId ? agent : item)) : [agent, ...current];
  const snapshot = hub.updateConfiguredAgents(next);
  return { ok: true, agent, agents: snapshot.configuredAgents };
}

async function routeWorkflowRequest(hub: AgentHub, route: string, body: unknown): Promise<unknown> {
  const record = asRecord(body);
  if (route === "/mcp/agent-templates/list" || route === "/mcp/skill-templates/list") return skillTemplateListPayload();
  if (route === "/mcp/agents/list") return agentListPayload(hub);
  if (route === "/mcp/channels/list") return channelsListPayload(hub, record);
  if (route === "/mcp/models/list") return modelsListPayload(hub, record);
  if (route === "/mcp/agents/create") {
    const agent = normalizeAgentInput(hub, record);
    if (isAgentInputError(agent)) return agent;
    if (hub.listConfiguredAgents().some((item) => item.id === agent.id)) return { ok: false, error: `Agent ${agent.id} already exists.` };
    return upsertAgent(hub, agent);
  }
  if (route === "/mcp/agents/update") {
    const agentId = asString(record.agentId);
    if (!agentId) return { ok: false, error: "agents_update requires agentId." };
    const existing = hub.listConfiguredAgents().find((agent) => agent.id === agentId);
    if (!existing) return { ok: false, error: `Agent ${agentId} was not found.` };
    const agent = normalizeAgentInput(hub, record, existing);
    if (isAgentInputError(agent)) return agent;
    return upsertAgent(hub, agent, agentId);
  }
  if (route === "/mcp/agents/delete") {
    const agentId = asString(record.agentId);
    if (!agentId) return { ok: false, error: "agents_delete requires agentId." };
    const current = hub.listConfiguredAgents();
    if (!current.some((agent) => agent.id === agentId)) return { ok: false, error: `Agent ${agentId} was not found.` };
    const snapshot = hub.updateConfiguredAgents(current.filter((agent) => agent.id !== agentId));
    return { ok: true, agentId, agents: snapshot.configuredAgents };
  }
  if (route === "/mcp/agents/test") {
    const agentId = asString(record.agentId);
    if (!agentId) return { ok: false, error: "agents_test requires agentId." };
    return hub.testConfiguredAgent(agentId);
  }
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
    };
    const configuredAgentId = asString(record.configuredAgentId);
    if (configuredAgentId) request.configuredAgentId = configuredAgentId;
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
