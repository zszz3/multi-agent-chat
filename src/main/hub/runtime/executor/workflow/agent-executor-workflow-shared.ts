import type { AgentChannel, AgentId, RuntimeRequest } from "../../../../../shared/types";
import type { CodexRpcClient } from "../../../../agents/codex/codex-rpc";
import type { ClaudeAgentSdkRunInput } from "../../../../agents/claude/claude-agent-sdk";
import type { CodexServerRequestOptions } from "../../../codex/agent-hub-codex-app";

export const WORKFLOW_AGENT_IDLE_TIMEOUT_MS = 10 * 60_000;
export const WORKFLOW_DEVELOPER_INSTRUCTIONS =
  "You are the workflow builder and main review agent for a lightweight desktop UI. During workflow planning, interview the user one question at a time, include a recommended answer with every question, and produce only workflowGraph.upsert code when the workflow graph is ready. During completed workflow review, do not produce workflowGraph.upsert; write a Markdown Final User Report for the same user conversation and stay ready for follow-up questions.";

export interface RuntimeWorkflowExecutionOptions {
  executables: Record<AgentId, string>;
  channelById: (channelId: string) => AgentChannel | undefined;
  respondToCodexServerRequest: (
    client: CodexRpcClient,
    id: number,
    method: string,
    params: Record<string, unknown>,
    options?: CodexServerRequestOptions,
  ) => void;
  codexWorkflowExtraArgs?: () => string[];
  claudeWorkflowMcpServers?: () => ClaudeAgentSdkRunInput["mcpServers"] | undefined;
}

export function modelFromRuntimeConfig(runtimeConfig: RuntimeRequest["runtimeConfig"]): string {
  return runtimeConfig.model;
}

export function createWorkflowAgentTimeout(input: { timeoutMs: number; onTimeout: () => void }): { refresh: () => void; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  };
  const refresh = (): void => {
    clear();
    timer = setTimeout(input.onTimeout, input.timeoutMs);
  };
  refresh();
  return { refresh, clear };
}
