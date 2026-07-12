import { describe, expect, test } from "vitest";
import { AgentHub } from "./agent-hub";

describe("AgentHub workflow activation", () => {
  test("keeps the originating planning workflow active while a tool-created workflow is materialized", () => {
    const hub = new AgentHub();
    const sourceWorkflow = hub.createWorkflowDraft({ configuredAgentId: "default-agent" }).workflowDraft;
    expect(sourceWorkflow).toBeDefined();
    if (!sourceWorkflow) return;
    Reflect.get(hub, "activeWorkflowDraftRequests").set(sourceWorkflow.workflowId, { requestId: "planning-request", assistantMessageId: "assistant-message", content: "" });
    const created = hub.createWorkflow({
      title: "Temporary tool workflow",
      objective: "Answer a question",
      definition: {
        workflowId: "placeholder",
        graphVersion: 1,
        objective: "Answer a question",
        nodes: [{ id: "answer", kind: "answer", title: "Answer", execModel: "llm", executionMode: "one-shot", prompt: "Answer the question.", outputFields: [{ key: "answer_markdown", required: true }] }],
        edges: [],
      },
    });
    expect(created.ok).toBe(true);
    expect(hub.snapshot().workflowDraft?.workflowId).toBe(sourceWorkflow.workflowId);
  });
});
