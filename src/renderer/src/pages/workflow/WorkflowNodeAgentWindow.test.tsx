import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { WorkflowNodeAgentWindow } from "./WorkflowNodeAgentWindow";

describe("WorkflowNodeAgentWindow", () => {
  test("renders a queued agent node before runtime activity exists", () => {
    const html = renderToStaticMarkup(<WorkflowNodeAgentWindow nodeTitle="Collect requirements" onClose={() => undefined} />);
    expect(html).toContain("Node has not started yet");
    expect(html).toContain("has not produced runtime activity yet");
    expect(html).toContain("there is no active conversation yet");
  });

  test("renders durable agent activity and enables the independent composer", () => {
    const html = renderToStaticMarkup(<WorkflowNodeAgentWindow
      nodeTitle="Collect requirements"
      onClose={() => undefined}
      onSend={() => undefined}
      conversation={{
        conversationId: "workflow::run::collect",
        workflowId: "workflow",
        runId: "run",
        nodeId: "collect",
        configuredAgentId: "agent",
        modelId: "model",
        workDir: "C:/workspace",
        status: "waiting_for_user",
        messages: [{ id: "m1", role: "assistant", content: "Which regions should be supported?", at: 1, eventType: "delta" }],
        createdAt: 1,
        updatedAt: 1,
        lastActivityAt: 1,
      }}
    />);
    expect(html).toContain("Which regions should be supported?");
    expect(html).toContain("workflow::run::collect");
    expect(html).not.toContain("textarea disabled");
  });

  test("visually labels system instructions, tool calls, and tool results", () => {
    const html = renderToStaticMarkup(<WorkflowNodeAgentWindow nodeTitle="Research" onClose={() => undefined} conversation={{
      conversationId: "workflow::run::research", workflowId: "workflow", runId: "run", nodeId: "research", configuredAgentId: "agent", modelId: "model", workDir: "C:/workspace", status: "active",
      messages: [
        { id: "m1", role: "system", content: "Research the topic", at: 1 },
        { id: "m2", role: "tool", content: "query", at: 2, eventType: "tool_call", name: "web_search" },
        { id: "m3", role: "tool", content: "3 results", at: 3, eventType: "tool_result", name: "web_search" },
      ], createdAt: 1, updatedAt: 4, lastActivityAt: 4,
    }} />);
    expect(html).toContain("System instruction");
    expect(html).toContain("Tool call");
    expect(html).toContain("Tool result");
    expect(html).toContain("web_search");
    expect(html).toContain("is-tool-call");
    expect(html).toContain("is-tool-result");
  });

  test("allows messaging an active interactive node before it explicitly asks for input", () => {
    const html = renderToStaticMarkup(<WorkflowNodeAgentWindow nodeTitle="Research" onClose={() => undefined} onSend={() => undefined} conversation={{
      conversationId: "w::r::research", workflowId: "w", runId: "r", nodeId: "research", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", status: "active", messages: [], createdAt: 1, updatedAt: 1, lastActivityAt: 1,
    }} />);
    expect(html).not.toContain("textarea disabled");
    expect(html).toContain("Send information to this node agent");
  });
  test("renders a switchable queue for parallel node conversations", () => {
    const html = renderToStaticMarkup(<WorkflowNodeAgentWindow
      nodeTitle="Research"
      onClose={() => undefined}
      onSelectNode={() => undefined}
      selectedNodeId="research"
      sessions={[
        { nodeId: "collect", nodeTitle: "Collect requirements", conversation: { conversationId: "w::r::collect", workflowId: "w", runId: "r", nodeId: "collect", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", status: "waiting_for_user", messages: [], createdAt: 1, updatedAt: 1, lastActivityAt: 1 } },
        { nodeId: "research", nodeTitle: "Research", conversation: { conversationId: "w::r::research", workflowId: "w", runId: "r", nodeId: "research", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", status: "active", messages: [], createdAt: 1, updatedAt: 1, lastActivityAt: 1 } },
        { nodeId: "review", nodeTitle: "Review", conversation: { conversationId: "w::r::review", workflowId: "w", runId: "r", nodeId: "review", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", status: "completion_proposed", messages: [], completionProposal: { output: { nodeId: "review", summary: "Done", outputs: {}, evidence: [], proposals: [] }, acceptanceCriteria: [], unresolvedRisks: [], proposedAt: 1 }, createdAt: 1, updatedAt: 1, lastActivityAt: 1 } },
      ]}
    />);
    expect(html).toContain("2 nodes need attention");
    expect(html).toContain("Collect requirements");
    expect(html).toContain("Research");
    expect(html).toContain("Review");
    expect(html).toContain("is-selected");
    expect(html).toContain("Waiting for input");
    expect(html).toContain("Running");
    expect(html).toContain("Confirm completion");
  });});
