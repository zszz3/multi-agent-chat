import type { WorkflowV2ExecModel } from "../../../../shared/workflow-v2/definition";

export function workflowNodeOpenTarget(_execModel: WorkflowV2ExecModel): "conversation" {
  return "conversation";
}
