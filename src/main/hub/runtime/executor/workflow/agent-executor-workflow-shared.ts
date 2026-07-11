import type { AgentChannel, AgentId, RuntimeRequest } from "../../../../../shared/types";
import type { RuntimeWorkflowHost } from "../agent-executor-types";

export const WORKFLOW_AGENT_IDLE_TIMEOUT_MS = 10 * 60_000;
export const WORKFLOW_DEVELOPER_INSTRUCTIONS =
  "You are the workflow builder and main review agent for a lightweight desktop UI. During workflow planning, interview the user one question at a time, include a recommended answer with every question, and produce only workflowGraph.upsert code when the workflow graph is ready. Classify every executable LLM node before creating the graph: use one-shot only when all required inputs are already available and the node is expected to complete without requesting any user input; use interactive whenever the node may need user clarification, supplemental information, iterative choices, or confirmation during execution. Do not plan a user-input-dependent node as one-shot merely because the expected question seems simple. During completed workflow review, do not produce workflowGraph.upsert; write a Markdown Final User Report for the same user conversation and stay ready for follow-up questions.";

export interface RuntimeWorkflowExecutionOptions {
  executables: Record<AgentId, string>;
  channelById: (channelId: string) => AgentChannel | undefined;
  workflowHost?: RuntimeWorkflowHost;
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
