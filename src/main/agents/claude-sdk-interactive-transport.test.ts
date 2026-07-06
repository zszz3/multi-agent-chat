import { describe, expect, test } from "vitest";
import type { AgentEvent } from "../../shared/types";
import { ClaudeSdkInteractiveTransport } from "./claude-sdk-interactive-transport";

describe("ClaudeSdkInteractiveTransport", () => {
  test("passes persisted Claude resume metadata into the SDK binding before the turn starts", async () => {
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

    const transport = new ClaudeSdkInteractiveTransport({
      executable: "claude",
      envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
      sdkModelForTurn: (modelId) => modelId,
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
          input.onSdkEvent({ type: "session", sessionId: input.resume?.sessionId ?? "sdk-session-2" });
          input.onSdkEvent({ type: "completed", content: "reply" });
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
          sessionId: "sdk-session-1",
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
        resumeSessionId: "sdk-session-1",
        projectKey: "project-1",
        subpaths: ["worker-1"],
        claudeConfigDir: "C:/claude-config",
        sessionStoreRef: "session-store-a",
      },
    ]);
  });

  test("normalizes SDK turn events into the shared AgentEvent stream", async () => {
    const emitted: AgentEvent[] = [];
    const transport = new ClaudeSdkInteractiveTransport({
      executable: "claude",
      envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
      sdkModelForTurn: (modelId) => modelId,
      loadBindings: async () => ({
        startTurn: async (input) => {
          input.onSdkEvent({ type: "session", sessionId: "sdk-session-2" });
          input.onSdkEvent({ type: "delta", content: "Hello" });
          input.onSdkEvent({ type: "completed", content: "Hello" });
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
      { type: "session", sessionId: "sdk-session-2" },
      { type: "delta", content: "Hello" },
      { type: "completed", content: "Hello" },
    ]);
  });
});
