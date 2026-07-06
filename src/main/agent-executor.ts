import type { AgentChannel, AgentEvent, AgentId, AgentRuntime, WorkflowAgentResponse } from "../shared/types";
import { DEFAULT_MODEL_ID, runtimeModelId } from "../shared/models";
import { codexEnvironmentForChannel } from "./agents/codex-env";
import { claudeCliModelForChannel, claudeEnvironmentForChannel } from "./agents/claude-env";
import { ClaudeInteractiveSession } from "./agents/claude-interactive-session";
import { selectClaudeInteractiveTransport } from "./agents/claude-transport-selection";
import { ClaudeRunner } from "./agents/claude-runner";
import { CodexInteractiveSession } from "./agents/codex-interactive-session";
import { CodexRpcClient } from "./agents/codex-rpc";
import { HermesRunner } from "./agents/hermes-runner";
import type {
  RuntimeChannelTestContext,
  RuntimeDriver,
  RuntimeSessionCleanupContext,
  RuntimeWorkflowRequestContext,
} from "./agents/runtime-driver";
import { codexAppServerConfigArgs } from "./model-config";

const HERMES_AGENT_TEST_PROMPT = "Reply with OK only.";

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
  askWorkflowByRuntime?: Partial<Record<AgentId, (input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>>>;
  testChannelByRuntime?: Partial<Record<AgentId, (input: RuntimeChannelTestContext) => Promise<string>>>;
  deleteSessionArtifactsByRuntime?: Partial<Record<AgentId, (input: RuntimeSessionCleanupContext) => Promise<void>>>;
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

async function runHermesWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeAgentExecutorFactoryOptions,
): Promise<WorkflowAgentResponse> {
  let content = "";
  let sessionId = input.sessionId;
  let exitCode: number | null = 0;
  let stderr = "";
  let runnerError: string | undefined;

  const runner = new HermesRunner({
    executable: input.runtime.command || options.executables.hermes,
    cwd: input.workDir,
    prompt: input.prompt,
    modelId: input.modelId,
    onEvent: (event) => {
      if (event.type === "session") {
        sessionId = event.sessionId;
        return;
      }
      if (event.type === "delta") {
        content += event.content;
        input.onEvent?.({ requestId: input.requestId, type: "delta", content: event.content });
        return;
      }
      if (event.type === "completed") {
        const completedContent = typeof event.content === "string" ? event.content : content;
        if (!content && typeof event.content === "string") content = event.content;
        input.onEvent?.({ requestId: input.requestId, type: "completed", content: completedContent.trim(), sessionId });
        return;
      }
      if (event.type === "error") {
        runnerError = event.error;
        input.onEvent?.({ requestId: input.requestId, type: "error", error: event.error });
      }
    },
    onStderr: (text) => {
      stderr += text;
    },
    onExit: (code) => {
      exitCode = code;
    },
  });

  await runner.start();

  const output = content.trim();
  if (runnerError) throw new Error(runnerError);
  if (exitCode !== 0) {
    throw new Error(`Hermes exited with ${exitCode ?? "unknown"}: ${(stderr.trim() || output || "no output").slice(0, 800)}`);
  }
  return { content: output, sessionId };
}

async function runHermesChannelTest(
  input: RuntimeChannelTestContext,
  options: RuntimeAgentExecutorFactoryOptions,
): Promise<string> {
  input.emit({ type: "phase", content: `Launching Hermes with model ${runtimeModelId(input.modelId) ?? "default"}.` });
  input.emit({ type: "user", content: HERMES_AGENT_TEST_PROMPT });

  const response = await runHermesWorkflow(
    {
      requestId: "agent-test",
      prompt: HERMES_AGENT_TEST_PROMPT,
      runtime: input.runtime,
      channelId: input.channelId,
      modelId: input.modelId,
      workDir: input.workDir,
      onEvent: (event) => {
        if (event.type === "delta") input.emit({ type: "assistant_delta", content: event.content });
        if (event.type === "error") input.emit({ type: "error", content: event.error });
      },
    },
    options,
  );

  if (!response.content.trim()) {
    throw new Error("Hermes completed without assistant text.");
  }
  input.emit({ type: "assistant", content: response.content });
  return response.content;
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
  const askWorkflowByRuntime = options.askWorkflowByRuntime ?? {};
  const testChannelByRuntime = options.testChannelByRuntime ?? {};
  const deleteSessionArtifactsByRuntime = options.deleteSessionArtifactsByRuntime ?? {};
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
    askWorkflow: askWorkflowByRuntime.codex,
    testChannel: testChannelByRuntime.codex,
    deleteSessionArtifacts: deleteSessionArtifactsByRuntime.codex,
  };
  const claudeSelection = (input: {
    runtime: AgentRuntime;
    channelId: string;
    modelId: string;
  }) => {
    const channel = options.channelById(input.channelId);
    return selectClaudeInteractiveTransport({
      executable: input.runtime.command || options.executables.claude,
      cliModelForTurn: (modelId) => claudeCliModelForChannel(channel, modelId ?? input.modelId),
      streamJsonModelForTurn: (modelId) => claudeCliModelForChannel(channel, modelId ?? input.modelId),
      envForTurn: (modelId) => claudeEnvironmentForChannel(channel, modelId ?? input.modelId, process.env),
    });
  };
  const claudeDriver: RuntimeDriver = {
    runtimeId: "claude",
    getCapabilities: (runtime) => ({
      ...defaultInteractiveCapabilities("claude"),
      resume: claudeSelection({ runtime, channelId: "claude-code", modelId: DEFAULT_MODEL_ID }).resume,
    }),
    createOneShotExecutor: (context) => new ClaudeAgentExecutor(context, options),
    createInteractiveSession: (context) => {
      const selection = claudeSelection(context);
      return new ClaudeInteractiveSession(context, {
        capabilities: {
          ...selection.resume,
          supportsInterrupt: true,
          supportsContinue: true,
          supportsApprovalRequests: true,
          supportsUserInputRequests: true,
        },
        createTransport: selection.createTransport,
      });
    },
    askWorkflow: askWorkflowByRuntime.claude,
    testChannel: testChannelByRuntime.claude,
    deleteSessionArtifacts: deleteSessionArtifactsByRuntime.claude,
  };
  const apiDriver: RuntimeDriver = {
    runtimeId: "api",
    getCapabilities: () => defaultOneShotCapabilities("api"),
    createOneShotExecutor: (context) => new ApiAgentExecutor(context, options),
    askWorkflow: askWorkflowByRuntime.api,
    testChannel: testChannelByRuntime.api,
    deleteSessionArtifacts: deleteSessionArtifactsByRuntime.api,
  };
  const hermesDriver: RuntimeDriver = {
    runtimeId: "hermes",
    getCapabilities: () => defaultOneShotCapabilities("hermes"),
    createOneShotExecutor: (context) => new HermesAgentExecutor(context, options),
    askWorkflow: (input) => runHermesWorkflow(input, options),
    testChannel: (input) => runHermesChannelTest(input, options),
    deleteSessionArtifacts: async () => undefined,
  };
  return new RuntimeDriverRegistry([codexDriver, claudeDriver, apiDriver, hermesDriver]);
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

class HermesAgentExecutor implements AgentExecutor {
  private runner: HermesRunner | undefined;

  constructor(
    private readonly context: AgentExecutionContext,
    private readonly options: RuntimeAgentExecutorFactoryOptions,
  ) {}

  async start(): Promise<void> {
    const runner = new HermesRunner({
      executable: this.context.runtime.command || this.options.executables.hermes,
      cwd: this.context.workDir,
      prompt: this.context.prompt,
      modelId: this.context.modelId,
      onEvent: this.context.emit,
      onExit: (code) => {
        this.context.onExit(code);
      },
    });
    this.runner = runner;
    await runner.start();
  }

  async stop(): Promise<void> {
    await this.runner?.stop();
    this.runner = undefined;
  }
}
