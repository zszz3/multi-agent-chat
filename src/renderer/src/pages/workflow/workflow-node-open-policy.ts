import type { WorkflowV2ExecModel } from "../../../../shared/workflow-v2/definition";

export function workflowNodeOpenTarget(execModel: WorkflowV2ExecModel): "conversation" | "editor" {
  return execModel === "llm" ? "conversation" : "editor";
}
