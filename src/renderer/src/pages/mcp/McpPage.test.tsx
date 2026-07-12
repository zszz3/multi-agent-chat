import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { McpPage } from "./McpPage";

vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined, multiAgentChat: { listMcpServers: async () => [], listAgentMcps: async () => [] } });

describe("McpPage", () => {
  test("exposes one workbench with server registry and agent bindings", () => {
    const html = renderToStaticMarkup(<McpPage agents={[{ id: "agent", name: "Agent", description: "", runtimeAgentId: "codex", channelId: "codex-openai", modelId: "default", tags: [], createdAt: 1, updatedAt: 1 }]} />);
    expect(html).toContain("Servers");
    expect(html).toContain("Agent bindings");
    expect(html).toContain("mcp-workbench");
  });
});
