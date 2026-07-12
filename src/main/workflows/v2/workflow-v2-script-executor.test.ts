import { describe, expect, test } from "vitest";
import { executeWorkflowV2Script } from "./workflow-v2-script-executor";

describe("workflow-v2 script executor", () => {
  test("executes an auto-authorized inline typescript transform", async () => {
    const output = await executeWorkflowV2Script({
      node: {
        id: "echo",
        kind: "transform",
        title: "Echo",
        execModel: "script",
        executionMode: "script",
        outputFields: [{ key: "result", required: true }],
        script: {
          executable: { kind: "inline", language: "typescript", code: "return { result: 'ok' };" },
          parameters: [],
          capabilities: [],
          managerRisk: { level: "safe", rationale: "Pure in-memory transform." },
          outputSchema: { type: "object", required: ["result"] },
        },
      },
      workDir: process.cwd(),
      upstreamOutputs: [],
      signal: new AbortController().signal,
      timeoutMs: 2_000,
      authorization: { decision: "auto_allow", workflowId: "wf", graphVersion: 1, runId: "run", nodeId: "echo", risk: "safe", capabilities: [], capabilityDigest: "[]" },
    });

    expect(output.outputs).toEqual({ result: "ok" });
  });
});
