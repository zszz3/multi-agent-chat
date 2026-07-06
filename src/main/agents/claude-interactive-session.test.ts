import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { AgentRuntime, ChatRuntimeSessionState, PersistedResumeState } from "../../shared/types";
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

function baseClaudeContext(dir: string) {
  return {
    chatId: "chat-1",
    configuredAgentId: "claude-agent",
    runtimeId: "claude" as const,
    runtime: claudeRuntime("claude"),
    channelId: "claude-code",
    workDir: dir,
    modelId: "claude-sonnet-4-6",
    developerInstructions: "test",
    emit: () => undefined,
  };
}

describe("ClaudeInteractiveSession", () => {
  test("passes the persisted Claude resume envelope into the transport", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-resume-envelope-"));
    const starts: Array<{
      resumeState?: Extract<PersistedResumeState, { runtimeId: "claude" }>;
    }> = [];

    const session = new ClaudeInteractiveSession(
      {
        chatId: "chat-1",
        configuredAgentId: "claude-agent",
        runtimeId: "claude",
        runtime: claudeRuntime("claude"),
        channelId: "claude-code",
        workDir: dir,
        modelId: "claude-sonnet-4-6",
        developerInstructions: "test",
        resumeState: {
          runtimeId: "claude",
          native: {
            sessionId: "claude-session-1",
            projectKey: "project-1",
            subpaths: ["subagent-a"],
          },
          appContext: {
            cwd: dir,
            modelId: "claude-sonnet-4-6",
            claudeConfigDir: "C:/claude-config",
            sessionStoreRef: "session-store-a",
          },
        },
        emit: () => undefined,
        syncState: () => undefined,
      },
      {
        now: () => 1000,
        capabilities: runtimeSessionCapabilities(),
        createTransport: () => ({
          kind: "stream-json",
          startTurn: async (input) => {
            starts.push(input.resumeState ? { resumeState: input.resumeState } : {});
            input.onEvent({ type: "completed", content: "reply" });
            return { stop: async () => undefined };
          },
          interrupt: async () => undefined,
          detach: async () => undefined,
        }),
      },
    );

    await session.sendPrompt("hello");

    expect(starts[0]?.resumeState).toMatchObject({
      runtimeId: "claude",
      native: {
        sessionId: "claude-session-1",
        projectKey: "project-1",
        subpaths: ["subagent-a"],
      },
      appContext: {
        cwd: dir,
        modelId: "claude-sonnet-4-6",
        claudeConfigDir: "C:/claude-config",
        sessionStoreRef: "session-store-a",
      },
    });
  });

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
          kind: "stream-json",
          startTurn: async (input) => {
            starts.push({
              prompt: input.prompt,
              ...(input.resumeState?.native.sessionId ? { sessionId: input.resumeState.native.sessionId } : {}),
            });
            input.onEvent({ type: "session", sessionId: input.resumeState?.native.sessionId ?? "claude-session-1" });
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
          kind: "stream-json",
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

  test("stages a Claude model change until the running turn finishes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-reconfigure-"));
    const startedModels: string[] = [];
    const syncStates: ChatRuntimeSessionState[] = [];
    let forwardEvent: ((event: { type: string; [key: string]: unknown }) => void) | undefined;
    const session = new ClaudeInteractiveSession(
      {
        ...baseClaudeContext(dir),
        syncState: (state) => syncStates.push(state),
      },
      {
        capabilities: runtimeSessionCapabilities(),
        now: () => 1000,
        createTransport: () => ({
          kind: "stream-json",
          startTurn: async (input) => {
            startedModels.push(input.modelId ?? "default");
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
    const syncCountBeforeReconfigure = syncStates.length;

    session.reconfigure({
      ...baseClaudeContext(dir),
      modelId: "claude-opus-4-6",
      syncState: (state) => syncStates.push(state),
    });

    expect(syncStates).toHaveLength(syncCountBeforeReconfigure + 1);
    expect(session.snapshot()).toMatchObject({
      attachmentState: "running",
      resumeState: { runtimeId: "claude", native: { sessionId: "claude-session-1" } },
    });

    forwardEvent?.({ type: "completed", content: "reply:first" });
    await session.sendPrompt("second");

    expect(startedModels).toEqual(["claude-sonnet-4-6", "claude-opus-4-6"]);
  });
});
