import { describe, expect, test } from "vitest";
import { normalizeClaudeSdkEvent } from "./claude-sdk-events";

describe("normalizeClaudeSdkEvent", () => {
  test("maps approval and input events into shared AgentEvent values", () => {
    expect(
      normalizeClaudeSdkEvent({
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
      normalizeClaudeSdkEvent({
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
      normalizeClaudeSdkEvent({
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
  });
});
