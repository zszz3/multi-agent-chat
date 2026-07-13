import { describe, expect, test } from "vitest";
import { workflowNodeOpenTarget } from "./workflow-node-open-policy";

describe("workflow node open policy", () => {
  test("opens every LLM node in the agent conversation window", () => {
    expect(workflowNodeOpenTarget("llm")).toBe("conversation");
  });

  test("opens script nodes in the runtime activity window", () => {
    expect(workflowNodeOpenTarget("script")).toBe("conversation");
  });
});
