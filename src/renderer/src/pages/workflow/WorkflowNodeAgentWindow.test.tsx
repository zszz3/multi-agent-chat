import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { WorkflowNodeAgentWindow } from "./WorkflowNodeAgentWindow";

describe("WorkflowNodeAgentWindow", () => {
  test("renders a connecting conversation surface before the backend session arrives", () => {
    const html = renderToStaticMarkup(<WorkflowNodeAgentWindow nodeTitle="Collect requirements" onClose={() => undefined} />);
    expect(html).toContain("Connecting to node agent");
    expect(html).toContain("interactive session is being created");
    expect(html).toContain("Connecting; input will be available shortly");
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
});