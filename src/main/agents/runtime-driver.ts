import type {
  AgentEvent,
  AgentId,
  AgentRuntime,
  AgentTestEvent,
  ChatRuntimeSessionState,
  RuntimeConversation,
  RuntimeRequest,
  WorkflowAgentEvent,
  WorkflowAgentResponse,
} from "../../shared/types";
import type { AgentExecutionContext, AgentExecutor } from "../agent-executor";
import type { RuntimeCapabilities } from "./runtime-capabilities";

export interface RuntimeSessionEvent {
  attachmentGeneration: number;
  turnId?: string;
  event: AgentEvent;
}

export interface InteractiveSessionSnapshot {
  runtimeState: ChatRuntimeSessionState;
  runtimeConversation?: RuntimeConversation;
}

export interface InteractiveSessionContext extends RuntimeRequest {
  chatId: string;
  configuredAgentId: string;
  runtime: AgentRuntime;
  channelId: string;
  workDir: string;
  developerInstructions: string;
  emit: (event: AgentEvent) => void;
  syncState?: (state: InteractiveSessionSnapshot) => void;
}

export interface RuntimeWorkflowRequestContext extends RuntimeRequest {
  requestId: string;
  prompt: string;
  runtime: AgentRuntime;
  channelId: string;
  workDir: string;
  onEvent?: ((event: WorkflowAgentEvent) => void) | undefined;
}

export interface RuntimeChannelTestContext {
  runtime: AgentRuntime;
  channelId: string;
  modelId: string;
  workDir: string;
  emit: (event: Omit<AgentTestEvent, "agentId" | "timestamp">) => void;
}

export interface RuntimeSessionCleanupContext {
  workDir: string;
  runtimeConversation?: RuntimeConversation;
}

export interface InteractiveSession {
  reconfigure(context: InteractiveSessionContext): void;
  ensureAttached(): Promise<void>;
  sendPrompt(prompt: string): Promise<void>;
  interrupt(): Promise<void>;
  detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void>;
  detachIfStillExpired(input: {
    expectedGeneration: number;
    expectedLastMeaningfulActivityAt: number;
    reason: "idle_timeout" | "app_shutdown" | "error";
  }): Promise<void>;
  snapshot(): InteractiveSessionSnapshot;
}

export interface RuntimeDriver {
  runtimeId: AgentId;
  getCapabilities(runtime: AgentRuntime): RuntimeCapabilities;
  createOneShotExecutor(context: AgentExecutionContext): AgentExecutor;
  createInteractiveSession?(context: InteractiveSessionContext): InteractiveSession;
  askWorkflow?: ((input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>) | undefined;
  testChannel?: ((input: RuntimeChannelTestContext) => Promise<string>) | undefined;
  deleteSessionArtifacts?: ((input: RuntimeSessionCleanupContext) => Promise<void>) | undefined;
}
