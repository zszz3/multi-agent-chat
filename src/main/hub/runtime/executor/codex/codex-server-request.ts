import type { CodexRpcClient } from "../../../../agents/codex/codex-rpc";
import {
  respondToCodexServerRequest,
  type CodexServerRequestOptions,
} from "../../../codex/agent-hub-codex-app";
import { handleCodexWorkflowToolCall } from "../../../codex/agent-hub-codex-workflow-tools";
import type { RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";

export function respondToCodexRuntimeServerRequest(
  options: RuntimeAgentExecutorFactoryOptions,
  client: CodexRpcClient,
  id: number,
  method: string,
  params: Record<string, unknown>,
  responseOptions: CodexServerRequestOptions = {},
): void {
  const workflowTools = options.workflowHost?.tools;
  respondToCodexServerRequest(client, id, method, params, {
    ...responseOptions,
    ...(workflowTools
      ? { handleWorkflowToolCall: (toolParams: Record<string, unknown>) => handleCodexWorkflowToolCall(toolParams, workflowTools) }
      : {}),
  });
}
