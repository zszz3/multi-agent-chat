import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { AgentRuntime, ChatRuntimeSessionState } from "../../shared/types";
import { ClaudeInteractiveSession } from "./claude-interactive-session";

function claudeRuntime(command: string): AgentRuntime {
  return {
    id: "claude",
    label: "Claude",
    command,
    version: "test",
    available: true,
  };
}

function runtimeSessionCapabilities(): ChatRuntimeSessionState["capabilities"] {
  return {
    supportsInProcessConversationResume: true,
    supportsResumeAfterDetach: false,
    supportsResumeAfterAppRestart: false,
    supportsTurnResume: false,
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: true,
    supportsUserInputRequests: true,
  };
}

describe("ClaudeInteractiveSession", () => {
  test("does not spawn Claude until the first prompt and reuses the same session id for follow-up prompts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-session-"));
    const starts: Array<{ prompt: string; sessionId?: string }> = [];
    const session = new ClaudeInteractiveSession(
      {
        chatId: "chat-1",
        configuredAgentId: "claude-agent",
        runtimeId: "claude",
        runtime: claudeRuntime("claude"),
        channelId: "claude-code",
        workDir: dir,
        modelId: "default",
        developerInstructions: "test",
        emit: () => undefined,
        syncState: () => undefined,
      },
      {
        now: () => 1000,
        capabilities: runtimeSessionCapabilities(),
        createTransport: () => ({
          startTurn: async (input) => {
            starts.push({
              prompt: input.prompt,
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            });
            input.onEvent({ type: "session", sessionId: input.sessionId ?? "claude-session-1" });
            input.onEvent({ type: "completed", content: `reply:${input.prompt}` });
            return { stop: async () => undefined };
          },
          interrupt: async () => undefined,
          detach: async () => undefined,
        }),
      },
    );

    expect(starts).toHaveLength(0);
    await session.sendPrompt("first");
    await session.sendPrompt("second");

    expect(starts).toEqual([
      { prompt: "first", sessionId: undefined },
      { prompt: "second", sessionId: "claude-session-1" },
    ]);
  });

  test("drops late Claude turn events after interrupt clears the active turn", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-interrupt-"));
    const emitted: Array<{ type: string; [key: string]: unknown }> = [];
    let forwardEvent: ((event: { type: string; [key: string]: unknown }) => void) | undefined;
    const session = new ClaudeInteractiveSession(
      {
        chatId: "chat-1",
        configuredAgentId: "claude-agent",
        runtimeId: "claude",
        runtime: claudeRuntime("claude"),
        channelId: "claude-code",
        workDir: dir,
        modelId: "default",
        developerInstructions: "test",
        emit: (event) => emitted.push(event as { type: string; [key: string]: unknown }),
        syncState: () => undefined,
      },
      {
        now: () => 1000,
        capabilities: runtimeSessionCapabilities(),
        createTransport: () => ({
          startTurn: async (input) => {
            forwardEvent = input.onEvent as (event: { type: string; [key: string]: unknown }) => void;
            input.onEvent({ type: "session", sessionId: "claude-session-1" });
            return { stop: async () => undefined };
          },
          interrupt: async () => undefined,
          detach: async () => undefined,
        }),
      },
    );

    await session.sendPrompt("first");
    expect(session.snapshot().activeTurnId).toBeDefined();

    await session.interrupt();
    expect(session.snapshot()).toMatchObject({
      attachmentState: "interrupted",
    });
    expect(session.snapshot().activeTurnId).toBeUndefined();

    const eventCountBeforeLateOutput = emitted.length;
    forwardEvent?.({ type: "delta", content: "late" });
    forwardEvent?.({ type: "completed", content: "reply:first" });

    expect(emitted).toHaveLength(eventCountBeforeLateOutput);
    expect(session.snapshot()).toMatchObject({
      attachmentState: "interrupted",
    });
  });
});
