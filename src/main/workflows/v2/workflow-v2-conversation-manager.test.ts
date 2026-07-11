import { describe, expect, test } from "vitest";
import type { AgentEvent, RuntimeConversation } from "../../../shared/types";
import { workflowNodeConversationId } from "../../../shared/workflow-v2/conversation";
import { WorkflowV2ConversationManager } from "./workflow-v2-conversation-manager";

function output() {
  return { nodeId: "collect", summary: "Requirements collected", outputs: { requirements: ["a", "b"] }, evidence: ["user confirmed"], proposals: [] };
}

describe("WorkflowV2ConversationManager", () => {
  test("reuses one interactive session across multiple user turns and requires confirmation", async () => {
    let now = 10;
    let createCount = 0;
    const prompts: string[] = [];
    let emit!: (event: AgentEvent) => void;
    const runtimeConversation: RuntimeConversation = { runtimeId: "codex", codecVersion: "1", payload: { threadId: "thread-1" } };
    const manager = new WorkflowV2ConversationManager({
      now: () => now++,
      createSession: (input) => {
        createCount += 1;
        emit = input.emit;
        return {
          sendPrompt: async (prompt) => { prompts.push(prompt); },
          interrupt: async () => undefined,
          close: async () => undefined,
          runtimeConversation: () => runtimeConversation,
        };
      },
    });

    const started = await manager.start({
      workflowId: "workflow-1",
      runId: "run-1",
      nodeId: "collect",
      configuredAgentId: "agent-1",
      modelId: "model-1",
      workDir: "C:/workspace",
      initialPrompt: "Collect deployment requirements.",
    });
    emit({ type: "delta", content: "Which regions should be supported?" });
    const waiting = manager.markWaitingForUser(started.conversationId, "Which regions should be supported?");
    const replied = await manager.sendUserMessage(started.conversationId, "US and EU.");
    const proposed = manager.proposeCompletion(started.conversationId, {
      output: output(),
      acceptanceCriteria: [{ key: "regions", satisfied: true, evidence: "US and EU" }],
      unresolvedRisks: [],
    });

    expect(createCount).toBe(1);
    expect(prompts).toEqual(["Collect deployment requirements.", "US and EU."]);
    expect(waiting.status).toBe("waiting_for_user");
    expect(replied.runtimeConversation).toEqual(runtimeConversation);
    expect(proposed.status).toBe("completion_proposed");
    expect(manager.get(started.conversationId)?.status).not.toBe("closed");

    const confirmed = manager.confirmCompletion(started.conversationId);
    expect(confirmed.output).toEqual(output());
    expect(manager.get(started.conversationId)?.status).toBe("closed");
    expect(started.conversationId).toBe(workflowNodeConversationId("workflow-1", "run-1", "collect"));
  });

  test("rejects a completion proposal by continuing the same conversation", async () => {
    let createdSession: object | undefined;
    const prompts: string[] = [];
    const manager = new WorkflowV2ConversationManager({
      now: () => 20,
      createSession: () => {
        const session = {
          sendPrompt: async (prompt: string) => { prompts.push(prompt); },
          interrupt: async () => undefined,
          close: async () => undefined,
          runtimeConversation: () => undefined,
        };
        createdSession = session;
        return session;
      },
    });
    const started = await manager.start({ workflowId: "w", runId: "r", nodeId: "n", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Start" });
    manager.proposeCompletion(started.conversationId, { output: output(), acceptanceCriteria: [], unresolvedRisks: [] });

    const rejected = await manager.rejectCompletion(started.conversationId, "Also collect the budget.");

    expect(createdSession).toBeDefined();
    expect(prompts).toEqual(["Start", "Also collect the budget."]);
    expect(rejected.status).toBe("active");
    expect(rejected.completionProposal).toBeUndefined();
  });
});
