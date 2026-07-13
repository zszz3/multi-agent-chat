import { describe, expect, test } from "vitest";
import { clearWorkflowNodeInputDraft, updateWorkflowNodeInputDrafts } from "./workflow-node-input-controller";

describe("workflow node input drafts", () => {
  test("keeps drafts isolated by node surface scope", () => {
    const first = updateWorkflowNodeInputDrafts({}, "agent:research", "message", "hello");
    const second = updateWorkflowNodeInputDrafts(first, "script:transform", "body", "{\"ok\":true}");
    expect(second).toEqual({
      "agent:research": { message: "hello" },
      "script:transform": { body: "{\"ok\":true}" },
    });
  });

  test("clears only the successfully submitted node draft", () => {
    const drafts = {
      "agent:research": { message: "hello" },
      "script:transform": { body: "{}" },
    };
    expect(clearWorkflowNodeInputDraft(drafts, "agent:research")).toEqual({
      "script:transform": { body: "{}" },
    });
  });
});
