import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AgentHub } from "./agent-hub";
import { startMcpBridge, type McpBridgeServer } from "./mcp-bridge";

let bridge: McpBridgeServer | undefined;

async function stopBridge(): Promise<void> {
  if (!bridge) return;
  await bridge.stop();
  bridge = undefined;
}

async function bridgeRequest(route: string, token: string, body: unknown): Promise<Response> {
  if (!bridge) throw new Error("bridge not started");
  return fetch(`http://${bridge.host}:${bridge.port}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("MCP bridge", () => {
  afterEach(async () => {
    await stopBridge();
  });

  test("starts on a dynamic localhost port and writes discovery metadata", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-mcp-"));
    const discoveryPath = path.join(dir, "bridge.json");

    bridge = await startMcpBridge(new AgentHub(), { discoveryPath });

    expect(bridge.host).toBe("127.0.0.1");
    expect(bridge.port).toBeGreaterThan(0);
    expect(bridge.token).toHaveLength(64);
    const discovery = JSON.parse(await readFile(discoveryPath, "utf8")) as any;
    expect(discovery).toMatchObject({
      host: "127.0.0.1",
      port: bridge.port,
      token: bridge.token,
    });
  });

  test("requires bearer token and exposes workflow tools", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-mcp-"));
    const hub = new AgentHub();
    hub.updateConfiguredAgents([
      {
        id: "repo-reviewer",
        name: "Repo Reviewer",
        description: "Reviews repos and writes docs.",
        runtimeAgentId: "codex",
        channelId: "codex-openai",
        modelId: "default",
        prompt: "Review the repository.",
        tags: ["review"],
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
      },
    ]);
    bridge = await startMcpBridge(hub, { discoveryPath: path.join(dir, "bridge.json") });

    const unauthorized = await fetch(`http://${bridge.host}:${bridge.port}/mcp/workflow/list`, { method: "POST" });
    expect(unauthorized.status).toBe(401);

    const agents = (await (await bridgeRequest("/mcp/agents/list", bridge.token, {})).json()) as any;
    expect(agents).toMatchObject({
      ok: true,
      agents: [
        {
          id: "repo-reviewer",
          name: "Repo Reviewer",
          runtimeAgentId: "codex",
          prompt: "Review the repository.",
        },
      ],
    });

    const create = await bridgeRequest("/mcp/workflow/create", bridge.token, {
      title: "Review workflow",
      objective: "Review example service",
      graph: {
        title: "Review workflow",
        objective: "Review example service",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "review", kind: "agent", title: "Review", prompt: "Review code.", agentId: "codex", channelId: "", modelId: "default" },
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->review", fromNodeId: "start", toNodeId: "review" },
          { id: "review->end", fromNodeId: "review", toNodeId: "end" },
        ],
      },
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as any;
    expect(created).toMatchObject({ ok: true, revision: 1, validation: { valid: true } });
    expect(created.workflowId).toMatch(/^wf_/);

    const list = (await (await bridgeRequest("/mcp/workflow/list", bridge.token, {})).json()) as any;
    expect(list.workflows).toEqual([
      expect.objectContaining({
        workflowId: created.workflowId,
        title: "Review workflow",
        status: "draft",
        revision: 1,
        nodeCount: 3,
      }),
    ]);

    const context = await bridgeRequest("/mcp/workflow/context/append", bridge.token, {
      workflowId: created.workflowId,
      report: "Reviewed the service.",
      handoff: "Writer can produce the summary.",
      artifacts: [{ kind: "text", title: "Finding", content: "No blockers." }],
    });
    expect(await context.json()).toMatchObject({ ok: true, workflowId: created.workflowId, revision: 2 });

    const get = (await (await bridgeRequest("/mcp/workflow/get", bridge.token, { workflowId: created.workflowId })).json()) as any;
    expect(get.workflow.contextDocument).toContain("Reviewed the service.");
  });
});
