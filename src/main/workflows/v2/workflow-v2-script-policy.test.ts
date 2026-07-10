import { describe, expect, test } from "vitest";
import type { WorkflowV2ScriptNode } from "../../../shared/workflow-v2/definition";
import { executeWorkflowV2ScriptWithPolicy } from "./workflow-v2-script-policy";

function scriptNode(sandboxMode: WorkflowV2ScriptNode["sandboxMode"]): WorkflowV2ScriptNode {
  return {
    id: `script-${sandboxMode}`,
    kind: "script",
    title: `Script ${sandboxMode}`,
    execModel: "script",
    sandboxMode,
    script: { language: "bash", code: "printf unsafe", timeoutMs: 1_000 },
    outputFields: [{ key: "stdout", required: true }],
  };
}

describe("Workflow V2 product script policy", () => {
  test.each(["sandbox", "workspace"] as const)("fails closed when the %s isolation backend is unavailable", async (sandboxMode) => {
    await expect(executeWorkflowV2ScriptWithPolicy({
      node: scriptNode(sandboxMode),
      workDir: "/tmp/workflow-v2-policy",
      sandboxMode,
      upstreamOutputs: [],
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })).rejects.toThrow(`Workflow V2 ${sandboxMode} sandbox policy is unavailable`);
  });

  test("fails closed when full execution has not received Phase 04 human approval", async () => {
    await expect(executeWorkflowV2ScriptWithPolicy({
      node: scriptNode("full"),
      workDir: "/tmp/workflow-v2-policy",
      sandboxMode: "full",
      upstreamOutputs: [],
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })).rejects.toThrow("Workflow V2 full script execution requires human approval");
  });
});
