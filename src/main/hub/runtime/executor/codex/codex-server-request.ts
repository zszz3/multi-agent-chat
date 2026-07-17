import type { CodexRpcClient } from "../../../../agents/codex/codex-rpc";
import type { AgentEvent } from "../../../../../shared/types";
import type { RuntimeApprovalRequester } from "../../../../approvals/runtime-approval-broker";

function isWorkflowMcpRequest(params: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(params).toLowerCase();
  return ["workflow_create", "workflow_validate", "workflow_context_append"].some((name) => serialized.includes(name));
}

export function respondToCodexRuntimeServerRequest(
  client: CodexRpcClient,
  id: number,
  method: string,
  params: Record<string, unknown>,
  approval?: {
    ownerId: string;
    emit: (event: AgentEvent) => void;
    request: RuntimeApprovalRequester;
  },
): void {
  if (method === "item/tool/requestUserInput") {
    client.respond(id, { answers: {} });
    return;
  }
  if (method === "mcpServer/elicitation/request") {
    client.respond(id, isWorkflowMcpRequest(params)
      ? { action: "accept", content: {}, _meta: null }
      : { action: "decline", content: null, _meta: null });
    return;
  }
  if (method === "item/tool/call" || method === "mcp/dynamicToolCall") {
    client.respond(id, {
      contentItems: [{ type: "inputText", text: "Multi Agent Chat does not handle Codex tool calls in the demo." }],
      success: false,
    });
    return;
  }

  const commandApproval = method === "item/commandExecution/requestApproval" || method === "execCommandApproval";
  const mcpApproval = method === "item/mcpToolCall/requestApproval"
    || method === "mcpServer/toolCall/requestApproval"
    || method === "mcp/tool/requestApproval";
  const permissionsApproval = method === "item/permissions/requestApproval";
  if (!commandApproval && !mcpApproval && !permissionsApproval) {
    client.respond(id, {});
    return;
  }
  if (mcpApproval && isWorkflowMcpRequest(params)) {
    client.respond(id, { decision: "accept" });
    return;
  }
  if (!approval) {
    client.respond(id, permissionsApproval ? { permissions: {}, scope: "turn" } : { decision: "decline" });
    return;
  }

  void approval.request({
    ownerId: approval.ownerId,
    provider: "codex",
    content: commandApproval
      ? "Codex requests permission to execute a command."
      : permissionsApproval
        ? "Codex requests additional permissions."
        : "Codex requests permission to call an MCP tool.",
    metadata: { method, nativeRequestId: id, request: params },
    emit: approval.emit,
  }).then((decision) => {
    if (permissionsApproval) {
      client.respond(id, decision === "approved"
        ? { permissions: params.permissions ?? {}, scope: "turn" }
        : { permissions: {}, scope: "turn" });
      return;
    }
    client.respond(id, { decision: decision === "approved" ? "accept" : "decline" });
  });
}
