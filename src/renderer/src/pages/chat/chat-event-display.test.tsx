import { describe, expect, test } from "vitest";
import { chatEventDisplayContent } from "./chat-event-display";

describe("chatEventDisplayContent", () => {
  test("renders approval requests and responses with explicit state", () => {
    expect(
      chatEventDisplayContent({
        id: "evt-1",
        type: "approval_request",
        content: "Allow Bash to run `git status`?",
        requestId: "approval-1",
        requestState: "live",
        timestamp: 0,
        metadata: { toolName: "Bash" },
      }),
    ).toBe("approval pending\nAllow Bash to run `git status`?");

    expect(
      chatEventDisplayContent({
        id: "evt-2",
        type: "approval_response",
        content: "Approved by user",
        requestId: "approval-1",
        decision: "approved",
        timestamp: 1,
      }),
    ).toBe("approval approved\nApproved by user");
  });

  test("renders expired user-input requests honestly", () => {
    expect(
      chatEventDisplayContent({
        id: "evt-3",
        type: "user_input_request",
        content: "Provide PROD_API_KEY",
        requestId: "input-1",
        requestState: "expired",
        timestamp: 2,
      }),
    ).toBe("input request expired\nProvide PROD_API_KEY");
  });
});
