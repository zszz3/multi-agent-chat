import { describe, expect, test } from "vitest";
import { WORKFLOW_DEVELOPER_INSTRUCTIONS } from "./agent-executor-workflow-shared";

describe("workflow manager execution-mode policy", () => {
  test("reserves one-shot for nodes that do not need user input", () => {
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("one-shot only when it requires no user input and all inputs are already available");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("must be interactive");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("user information");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("confirmation");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("WorkflowV2Definition");
  });
});
