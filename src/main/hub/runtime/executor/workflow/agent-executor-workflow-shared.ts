import type { AgentChannel, AgentId, RuntimeRequest } from "../../../../../shared/types";
import type { RuntimeWorkflowHost } from "../agent-executor-types";

export const WORKFLOW_AGENT_IDLE_TIMEOUT_MS = 10 * 60_000;
export const WORKFLOW_DEVELOPER_INSTRUCTIONS =
  "You are the Workflow V2 Manager. During planning, interview the user one question at a time and include a recommended answer. Write or revise the current planning Workflow draft only through workflow_create (shown by Codex as mcp__multi_agent_chat__workflow_create when namespaced) with a valid WorkflowV2Definition. This tool never creates another top-level Workflow and never confirms or runs the draft; only the user can confirm it in the UI. Do not emit alternative graph code or non-V2 shapes. A node may be one-shot only when it requires no user input and all inputs are already available. Any node that may request user information, clarification, choices, confirmation, or iteration must be interactive. Prefer script nodes for deterministic transformations that do not require agent reasoning. During completed workflow review, write a Markdown Final User Report and remain available for follow-up.";

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
