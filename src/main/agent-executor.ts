import type { AgentChannel, AgentEvent, AgentId, AgentRuntime } from "../shared/types";
import { runtimeModelId } from "../shared/models";
import { ClaudeRunner } from "./agents/claude-runner";
import { CodexRpcClient } from "./agents/codex-rpc";
import { codexAppServerConfigArgs } from "./model-config";

export interface AgentExecutionContext {
  runId: string;
  runKind: "chat" | "task";
  agentId: AgentId;
  runtime: AgentRuntime;
  channelId: string;
  modelId: string;
  prompt: string;
  sessionId: string | undefined;
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

interface RuntimeAgentExecutorFactoryOptions {
  executables: Record<AgentId, string>;
  channelById: (channelId: string) => AgentChannel | undefined;
  respondToCodexServerRequest: (
    client: CodexRpcClient,
    id: number,
    method: string,
    params: Record<string, unknown>,
  ) => void;
}

export class RuntimeAgentExecutorFactory implements AgentExecutorFactory {
  constructor(private readonly options: RuntimeAgentExecutorFactoryOptions) {}

  create(context: AgentExecutionContext): AgentExecutor {
    if (context.agentId === "codex") {
      return new CodexAgentExecutor(context, this.options);
    }
    return new ClaudeAgentExecutor(context, this.options);
  }
}

class CodexAgentExecutor implements AgentExecutor {
  private client: CodexRpcClient | undefined;

  constructor(
    private readonly context: AgentExecutionContext,
    private readonly options: RuntimeAgentExecutorFactoryOptions,
  ) {}

  async start(): Promise<void> {
    const executable = this.context.runtime.command || this.options.executables.codex;
    const model = runtimeModelId(this.context.modelId);
    const channel = this.options.channelById(this.context.channelId);
    let client: CodexRpcClient;
    client = new CodexRpcClient({
      executable,
      cwd: this.context.workDir,
      extraArgs: codexAppServerConfigArgs(channel, this.context.modelId),
      env: process.env as Record<string, string>,
      onEvent: this.context.emit,
      onRequest: (id, method, params) => {
        this.options.respondToCodexServerRequest(client, id, method, params);
      },
      onExit: (code) => {
        this.context.onExit(code);
      },
    });
    this.client = client;

    await client.start();
    const threadResult = this.context.sessionId
      ? await client.request("thread/resume", {
          threadId: this.context.sessionId,
          model,
          modelProvider: null,
          cwd: this.context.workDir,
          approvalPolicy: "never",
          config: null,
          baseInstructions: null,
          developerInstructions: this.context.developerInstructions,
        })
      : await client.request("thread/start", {
          model,
          modelProvider: null,
          profile: null,
          cwd: this.context.workDir,
          approvalPolicy: "never",
          config: null,
          baseInstructions: null,
          developerInstructions: this.context.developerInstructions,
          compactPrompt: null,
          includeApplyPatchTool: null,
          experimentalRawEvents: true,
          persistExtendedHistory: true,
        });

    const threadId = (threadResult as { thread?: { id?: string } }).thread?.id;
    if (threadId) this.context.emit({ type: "session", sessionId: threadId });

    await client.request("turn/start", {
      threadId: threadId ?? this.context.sessionId,
      input: [{ type: "text", text: this.context.prompt, text_elements: [] }],
    });
  }

  async stop(): Promise<void> {
    await this.client?.shutdown();
    this.client = undefined;
  }
}

class ClaudeAgentExecutor implements AgentExecutor {
  private runner: ClaudeRunner | undefined;

  constructor(
    private readonly context: AgentExecutionContext,
    private readonly options: RuntimeAgentExecutorFactoryOptions,
  ) {}

  async start(): Promise<void> {
    this.runner = new ClaudeRunner({
      executable: this.context.runtime.command || this.options.executables.claude,
      cwd: this.context.workDir,
      env: process.env as Record<string, string>,
      prompt: this.context.prompt,
      modelId: runtimeModelId(this.context.modelId) ?? undefined,
      sessionId: this.context.sessionId,
      onEvent: this.context.emit,
      onExit: (code) => {
        this.context.onExit(code);
      },
    });
    await this.runner.start();
  }

  async stop(): Promise<void> {
    await this.runner?.stop();
    this.runner = undefined;
  }
}
