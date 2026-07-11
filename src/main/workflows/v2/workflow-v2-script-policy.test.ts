import { describe, expect, test } from "vitest";
import type { WorkflowV2ScriptNode } from "../../../shared/workflow-v2/definition";
import { executeWorkflowV2ScriptWithPolicy } from "./workflow-v2-script-policy";

function request(node: WorkflowV2ScriptNode, approved = false) {
  return { node, workDir: process.cwd(), sandboxMode: node.sandboxMode, upstreamOutputs: [], signal: new AbortController().signal, timeoutMs: 2_000, approved };
}

describe("Workflow V2 product script policy", () => {
  test("rejects legacy free-form scripts before side effects", async () => {
    await expect(executeWorkflowV2ScriptWithPolicy(request({ id: "legacy", kind: "script", title: "Legacy", execModel: "script", sandboxMode: "sandbox", script: { language: "bash", code: "echo unsafe" }, outputFields: [{ key: "stdout", required: true }] }))).rejects.toThrow("legacy/free-form scripts remain disabled");
  });

  test("executes an allowlisted read-only typed command", async () => {
    const output = await executeWorkflowV2ScriptWithPolicy(request({ id: "status", kind: "script", title: "Git status", execModel: "script", sandboxMode: "sandbox", script: { command: "git", args: ["status", "--short"], cwdPolicy: "workflow", access: "read-only", timeoutMs: 2_000, outputSchema: { type: "object", required: ["stdout"] } }, outputFields: [{ key: "stdout", required: true }] }));
    expect(output.nodeId).toBe("status");
    expect(output.outputs).toHaveProperty("stdout");
  });

  test("rejects workspace-write without approval", async () => {
    await expect(executeWorkflowV2ScriptWithPolicy(request({ id: "write", kind: "script", title: "Write", execModel: "script", sandboxMode: "workspace", script: { command: "git", args: ["status"], cwdPolicy: "workflow", access: "workspace-write", outputSchema: { type: "object" } }, outputFields: [] }))).rejects.toThrow("requires explicit approval");
  });

  test("rejects shell syntax in arguments", async () => {
    await expect(executeWorkflowV2ScriptWithPolicy(request({ id: "bad", kind: "script", title: "Bad", execModel: "script", sandboxMode: "sandbox", script: { command: "git", args: ["status", "; rm"], cwdPolicy: "workflow", access: "read-only", outputSchema: { type: "object" } }, outputFields: [] }))).rejects.toThrow("forbidden shell syntax");
  });
});
