import { describe, expect, test } from "vitest";

describe("normalizeClaudeStreamJsonEvent", () => {
  test("maps approval and input events into shared AgentEvent values", async () => {
    const { normalizeClaudeStreamJsonEvent } = await import("./claude-stream-json-events");

    expect(
      normalizeClaudeStreamJsonEvent({
        type: "approval_request",
        requestId: "approval-1",
        prompt: "Allow Bash to run `git status`?",
        toolName: "Bash",
      }),
    ).toEqual([
      {
        type: "approval_request",
        requestId: "approval-1",
        content: "Allow Bash to run `git status`?",
        metadata: { toolName: "Bash" },
      },
    ]);

    expect(
      normalizeClaudeStreamJsonEvent({
        type: "approval_response",
        requestId: "approval-1",
        decision: "approved",
        reason: "User accepted",
      }),
    ).toEqual([
      {
        type: "approval_response",
        requestId: "approval-1",
        decision: "approved",
        content: "User accepted",
      },
    ]);

    expect(
      normalizeClaudeStreamJsonEvent({
        type: "user_input_request",
        requestId: "input-1",
        prompt: "Provide PROD_API_KEY",
      }),
    ).toEqual([
      {
        type: "user_input_request",
        requestId: "input-1",
        content: "Provide PROD_API_KEY",
      },
    ]);

    expect(
      normalizeClaudeStreamJsonEvent({
        type: "user_input_response",
        requestId: "input-1",
        content: "token-123",
      }),
    ).toEqual([
      {
        type: "user_input_response",
        requestId: "input-1",
        content: "token-123",
      },
    ]);
  });
});
