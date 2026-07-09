import { describe, expect, test } from "vitest";
import { resolveWorkflowNodeAgent } from "./workflow-runtime";

const AGENTS = [
  { id: "agent-a", modelId: "model-a" },
  { id: "agent-b", modelId: "model-b" },
];
const WORKFLOW_DEFAULTS = { configuredAgentId: "agent-a", modelId: "model-a" };

describe("resolveWorkflowNodeAgent", () => {
  test("uses the workflow default when the node has no override", () => {
    expect(resolveWorkflowNodeAgent({}, WORKFLOW_DEFAULTS, AGENTS)).toEqual({ configuredAgentId: "agent-a", modelId: "model-a" });
  });

  test("uses the node's agent and that agent's default model when only the agent is overridden", () => {
    expect(resolveWorkflowNodeAgent({ configuredAgentId: "agent-b" }, WORKFLOW_DEFAULTS, AGENTS)).toEqual({
      configuredAgentId: "agent-b",
      modelId: "model-b",
    });
  });

  test("honours an explicit per-node model override", () => {
    expect(resolveWorkflowNodeAgent({ configuredAgentId: "agent-b", modelId: "model-x" }, WORKFLOW_DEFAULTS, AGENTS)).toEqual({
      configuredAgentId: "agent-b",
      modelId: "model-x",
    });
  });

  test("falls back to the workflow default model when the node overrides only the model", () => {
    expect(resolveWorkflowNodeAgent({ modelId: "model-x" }, WORKFLOW_DEFAULTS, AGENTS)).toEqual({
      configuredAgentId: "agent-a",
      modelId: "model-x",
    });
  });
});
