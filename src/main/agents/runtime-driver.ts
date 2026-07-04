import type { AgentEvent, AgentId, ChatRuntimeSessionState, PersistedResumeState } from "../../shared/types";
import type { RuntimeCapabilities } from "./runtime-capabilities";

export interface RuntimeDriverExecutionInput {
  runtimeId: AgentId;
  prompt: string;
  workDir: string;
  modelId?: string;
  resumeState?: PersistedResumeState;
  onEvent?: (event: AgentEvent) => void;
}

export interface RuntimeDriverExecutionResult {
  content?: string;
  resumeState?: PersistedResumeState;
}

export interface RuntimeSessionHandle {
  readonly runtimeId: AgentId;
  readonly session: ChatRuntimeSessionState;
  interrupt(): Promise<void>;
  continue(prompt?: string): Promise<RuntimeDriverExecutionResult>;
}

export interface RuntimeDriver {
  readonly runtimeId: AgentId;
  readonly capabilities: RuntimeCapabilities;
  start(input: RuntimeDriverExecutionInput): Promise<RuntimeDriverExecutionResult>;
  attach(session: ChatRuntimeSessionState): Promise<RuntimeSessionHandle | undefined>;
}
