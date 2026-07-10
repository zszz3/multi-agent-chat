import type {
  AgentChannel,
  AgentEvent,
  AgentId,
  AgentRuntime,
  RuntimeRequest,
  WorkflowAgentResponse,
} from "../../../../shared/types";
import type { ClaudeAgentSdkRunInput } from "../../../agents/claude/claude-agent-sdk";
import type { CodexRpcClient } from "../../../agents/codex/codex-rpc";
import type {
  RuntimeChannelTestContext,
  RuntimeSessionCleanupContext,
  RuntimeWorkflowRequestContext,
} from "../../../agents/runtime/runtime-driver";

export interface AgentExecutionContext extends RuntimeRequest {
  runId: string;
  runKind: "chat" | "task";
  runtime: AgentRuntime;
  channelId: string;
  prompt: string;
  workDir: string;
  developerInstructions: string;
  emit: (event: AgentEvent) => void;
  onExit: (code?: number | null) => void;
}

export interface AgentExecutor {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface AgentExecutorFactory {
  create(context: AgentExecutionContext): AgentExecutor;
}

export interface RuntimeAgentExecutorFactoryOptions {
  executables: Record<AgentId, string>;
  channelById: (channelId: string) => AgentChannel | undefined;
  respondToCodexServerRequest: (
    client: CodexRpcClient,
    id: number,
    method: string,
    params: Record<string, unknown>,
  ) => void;
  runClaudeOneShot?: (input: ClaudeAgentSdkRunInput) => Promise<void>;
  askWorkflowByRuntime?: Partial<Record<AgentId, (input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>>>;
  testChannelByRuntime?: Partial<Record<AgentId, (input: RuntimeChannelTestContext) => Promise<string>>>;
  deleteSessionArtifactsByRuntime?: Partial<Record<AgentId, (input: RuntimeSessionCleanupContext) => Promise<void>>>;
}

export function modelFromRuntimeConfig(runtimeConfig: RuntimeRequest["runtimeConfig"]): string {
  return runtimeConfig.model;
}
