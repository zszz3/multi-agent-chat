import type { AgentEvent, AgentId, AgentRuntime, ChatRuntimeSessionState, PersistedResumeState } from "../../shared/types";
import type { AgentExecutionContext, AgentExecutor } from "../agent-executor";
import type { RuntimeCapabilities } from "./runtime-capabilities";

export interface RuntimeSessionEvent {
  attachmentGeneration: number;
  turnId?: string;
  event: AgentEvent;
}

export interface InteractiveSessionContext {
  chatId: string;
  configuredAgentId: string;
  runtimeId: AgentId;
  runtime: AgentRuntime;
  channelId: string;
  workDir: string;
  modelId: string;
  developerInstructions: string;
  resumeState?: PersistedResumeState;
  emit: (event: AgentEvent) => void;
  syncState?: (state: ChatRuntimeSessionState) => void;
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
  snapshot(): ChatRuntimeSessionState;
}

export interface RuntimeDriver {
  runtimeId: AgentId;
  getCapabilities(runtime: AgentRuntime): RuntimeCapabilities;
  createOneShotExecutor(context: AgentExecutionContext): AgentExecutor;
  createInteractiveSession?(context: InteractiveSessionContext): InteractiveSession;
}
