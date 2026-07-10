import type { AgentId } from "../../../shared/types";

export const APP_AGENT_IDS: AgentId[] = ["codex", "claude", "api", "hermes", "opencode"];
export const BALANCE_REFRESH_INTERVAL_MS = 5 * 60_000;
export const WORKFLOW_TASK_POLL_MS = 1000;
export const WORKFLOW_TASK_TIMEOUT_MS = 30 * 60 * 1000;
export const WORKFLOW_NODE_MAX_ATTEMPTS = 2;
export const WORKFLOW_FINAL_REVIEW_NODE_ID = "__final_review__";
