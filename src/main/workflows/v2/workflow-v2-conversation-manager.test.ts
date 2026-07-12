import { describe, expect, test } from "vitest";
import type { AgentEvent, RuntimeConversation } from "../../../shared/types";
import { workflowNodeConversationId } from "../../../shared/workflow-v2/conversation";
import { WorkflowV2ConversationManager } from "./workflow-v2-conversation-manager";

function output() {
  return { nodeId: "collect", summary: "Requirements collected", outputs: { requirements: ["a", "b"] }, evidence: ["user confirmed"], proposals: [] };
}

describe("WorkflowV2ConversationManager", () => {
  test("publishes the conversation before the initial agent turn finishes", async () => {
    let release!: () => void;
    const initialTurn = new Promise<void>((resolve) => { release = resolve; });
    const manager = new WorkflowV2ConversationManager({
      now: () => 5,
      createSession: () => ({
        sendPrompt: () => initialTurn,
        interrupt: async () => undefined,
        close: async () => undefined,
        runtimeConversation: () => undefined,
      }),
    });

    const started = await manager.start({ workflowId: "w", runId: "r", nodeId: "interactive", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Collect requirements" });

    expect(started).toMatchObject({ status: "active", nodeId: "interactive" });
    expect(manager.get(started.conversationId)?.messages).toEqual([expect.objectContaining({ role: "system", content: "Collect requirements" })]);
    release();
  });
  test("preserves tool names so the node window can distinguish calls from results", async () => {
    let emit!: (event: AgentEvent) => void;
    const manager = new WorkflowV2ConversationManager({
      now: () => 8,
      createSession: (input) => {
        emit = input.emit;
        return { sendPrompt: async () => undefined, interrupt: async () => undefined, close: async () => undefined, runtimeConversation: () => undefined };
      },
    });
    const started = await manager.start({ workflowId: "w", runId: "r", nodeId: "n", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Inspect files" });
    emit({ type: "tool_call", name: "shell_command", content: "Get-ChildItem" });
    emit({ type: "tool_result", name: "shell_command", content: "package.json" });
    expect(manager.get(started.conversationId)?.messages.slice(-2)).toEqual([
      expect.objectContaining({ role: "tool", eventType: "tool_call", name: "shell_command" }),
      expect.objectContaining({ role: "tool", eventType: "tool_result", name: "shell_command" }),
    ]);
  });
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

    const confirmed = manager.completionProposal(started.conversationId);
    expect(confirmed.output).toEqual(output());
    expect(manager.get(started.conversationId)?.status).toBe("completion_proposed");
    await manager.closeCompleted(started.conversationId);
    expect(manager.get(started.conversationId)?.status).toBe("closed");
    expect(started.conversationId).toBe(workflowNodeConversationId("workflow-1", "run-1", "collect"));
  });

  test("keeps the conversation open until downstream persistence succeeds", async () => {
    const manager = new WorkflowV2ConversationManager({ now: () => 1, createSession: () => ({ sendPrompt: async () => undefined, interrupt: async () => undefined, close: async () => undefined, runtimeConversation: () => undefined }) });
    const started = await manager.start({ workflowId: "w", runId: "r", nodeId: "n", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Work" });
    expect(() => manager.completionProposal(started.conversationId)).toThrow(/no completion proposal/i);
    expect(manager.get(started.conversationId)?.status).toBe("active");
  });

  test("serializes completion confirmation and releases the interactive session", async () => {
    let closed = 0;
    const manager = new WorkflowV2ConversationManager({ now: () => 1, createSession: () => ({ sendPrompt: async () => undefined, interrupt: async () => undefined, close: async () => { closed += 1; }, runtimeConversation: () => undefined }) });
    const started = await manager.start({ workflowId: "w", runId: "r", nodeId: "n", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Work" });
    manager.proposeCompletion(started.conversationId, { output: output(), acceptanceCriteria: [], unresolvedRisks: [] });
    manager.beginCompletion(started.conversationId);
    expect(() => manager.beginCompletion(started.conversationId)).toThrow(/already being confirmed/i);
    await manager.closeCompleted(started.conversationId);
    expect(closed).toBe(1);
  });

  test("does not accept a new user message while completion is being confirmed", async () => {
    const manager = new WorkflowV2ConversationManager({ now: () => 1, createSession: () => ({ sendPrompt: async () => undefined, interrupt: async () => undefined, close: async () => undefined, runtimeConversation: () => undefined }) });
    const started = await manager.start({ workflowId: "w", runId: "r", nodeId: "n", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Work" });
    manager.proposeCompletion(started.conversationId, { output: output(), acceptanceCriteria: [], unresolvedRisks: [] });
    manager.beginCompletion(started.conversationId);
    await expect(manager.sendUserMessage(started.conversationId, "Actually change this.")).rejects.toThrow(/being confirmed/i);
  });

  test("ignores late agent events after a completed conversation is closed", async () => {
    let emit!: (event: AgentEvent) => void;
    const manager = new WorkflowV2ConversationManager({ now: () => 1, createSession: (input) => { emit = input.emit; return { sendPrompt: async () => undefined, interrupt: async () => undefined, close: async () => undefined, runtimeConversation: () => undefined }; } });
    const started = await manager.start({ workflowId: "w", runId: "r", nodeId: "n", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Work" });
    manager.proposeCompletion(started.conversationId, { output: output(), acceptanceCriteria: [], unresolvedRisks: [] });
    manager.beginCompletion(started.conversationId);
    await manager.closeCompleted(started.conversationId);
    emit({ type: "completed", content: "late result" });
    expect(manager.get(started.conversationId)?.status).toBe("closed");
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
  test("stopping a run interrupts and closes every active node session", async () => {
    const calls: string[] = [];
    const manager = new WorkflowV2ConversationManager({
      now: () => 30,
      createSession: ({ nodeId }) => ({
        sendPrompt: async () => undefined,
        interrupt: async () => { calls.push(`${nodeId}:interrupt`); },
        close: async () => { calls.push(`${nodeId}:close`); },
        runtimeConversation: () => undefined,
      }),
    });
    const first = await manager.start({ workflowId: "w", runId: "r", nodeId: "first", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Start" });
    const second = await manager.start({ workflowId: "w", runId: "r", nodeId: "second", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", initialPrompt: "Start" });

    await manager.stopRun("w", "r");

    expect(calls).toEqual(expect.arrayContaining(["first:interrupt", "first:close", "second:interrupt", "second:close"]));
    expect(manager.get(first.conversationId)).toMatchObject({ status: "closed" });
    expect(manager.get(second.conversationId)).toMatchObject({ status: "closed" });
    expect(manager.get(first.conversationId)?.messages.at(-1)?.content).toBe("Workflow run stopped by user.");
  });

  test("restores a conversation snapshot and lazily recreates its runtime session", async () => {
    const prompts: string[] = [];
    const manager = new WorkflowV2ConversationManager({
      now: () => 50,
      createSession: (input) => ({
        sendPrompt: async (prompt) => { prompts.push(prompt); },
        interrupt: async () => undefined,
        close: async () => undefined,
        runtimeConversation: () => undefined,
      }),
    });
    manager.restore([{
      conversationId: "w::r::n", workflowId: "w", runId: "r", nodeId: "n", configuredAgentId: "a", modelId: "m", workDir: "C:/workspace", status: "waiting_for_user",
      messages: [{ id: "w::r::n:1", role: "system", content: "Collect requirements", at: 1 }], createdAt: 1, updatedAt: 1, lastActivityAt: 1,
    }]);
    const restored = manager.get("w::r::n");
    expect(restored?.status).toBe("waiting_for_user");
    await manager.sendUserMessage("w::r::n", "US and EU");
    expect(prompts).toEqual(["US and EU"]);
  });});
