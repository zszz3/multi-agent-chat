import type { CodexRpcClient } from "../../../../agents/codex/codex-rpc";
import {
  respondToCodexServerRequest,
} from "../../../codex/agent-hub-codex-app";

export function respondToCodexRuntimeServerRequest(
  client: CodexRpcClient,
  id: number,
  method: string,
  params: Record<string, unknown>,
): void {
  respondToCodexServerRequest(client, id, method, params);
}
