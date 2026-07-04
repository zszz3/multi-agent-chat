import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AgentEvent, AgentRuntime, ChatRuntimeSessionState } from "../../shared/types";
import { CodexRpcClient } from "./codex-rpc";
import { CodexInteractiveSession } from "./codex-interactive-session";

function codexRuntime(command: string): AgentRuntime {
  return {
    id: "codex",
    label: "Codex",
    command,
    version: "test",
    available: true,
  };
}

function runtimeSessionCapabilities(): ChatRuntimeSessionState["capabilities"] {
  return {
    supportsInProcessConversationResume: true,
    supportsResumeAfterDetach: true,
    supportsResumeAfterAppRestart: true,
    supportsTurnResume: false,
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: true,
    supportsUserInputRequests: true,
  };
}

describe("CodexInteractiveSession", () => {
  test("shuts down the Codex client if attach fails after process start", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-attach-fail-"));
    const client = {
      start: vi.fn(async () => undefined),
      request: vi.fn(async (method: string) => {
        if (method === "thread/start") throw new Error("attach failed");
        return {};
      }),
      shutdown: vi.fn(async () => undefined),
      interruptTurn: vi.fn(async () => undefined),
    };

    const session = new CodexInteractiveSession(
      {
        chatId: "chat-1",
        configuredAgentId: "default-agent",
        runtimeId: "codex",
        runtime: codexRuntime("codex"),
        channelId: "codex-openai",
        workDir: dir,
        modelId: "default",
        developerInstructions: "test",
        emit: () => undefined,
        syncState: () => undefined,
      },
      {
        now: () => 500,
        createCodexClient: () => client as unknown as CodexRpcClient,
        capabilities: runtimeSessionCapabilities(),
      },
    );

    await expect(session.sendPrompt("First")).rejects.toThrow("attach failed");
    expect(client.shutdown).toHaveBeenCalledTimes(1);
    expect(session.snapshot().attachmentState).toBe("detached");
  });

  test("detaches an idle Codex attachment and resumes the same thread on the next prompt", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-session-"));
    const seen: AgentEvent[] = [];
    let callbacks:
      | {
          onEvent: (event: AgentEvent) => void;
          onExit: (code: number | null, signal: NodeJS.Signals | null, stderr: string) => void;
        }
      | undefined;
    const client = {
      start: vi.fn(async () => undefined),
      request: vi.fn(async (method: string, params: any) => {
        if (method === "thread/start") return { thread: { id: "thread-1" } };
        if (method === "thread/resume") return { thread: { id: params.threadId } };
        if (method === "turn/start") {
          callbacks?.onEvent({ type: "completed", content: `reply:${params.input[0].text}` });
          return { turn: { id: `turn-${params.input[0].text}` } };
        }
        return {};
      }),
      shutdown: vi.fn(async () => undefined),
      interruptTurn: vi.fn(async () => undefined),
    };

    const session = new CodexInteractiveSession(
      {
        chatId: "chat-1",
        configuredAgentId: "default-agent",
        runtimeId: "codex",
        runtime: codexRuntime("codex"),
        channelId: "codex-openai",
        workDir: dir,
        modelId: "default",
        developerInstructions: "test",
        emit: (event) => seen.push(event),
        syncState: () => undefined,
      },
      {
        now: () => 1000,
        createCodexClient: (input) => {
          callbacks = input;
          return client as unknown as CodexRpcClient;
        },
        capabilities: runtimeSessionCapabilities(),
      },
    );

    await session.sendPrompt("First");
    const first = session.snapshot().resumeState;
    expect(first).toMatchObject({
      runtimeId: "codex",
      native: { threadId: "thread-1" },
    });
    expect(session.snapshot().attachmentState).toBe("idle");

    await session.detachIfStillExpired({
      expectedGeneration: session.snapshot().attachmentGeneration,
      expectedLastMeaningfulActivityAt: session.snapshot().lastMeaningfulActivityAt!,
      reason: "idle_timeout",
    });

    await session.sendPrompt("Second");

    expect(client.request).toHaveBeenCalledWith("thread/resume", expect.objectContaining({ threadId: "thread-1" }));
    expect(session.snapshot().resumeState).toEqual(first);
  });

  test("interrupts the active Codex turn with its scoped turn id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-interrupt-"));
    const client = {
      start: vi.fn(async () => undefined),
      request: vi.fn(async (method: string) => {
        if (method === "thread/start") return { thread: { id: "thread-1" } };
        if (method === "turn/start") return { turn: { id: "turn-1" } };
        return {};
      }),
      shutdown: vi.fn(async () => undefined),
      interruptTurn: vi.fn(async () => undefined),
    };

    const session = new CodexInteractiveSession(
      {
        chatId: "chat-1",
        configuredAgentId: "default-agent",
        runtimeId: "codex",
        runtime: codexRuntime("codex"),
        channelId: "codex-openai",
        workDir: dir,
        modelId: "default",
        developerInstructions: "test",
        emit: () => undefined,
        syncState: () => undefined,
      },
      {
        now: () => 2000,
        createCodexClient: () => client as unknown as CodexRpcClient,
        capabilities: runtimeSessionCapabilities(),
      },
    );

    await session.sendPrompt("First");
    expect(session.snapshot().attachmentState).toBe("running");

    await session.interrupt();

    expect(client.interruptTurn).toHaveBeenCalledWith("thread-1", "turn-1");
    expect(session.snapshot().attachmentState).toBe("interrupted");
  });
});
