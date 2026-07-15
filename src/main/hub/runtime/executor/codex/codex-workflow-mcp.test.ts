import { describe, expect, test } from "vitest";
import { codexWorkflowMcpArgs } from "./codex-workflow-mcp";

describe("codexWorkflowMcpArgs", () => {
  test("injects a workflow-scoped MCP server for planning", () => {
    const args = codexWorkflowMcpArgs("C:/app/mcp-bridge.json", "wf-1");
    expect(args.join("\n")).toContain("mcp_servers.multi_agent_chat.command");
    expect(args.join("\n")).toContain("MULTI_AGENT_CHAT_MCP_BRIDGE");
    expect(args.join("\n")).toContain("wf-1");
  });

  test("does not inject workflow tools without a planning id", () => {
    expect(codexWorkflowMcpArgs("C:/app/mcp-bridge.json", undefined)).toEqual([]);
  });
});
