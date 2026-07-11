import { describe, expect, test } from "vitest";
import { WORKFLOW_DEVELOPER_INSTRUCTIONS } from "./agent-executor-workflow-shared";

describe("workflow manager execution-mode policy", () => {
  test("reserves one-shot for nodes that do not need user input", () => {
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("use one-shot only when all required inputs are already available");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("use interactive whenever the node may need user clarification");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("supplemental information");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("confirmation during execution");
    expect(WORKFLOW_DEVELOPER_INSTRUCTIONS).toContain("merely because the expected question seems simple");
  });
});
