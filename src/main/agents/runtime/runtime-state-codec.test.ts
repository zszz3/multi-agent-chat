import { describe, expect, test } from "vitest";
import type { RuntimeConversation } from "../../../shared/types";
import { claudeRuntimeStateCodec, codexRuntimeStateCodec } from "./runtime-state-codec";

function runtimeConversation(runtimeId: RuntimeConversation["runtimeId"], payload: Record<string, unknown>): RuntimeConversation {
  return {
    runtimeId,
    codecVersion: "v1",
    payload,
  };
}

describe("runtime state codecs", () => {
  test("codex codec restores, decodes, and clones runtime conversations without exposing malformed payloads", () => {
    const raw = runtimeConversation("codex", {
      native: { threadId: "thread-1", sessionTreeRootId: "root-1" },
      appContext: { cwd: "C:/repo", modelId: "gpt-5.5", approvalPolicy: "never" },
      extensions: { source: "test" },
    });

    const restored = codexRuntimeStateCodec.restorePersistedConversation(raw);

    expect(restored).toEqual(raw);
    expect(restored).not.toBe(raw);
    expect(codexRuntimeStateCodec.decodeConversation(restored)).toEqual({
      native: { threadId: "thread-1", sessionTreeRootId: "root-1" },
      appContext: { cwd: "C:/repo", modelId: "gpt-5.5", approvalPolicy: "never" },
      extensions: { source: "test" },
    });
    expect(codexRuntimeStateCodec.cloneConversation(restored!)).toEqual(raw);
    expect(
      codexRuntimeStateCodec.restorePersistedConversation(
        runtimeConversation("codex", {
          native: {},
        }),
      ),
    ).toBeUndefined();
    expect(
      codexRuntimeStateCodec.cloneConversation(
        runtimeConversation("codex", {
          native: {},
        }),
      ),
    ).toBeUndefined();
  });

  test("claude codec restores resume payloads and rejects envelopes without a native session id", () => {
    const raw = runtimeConversation("claude", {
      native: { sessionId: "claude-session-1", projectKey: "project", subpaths: ["src"] },
      appContext: { cwd: "C:/repo", modelId: "claude-sonnet" },
      extensions: { source: "test" },
    });

    const restored = claudeRuntimeStateCodec.restorePersistedConversation(raw);

    expect(restored).toEqual(raw);
    expect(claudeRuntimeStateCodec.decodeConversation(restored)).toEqual({
      native: { sessionId: "claude-session-1", projectKey: "project", subpaths: ["src"] },
      appContext: { cwd: "C:/repo", modelId: "claude-sonnet" },
      extensions: { source: "test" },
    });
    expect(
      claudeRuntimeStateCodec.restorePersistedConversation(
        runtimeConversation("claude", {
          native: { projectKey: "missing-session-id" },
        }),
      ),
    ).toBeUndefined();
    expect(
      claudeRuntimeStateCodec.cloneConversation(
        runtimeConversation("claude", {
          native: { projectKey: "missing-session-id" },
        }),
      ),
    ).toBeUndefined();
  });
});
