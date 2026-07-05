import type { AgentChannel, AgentEvent, AgentId, AgentRuntime } from "../shared/types";
import { DEFAULT_MODEL_ID, runtimeModelId } from "../shared/models";
import { codexEnvironmentForChannel } from "./agents/codex-env";
import { claudeCliModelForChannel, claudeEnvironmentForChannel } from "./agents/claude-env";
import { ClaudeInteractiveSession } from "./agents/claude-interactive-session";
import { ClaudeRunner } from "./agents/claude-runner";
import { CodexInteractiveSession } from "./agents/codex-interactive-session";
import { CodexRpcClient } from "./agents/codex-rpc";
import type { RuntimeDriver } from "./agents/runtime-driver";
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

function defaultResumeCapabilities() {
  return {
    supportsInProcessConversationResume: true,
    supportsResumeAfterDetach: false,
    supportsResumeAfterAppRestart: false,
    supportsTurnResume: false,
  };
}

function defaultInteractiveCapabilities(runtimeId: AgentId) {
  return {
    runtimeId,
    chatStyle: "interactive" as const,
    taskStyle: "oneshot" as const,
    workflowStyle: "oneshot" as const,
    testStyle: "oneshot" as const,
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: runtimeId !== "api",
    supportsUserInputRequests: runtimeId !== "api",
    resume: defaultResumeCapabilities(),
  };
}

function defaultOneShotCapabilities(runtimeId: AgentId) {
  return {
    runtimeId,
    chatStyle: "oneshot" as const,
    taskStyle: "oneshot" as const,
    workflowStyle: "oneshot" as const,
    testStyle: "oneshot" as const,
    supportsInterrupt: false,
    supportsContinue: false,
    supportsApprovalRequests: false,
    supportsUserInputRequests: false,
    resume: {
      supportsInProcessConversationResume: false,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    },
  };
}

export class RuntimeDriverRegistry {
  constructor(private readonly drivers: RuntimeDriver[]) {}

  driverFor(agentId: AgentId): RuntimeDriver {
    const driver = this.drivers.find((item) => item.runtimeId === agentId);
    if (!driver) throw new Error(`No runtime driver registered for ${agentId}`);
    return driver;
  }
}

export function createRuntimeDriverRegistry(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriverRegistry {
  const codexDriver: RuntimeDriver = {
    runtimeId: "codex",
    getCapabilities: () => ({
      ...defaultInteractiveCapabilities("codex"),
      resume: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: true,
        supportsResumeAfterAppRestart: true,
        supportsTurnResume: false,
      },
    }),
    createOneShotExecutor: (context) => new CodexAgentExecutor(context, options),
    createInteractiveSession: (context) =>
      new CodexInteractiveSession(context, {
        capabilities: {
          supportsInProcessConversationResume: true,
          supportsResumeAfterDetach: true,
          supportsResumeAfterAppRestart: true,
          supportsTurnResume: false,
          supportsInterrupt: true,
          supportsContinue: true,
          supportsApprovalRequests: true,
          supportsUserInputRequests: true,
        },
        createCodexClient: ({ onEvent, onExit }) => {
          const channel = options.channelById(context.channelId);
          let client: CodexRpcClient;
          client = new CodexRpcClient({
            executable: context.runtime.command || options.executables.codex,
            ...(context.runtime.fixedArgs ? { fixedArgs: context.runtime.fixedArgs } : {}),
            cwd: context.workDir,
            extraArgs: codexAppServerConfigArgs(channel, context.modelId),
            env: codexEnvironmentForChannel(channel),
            onEvent,
            onRequest: (id, method, params) => {
              options.respondToCodexServerRequest(client, id, method, params);
            },
            onExit,
          });
          return client;
        },
      }),
  };
  const claudeDriver: RuntimeDriver = {
    runtimeId: "claude",
    getCapabilities: () => ({
      ...defaultInteractiveCapabilities("claude"),
      resume: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: false,
        supportsResumeAfterAppRestart: false,
        supportsTurnResume: false,
      },
    }),
    createOneShotExecutor: (context) => new ClaudeAgentExecutor(context, options),
    createInteractiveSession: (context) =>
      new ClaudeInteractiveSession(context, {
        capabilities: {
          supportsInProcessConversationResume: true,
          supportsResumeAfterDetach: false,
          supportsResumeAfterAppRestart: false,
          supportsTurnResume: false,
          supportsInterrupt: true,
          supportsContinue: true,
          supportsApprovalRequests: true,
          supportsUserInputRequests: true,
        },
        createTransport: () => {
          const channel = options.channelById(context.channelId);
          let runner: ClaudeRunner | undefined;
          return {
            startTurn: async ({ prompt, sessionId, modelId, cwd, onEvent }) => {
              const activeRunner = new ClaudeRunner({
                executable: context.runtime.command || options.executables.claude,
                ...(context.runtime.fixedArgs ? { fixedArgs: context.runtime.fixedArgs } : {}),
                cwd,
                env: claudeEnvironmentForChannel(channel, modelId ?? context.modelId, process.env),
                prompt,
                modelId: claudeCliModelForChannel(channel, modelId ?? context.modelId),
                sessionId,
                onEvent,
                onExit: () => {
                  if (runner === activeRunner) runner = undefined;
                },
              });
              runner = activeRunner;
              await activeRunner.start();
              return {
                stop: async () => {
                  if (runner === activeRunner) runner = undefined;
                  await activeRunner.stop();
                },
              };
            },
            interrupt: async () => {
              await runner?.interrupt();
            },
            detach: async () => {
              const activeRunner = runner;
              runner = undefined;
              await activeRunner?.stop();
            },
          };
        },
      }),
  };
  const apiDriver: RuntimeDriver = {
    runtimeId: "api",
    getCapabilities: () => defaultOneShotCapabilities("api"),
    createOneShotExecutor: (context) => new ApiAgentExecutor(context, options),
  };
  return new RuntimeDriverRegistry([codexDriver, claudeDriver, apiDriver]);
}

export class RuntimeAgentExecutorFactory implements AgentExecutorFactory {
  constructor(private readonly registry: RuntimeDriverRegistry) {}

  create(context: AgentExecutionContext): AgentExecutor {
    return this.registry.driverFor(context.agentId).createOneShotExecutor(context);
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
      ...(this.context.runtime.fixedArgs ? { fixedArgs: this.context.runtime.fixedArgs } : {}),
      cwd: this.context.workDir,
      extraArgs: codexAppServerConfigArgs(channel, this.context.modelId),
      env: codexEnvironmentForChannel(channel),
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
    const channel = this.options.channelById(this.context.channelId);
    this.runner = new ClaudeRunner({
      executable: this.context.runtime.command || this.options.executables.claude,
      ...(this.context.runtime.fixedArgs ? { fixedArgs: this.context.runtime.fixedArgs } : {}),
      cwd: this.context.workDir,
      env: claudeEnvironmentForChannel(channel, this.context.modelId, process.env),
      prompt: this.context.prompt,
      modelId: claudeCliModelForChannel(channel, this.context.modelId),
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

class ApiAgentExecutor implements AgentExecutor {
  private controller: AbortController | undefined;

  constructor(
    private readonly context: AgentExecutionContext,
    private readonly options: RuntimeAgentExecutorFactoryOptions,
  ) {}

  async start(): Promise<void> {
    const channel = this.options.channelById(this.context.channelId);
    if (!channel?.baseUrl) {
      this.context.emit({ type: "error", error: "API agent requires a provider base URL." });
      this.context.onExit(1);
      return;
    }

    const model = this.resolveModel(channel);
    if (!model) {
      this.context.emit({ type: "error", error: "API agent requires a model." });
      this.context.onExit(1);
      return;
    }

    const controller = new AbortController();
    this.controller = controller;
    this.context.emit({ type: "session", sessionId: this.context.sessionId ?? this.context.runId });

    try {
      const response = await fetch(this.requestUrl(channel), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(channel.httpHeaders ?? {}),
        },
        body: JSON.stringify(this.requestBody(channel, model)),
      });

      const text = await response.text();
      if (!response.ok) {
        this.context.emit({ type: "error", error: `API request failed (${response.status}): ${text.slice(0, 800)}` });
        this.context.onExit(1);
        return;
      }

      const content = this.extractContent(channel, text);
      this.context.emit({ type: "delta", content });
      this.context.emit({ type: "completed", content });
      this.context.onExit(0);
    } catch (error) {
      if (controller.signal.aborted) {
        this.context.onExit(null);
        return;
      }
      this.context.emit({ type: "error", error: error instanceof Error ? error.message : String(error) });
      this.context.onExit(1);
    }
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    this.controller = undefined;
  }

  private resolveModel(channel: AgentChannel): string | undefined {
    const model = runtimeModelId(this.context.modelId);
    if (model) return model;
    return channel.models.find((item) => item.id !== DEFAULT_MODEL_ID)?.id;
  }

  private requestUrl(channel: AgentChannel): string {
    if (channel.modelProvider === "anthropic-api") {
      const normalized = channel.baseUrl?.replace(/\/+$/, "") ?? "";
      if (normalized.endsWith("/messages")) return normalized;
      return `${normalized}/messages`;
    }
    return this.chatCompletionsUrl(channel.baseUrl ?? "");
  }

  private requestBody(channel: AgentChannel, model: string): Record<string, unknown> {
    if (channel.modelProvider === "anthropic-api") {
      return {
        model,
        max_tokens: 4096,
        system: this.context.developerInstructions || undefined,
        messages: [{ role: "user", content: this.context.prompt }],
      };
    }
    return {
      model,
      messages: [
        ...(this.context.developerInstructions
          ? [{ role: "system", content: this.context.developerInstructions }]
          : []),
        { role: "user", content: this.context.prompt },
      ],
      stream: false,
    };
  }

  private chatCompletionsUrl(baseUrl: string): string {
    const normalized = baseUrl.replace(/\/+$/, "");
    if (normalized.endsWith("/chat/completions")) return normalized;
    return `${normalized}/chat/completions`;
  }

  private extractContent(channel: AgentChannel, text: string): string {
    if (channel.modelProvider === "anthropic-api") {
      const parsed = JSON.parse(text) as { content?: Array<{ type?: string; text?: unknown }> };
      const content = parsed.content
        ?.map((item) => (typeof item.text === "string" ? item.text : ""))
        .filter(Boolean)
        .join("");
      if (content) return content;
      return JSON.stringify(parsed, null, 2);
    }
    const parsed = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
      output_text?: unknown;
    };
    const first = parsed.choices?.[0];
    const content = first?.message?.content ?? first?.text ?? parsed.output_text;
    if (typeof content === "string") return content;
    return JSON.stringify(parsed, null, 2);
  }
}
