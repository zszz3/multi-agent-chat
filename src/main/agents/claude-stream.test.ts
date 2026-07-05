import { describe, expect, test } from "vitest";
import { classifyClaudeNativeCommandFailure, createClaudeStreamState, normalizeClaudeStreamEvent } from "./claude-stream";

describe("normalizeClaudeStreamEvent", () => {
  test("extracts assistant text from Claude stream-json messages", () => {
    const events = normalizeClaudeStreamEvent({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "Hello from Claude" }],
      },
    });

    expect(events).toEqual([{ type: "delta", content: "Hello from Claude" }]);
  });

  test("extracts result session id and completion", () => {
    const events = normalizeClaudeStreamEvent({
      type: "result",
      subtype: "success",
      session_id: "session-123",
      result: "Final answer",
    });

    expect(events).toEqual([
      { type: "session", sessionId: "session-123" },
      { type: "completed", content: "Final answer" },
    ]);
  });

  test("emits only new text when Claude partial messages are snapshots", () => {
    const state = createClaudeStreamState();

    expect(
      normalizeClaudeStreamEvent(
        { type: "assistant", message: { content: [{ type: "text", text: "Hel" }] } },
        state,
      ),
    ).toEqual([{ type: "delta", content: "Hel" }]);
    expect(
      normalizeClaudeStreamEvent(
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } },
        state,
      ),
    ).toEqual([{ type: "delta", content: "lo" }]);
  });

  test("streams token deltas from partial message stream events", () => {
    const state = createClaudeStreamState();

    expect(
      normalizeClaudeStreamEvent(
        { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } } },
        state,
      ),
    ).toEqual([{ type: "delta", content: "Hel" }]);
    expect(
      normalizeClaudeStreamEvent(
        { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } } },
        state,
      ),
    ).toEqual([{ type: "delta", content: "lo" }]);
    expect(
      normalizeClaudeStreamEvent(
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } },
        state,
      ),
    ).toEqual([]);
  });

  test("does not duplicate result text after assistant text already streamed", () => {
    const state = createClaudeStreamState();

    normalizeClaudeStreamEvent({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } }, state);

    expect(
      normalizeClaudeStreamEvent(
        { type: "result", subtype: "success", session_id: "session-123", result: "Hello" },
        state,
      ),
    ).toEqual([
      { type: "session", sessionId: "session-123" },
      { type: "completed" },
    ]);
  });

  test("maps result error payloads to error events", () => {
    expect(
      normalizeClaudeStreamEvent({
        type: "result",
        subtype: "error",
        session_id: "session-123",
        result: "Unknown slash command /foo",
      }),
    ).toEqual([
      { type: "session", sessionId: "session-123" },
      { type: "error", error: "Unknown slash command /foo" },
    ]);
  });

  test("classifies generic Claude exit failures as runtime_failure instead of invalid_command", () => {
    expect(
      classifyClaudeNativeCommandFailure({
        prompt: "/foo",
        error: "Claude exited with code 1",
      }),
    ).toBe("runtime_failure");
  });
});
