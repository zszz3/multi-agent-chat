import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { callMcpTool, mcpToolDefinitions, resolveBridgeDiscoveryPath } from "./server";

const originalEnv = process.env.MULTI_AGENT_CHAT_MCP_BRIDGE;

describe("MCP server tools", () => {
  afterEach(() => {
    process.env.MULTI_AGENT_CHAT_MCP_BRIDGE = originalEnv;
    vi.restoreAllMocks();
  });

  test("exposes the first-version workflow tool set", () => {
    expect(mcpToolDefinitions().map((tool) => tool.name)).toEqual([
      "agent_templates_list",
      "workflow_create",
      "workflow_list",
      "workflow_get",
      "workflow_update",
      "workflow_validate",
      "workflow_context_append",
      "workflow_run_context_append",
    ]);
  });

  test("uses env override for bridge discovery", () => {
    process.env.MULTI_AGENT_CHAT_MCP_BRIDGE = "/tmp/custom-bridge.json";

    expect(resolveBridgeDiscoveryPath()).toBe("/tmp/custom-bridge.json");
  });

  test("calls bridge endpoints with discovery token", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-mcp-server-"));
    const discoveryPath = path.join(dir, "bridge.json");
    process.env.MULTI_AGENT_CHAT_MCP_BRIDGE = discoveryPath;
    await writeFile(discoveryPath, JSON.stringify({ host: "127.0.0.1", port: 48123, token: "secret" }), "utf8");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, workflowId: "wf_1" }),
    } as Response);

    const result = await callMcpTool("workflow_create", { title: "T", objective: "O", graph: { title: "T", objective: "O", nodes: [], edges: [] } });

    expect(result).toEqual({ ok: true, workflowId: "wf_1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:48123/mcp/workflow/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer secret" }),
      }),
    );
  });
});
