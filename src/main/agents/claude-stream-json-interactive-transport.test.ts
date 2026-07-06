import { describe, expect, test } from "vitest";
import type { AgentEvent } from "../../shared/types";

describe("ClaudeStreamJsonInteractiveTransport", () => {
  test("passes persisted Claude resume metadata into the stream-json binding before the turn starts", async () => {
    const { ClaudeStreamJsonInteractiveTransport } = await import("./claude-stream-json-interactive-transport");
    const starts: Array<{
      prompt: string;
      cwd: string;
      model: string | undefined;
      resumeSessionId: string | undefined;
      projectKey: string | undefined;
      subpaths: string[] | undefined;
      claudeConfigDir: string | undefined;
      sessionStoreRef: string | undefined;
    }> = [];

    const transport = new ClaudeStreamJsonInteractiveTransport({
      executable: "claude",
      envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
      streamJsonModelForTurn: (modelId) => modelId,
      loadBindings: async () => ({
        startTurn: async (input) => {
          starts.push({
            prompt: input.prompt,
            cwd: input.cwd,
            model: input.model,
            resumeSessionId: input.resume?.sessionId,
            projectKey: input.resume?.projectKey,
            subpaths: input.resume?.subpaths,
            claudeConfigDir: input.claudeConfigDir,
            sessionStoreRef: input.sessionStoreRef,
          });
          input.onStreamJsonEvent({ type: "session", sessionId: input.resume?.sessionId ?? "stream-json-session-2" });
          input.onStreamJsonEvent({ type: "completed", content: "reply" });
          return { interrupt: async () => undefined, stop: async () => undefined };
        },
      }),
    });

    await transport.startTurn({
      prompt: "hello",
      modelId: "claude-sonnet-4-6",
      cwd: "C:/repo",
      resumeState: {
        runtimeId: "claude",
        native: {
          sessionId: "stream-json-session-1",
          projectKey: "project-1",
          subpaths: ["worker-1"],
        },
        appContext: {
          cwd: "C:/repo",
          modelId: "claude-sonnet-4-6",
          claudeConfigDir: "C:/claude-config",
          sessionStoreRef: "session-store-a",
        },
      },
      onEvent: () => undefined,
    });

    expect(starts).toEqual([
      {
        prompt: "hello",
        cwd: "C:/repo",
        model: "claude-sonnet-4-6",
        resumeSessionId: "stream-json-session-1",
        projectKey: "project-1",
        subpaths: ["worker-1"],
        claudeConfigDir: "C:/claude-config",
        sessionStoreRef: "session-store-a",
      },
    ]);
  });

  test("normalizes stream-json turn events into the shared AgentEvent stream", async () => {
    const { ClaudeStreamJsonInteractiveTransport } = await import("./claude-stream-json-interactive-transport");
    const emitted: AgentEvent[] = [];
    const transport = new ClaudeStreamJsonInteractiveTransport({
      executable: "claude",
      envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
      streamJsonModelForTurn: (modelId) => modelId,
      loadBindings: async () => ({
        startTurn: async (input) => {
          input.onStreamJsonEvent({ type: "session", sessionId: "stream-json-session-2" });
          input.onStreamJsonEvent({ type: "delta", content: "Hello" });
          input.onStreamJsonEvent({ type: "completed", content: "Hello" });
          return { interrupt: async () => undefined, stop: async () => undefined };
        },
      }),
    });

    await transport.startTurn({
      prompt: "hello",
      modelId: "claude-sonnet-4-6",
      cwd: "C:/repo",
      onEvent: (event) => emitted.push(event),
    });

    expect(emitted).toEqual([
      { type: "session", sessionId: "stream-json-session-2" },
      { type: "delta", content: "Hello" },
      { type: "completed", content: "Hello" },
    ]);
  });

  test("forwards approval and input events from onStreamJsonEvent into shared AgentEvent output", async () => {
    const { ClaudeStreamJsonInteractiveTransport } = await import("./claude-stream-json-interactive-transport");
    const emitted: AgentEvent[] = [];
    const transport = new ClaudeStreamJsonInteractiveTransport({
      executable: "claude",
      envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
      streamJsonModelForTurn: (modelId) => modelId,
      loadBindings: async () => ({
        startTurn: async (input) => {
          input.onStreamJsonEvent({
            type: "approval_request",
            requestId: "approval-1",
            prompt: "Allow Bash?",
            toolName: "Bash",
          });
          input.onStreamJsonEvent({
            type: "approval_response",
            requestId: "approval-1",
            decision: "approved",
            reason: "ok",
          });
          input.onStreamJsonEvent({
            type: "user_input_request",
            requestId: "input-1",
            prompt: "Provide token",
          });
          input.onStreamJsonEvent({
            type: "user_input_response",
            requestId: "input-1",
            content: "token-123",
          });
          return { interrupt: async () => undefined, stop: async () => undefined };
        },
      }),
    });

    await transport.startTurn({
      prompt: "hello",
      modelId: "claude-sonnet-4-6",
      cwd: "C:/repo",
      onEvent: (event) => emitted.push(event),
    });

    expect(emitted).toEqual([
      { type: "approval_request", requestId: "approval-1", content: "Allow Bash?", metadata: { toolName: "Bash" } },
      { type: "approval_response", requestId: "approval-1", decision: "approved", content: "ok" },
      { type: "user_input_request", requestId: "input-1", content: "Provide token" },
      { type: "user_input_response", requestId: "input-1", content: "token-123" },
    ]);
  });
});
