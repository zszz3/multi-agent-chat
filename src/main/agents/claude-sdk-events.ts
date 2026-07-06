import type { AgentEvent } from "../../shared/types";
import type { ClaudeSdkEvent } from "./claude-sdk-bindings";

export function normalizeClaudeSdkEvent(event: ClaudeSdkEvent): AgentEvent[] {
  if (event.type === "session") {
    return [{ type: "session", sessionId: event.sessionId }];
  }
  if (event.type === "delta") {
    return [{ type: "delta", content: event.content }];
  }
  if (event.type === "completed") {
    return event.content ? [{ type: "completed", content: event.content }] : [{ type: "completed" }];
  }
  if (event.type === "error") {
    return [{ type: "error", error: event.error }];
  }
  if (event.type === "approval_request") {
    return [
      {
        type: "approval_request",
        requestId: event.requestId,
        content: event.prompt,
        ...(event.toolName ? { metadata: { toolName: event.toolName } } : {}),
      },
    ];
  }
  if (event.type === "approval_response") {
    return [
      {
        type: "approval_response",
        requestId: event.requestId,
        decision: event.decision,
        ...(event.reason ? { content: event.reason } : {}),
      },
    ];
  }
  if (event.type === "user_input_request") {
    return [{ type: "user_input_request", requestId: event.requestId, content: event.prompt }];
  }
  return [{ type: "user_input_response", requestId: event.requestId, content: event.content }];
}
