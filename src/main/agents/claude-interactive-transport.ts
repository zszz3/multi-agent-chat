import type { PersistedResumeState } from "../../shared/types";
import type { AgentEvent } from "../../shared/types";

export type ClaudeResumeState = Extract<PersistedResumeState, { runtimeId: "claude" }>;

export interface ClaudeInteractiveTransportHandle {
  stop(): Promise<void>;
}

export interface ClaudeInteractiveTurnInput {
  prompt: string;
  modelId: string | undefined;
  cwd: string;
  resumeState?: ClaudeResumeState;
  onEvent: (event: AgentEvent) => void;
}

export interface ClaudeInteractiveTransport {
  readonly kind: "sdk" | "cli";
  startTurn(input: ClaudeInteractiveTurnInput): Promise<ClaudeInteractiveTransportHandle>;
  interrupt(): Promise<void>;
  detach(): Promise<void>;
}
