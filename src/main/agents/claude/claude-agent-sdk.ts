import { randomUUID } from "node:crypto";
import {
  query,
  type CanUseTool,
  type ElicitationRequest,
  type ElicitationResult,
  type Options,
  type Query,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent } from "../../../shared/types";
import { createClaudeStreamState, normalizeClaudeStreamEvent } from "./claude-stream";

export interface ClaudeAgentSdkRunInput {
  prompt: string;
  cwd: string;
  modelId?: string;
  developerInstructions?: string;
  resumeSessionId?: string;
  onEvent: (event: AgentEvent) => void;
  abortController?: AbortController;
}

export class ClaudeAgentSdkAdapter {
  constructor(
    private readonly options: {
      queryImpl?: typeof query;
    } = {},
  ) {}

  async runOneShot(input: ClaudeAgentSdkRunInput): Promise<void> {
    const queryImpl = this.options.queryImpl ?? query;
    const state = createClaudeStreamState();

    for await (const message of queryImpl({
      prompt: input.prompt,
      options: createClaudeSdkQueryOptions(input),
    })) {
      for (const event of normalizeClaudeStreamEvent(message, state)) {
        input.onEvent(event);
      }
    }
  }
}

export function createClaudeSdkQueryOptions(input: {
  cwd: string;
  modelId?: string;
  developerInstructions?: string;
  resumeSessionId?: string;
  onEvent: (event: AgentEvent) => void;
  abortController?: AbortController;
}): Options {
  const systemPrompt =
    input.developerInstructions?.trim()
      ? {
          type: "preset" as const,
          preset: "claude_code" as const,
          append: input.developerInstructions.trim(),
        }
      : {
          type: "preset" as const,
          preset: "claude_code" as const,
        };

  return {
    cwd: input.cwd,
    ...(input.modelId ? { model: input.modelId } : {}),
    ...(input.resumeSessionId ? { resume: input.resumeSessionId } : {}),
    systemPrompt,
    permissionMode: "default",
    canUseTool: createClaudeSdkPermissionHandler(input.onEvent),
    onElicitation: createClaudeSdkElicitationHandler(input.onEvent),
    ...(input.abortController ? { abortController: input.abortController } : {}),
  };
}

export function createClaudeSdkPermissionHandler(
  onEvent: (event: AgentEvent) => void,
): CanUseTool {
  return async (toolName, _input, options) => {
    const requestId = options.requestId || options.toolUseID || `permission:${randomUUID()}`;
    onEvent({
      type: "approval_request",
      requestId,
      content: options.title ?? `Claude wants to use ${toolName}.`,
      ...(toolName ? { metadata: { toolName } } : {}),
    });
    onEvent({
      type: "approval_response",
      requestId,
      decision: "approved",
      content: "Approved automatically by desktop host.",
    });
    return {
      behavior: "allow",
      toolUseID: options.toolUseID,
    };
  };
}

export function createClaudeSdkElicitationHandler(
  onEvent: (event: AgentEvent) => void,
): (request: ElicitationRequest) => Promise<ElicitationResult> {
  return async (request) => {
    const requestId = request.elicitationId ?? `elicitation:${randomUUID()}`;
    onEvent({
      type: "user_input_request",
      requestId,
      content: request.title ?? request.message,
    });
    onEvent({
      type: "user_input_response",
      requestId,
      content: "Declined automatically by desktop host.",
    });
    return { action: "decline" };
  };
}

export type { Query };
