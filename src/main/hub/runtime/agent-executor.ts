import type {
  AgentChannel,
  AgentEvent,
  AgentId,
  AgentRuntime,
  RuntimeRequest,
  WorkflowAgentResponse,
} from "../../../shared/types";
import { runtimeModelId } from "../../../shared/models";
import { codexEnvironmentForChannel } from "../../agents/codex/codex-env";
import { claudeCliModelForChannel } from "../../agents/claude/claude-env";
import { ClaudeAgentSdkAdapter, type ClaudeAgentSdkRunInput } from "../../agents/claude/claude-agent-sdk";
import { ClaudeAgentSdkInteractive } from "../../agents/claude/claude-agent-sdk-interactive";
import { ClaudeInteractiveSession } from "../../agents/claude/claude-interactive-session";
import { CodexInteractiveSession } from "../../agents/codex/codex-interactive-session";
import { CodexRpcClient } from "../../agents/codex/codex-rpc";
import { HermesRunner } from "../../agents/hermes/hermes-runner";
import { RuntimeRouter } from "../../agents/runtime/runtime-router";
import { claudeRuntimeStateCodec, codexRuntimeStateCodec, hermesRuntimeStateCodec } from "../../agents/runtime/runtime-state-codec";
import type {
  RuntimeChannelTestContext,
  RuntimeSessionCleanupContext,
  RuntimeWorkflowRequestContext,
} from "../../agents/runtime/runtime-driver";
import { RuntimeDriverRegistry } from "../../agents/runtime/runtime-driver";
import { codexAppServerConfigArgs } from "../../channels/model-config";
import { apiRequestBody, apiRequestUrl, extractApiContent, resolveApiModel } from "../api/agent-hub-api";
import {
  claudeSessionIdFromConversation,
  codexThreadIdFromConversation,
} from "./agent-executor-conversation";
import { createInteractiveRuntimeDriver, createOneShotRuntimeDriver } from "./agent-executor-driver-factories";
import { deleteClaudeSessionArtifacts, deleteCodexSessionArtifacts } from "./agent-executor-session-cleanup";
import {
  runClaudeWorkflow,
  runCodexWorkflow,
  runHermesChannelTest,
  runHermesWorkflow,
} from "./agent-executor-workflow";

export { RuntimeDriverRegistry } from "../../agents/runtime/runtime-driver";

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

interface RuntimeAgentExecutorFactoryOptions {
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

function modelFromRuntimeConfig(runtimeConfig: RuntimeRequest["runtimeConfig"]): string {
  return runtimeConfig.model;
}

export function createRuntimeDriverRegistry(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriverRegistry {
  const askWorkflowByRuntime = options.askWorkflowByRuntime ?? {};
  const testChannelByRuntime = options.testChannelByRuntime ?? {};
  const deleteSessionArtifactsByRuntime = options.deleteSessionArtifactsByRuntime ?? {};
  const claudeSdkAdapter = new ClaudeAgentSdkAdapter();
  const runClaudeOneShot = options.runClaudeOneShot ?? ((input: ClaudeAgentSdkRunInput) => claudeSdkAdapter.runOneShot(input));
  const codexDriver = createInteractiveRuntimeDriver({
    runtimeId: "codex",
    runtimeStateCodec: codexRuntimeStateCodec,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
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
            extraArgs: codexAppServerConfigArgs(channel, modelFromRuntimeConfig(context.runtimeConfig)),
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
    askWorkflow: askWorkflowByRuntime.codex ?? ((input) => runCodexWorkflow(input, options)),
    testChannel: testChannelByRuntime.codex,
    deleteSessionArtifacts:
      deleteSessionArtifactsByRuntime.codex ??
      ((input) => deleteCodexSessionArtifacts(options.executables.codex, input.runtimeConversation)),
  });
  const claudeDriver = createInteractiveRuntimeDriver({
    runtimeId: "claude",
    runtimeStateCodec: claudeRuntimeStateCodec,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
    createOneShotExecutor: (context) =>
      new ClaudeAgentExecutor(
        context,
        claudeSdkAdapter,
        claudeCliModelForChannel(options.channelById(context.channelId), modelFromRuntimeConfig(context.runtimeConfig)),
      ),
    createInteractiveSession: (context) =>
      new ClaudeInteractiveSession(
        context,
        {
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
          resolveModelId: (interactiveContext) =>
            claudeCliModelForChannel(
              options.channelById(interactiveContext.channelId),
              modelFromRuntimeConfig(interactiveContext.runtimeConfig),
            ) ?? modelFromRuntimeConfig(interactiveContext.runtimeConfig),
          sdkInteractive: new ClaudeAgentSdkInteractive(),
        },
      ),
    askWorkflow: askWorkflowByRuntime.claude ?? ((input) => runClaudeWorkflow(input, options, runClaudeOneShot)),
    testChannel: testChannelByRuntime.claude,
    deleteSessionArtifacts:
      deleteSessionArtifactsByRuntime.claude ??
      ((input) => deleteClaudeSessionArtifacts(input.workDir, input.runtimeConversation)),
  });
  const apiDriver = createOneShotRuntimeDriver({
    runtimeId: "api",
    createOneShotExecutor: (context) => new ApiAgentExecutor(context, options),
    askWorkflow: askWorkflowByRuntime.api,
    testChannel: testChannelByRuntime.api,
    deleteSessionArtifacts: deleteSessionArtifactsByRuntime.api,
  });
  const hermesDriver = createOneShotRuntimeDriver({
    runtimeId: "hermes",
    runtimeStateCodec: hermesRuntimeStateCodec,
    createOneShotExecutor: (context) => new HermesAgentExecutor(context, options),
    askWorkflow: (input) => runHermesWorkflow(input, options),
    testChannel: (input) => runHermesChannelTest(input, options),
    deleteSessionArtifacts: undefined,
  });
  return new RuntimeDriverRegistry([codexDriver, claudeDriver, apiDriver, hermesDriver]);
}

export class RuntimeAgentExecutorFactory implements AgentExecutorFactory {
  constructor(private readonly router: RuntimeRouter) {}

  create(context: AgentExecutionContext): AgentExecutor {
    return this.router.createOneShotExecutor(context);
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
    const model = runtimeModelId(modelFromRuntimeConfig(this.context.runtimeConfig));
    const channel = this.options.channelById(this.context.channelId);
    const threadIdFromConversation = codexThreadIdFromConversation(this.context.runtimeConversation);
    let client: CodexRpcClient;
    client = new CodexRpcClient({
      executable,
      cwd: this.context.workDir,
      extraArgs: codexAppServerConfigArgs(channel, modelFromRuntimeConfig(this.context.runtimeConfig)),
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
    const threadResult = threadIdFromConversation
      ? await client.request("thread/resume", {
          threadId: threadIdFromConversation,
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
    if (threadId) {
      this.context.emit({
        type: "runtime_conversation",
        runtimeConversation: codexRuntimeStateCodec.encodeConversation({
          native: { threadId },
        }),
      });
    }

    await client.request("turn/start", {
      threadId: threadId ?? threadIdFromConversation,
      input: [{ type: "text", text: this.context.prompt, text_elements: [] }],
    });
  }

  async stop(): Promise<void> {
    await this.client?.shutdown();
    this.client = undefined;
  }
}

class ClaudeAgentExecutor implements AgentExecutor {
  private abortController: AbortController | undefined;

  constructor(
    private readonly context: AgentExecutionContext,
    private readonly adapter: ClaudeAgentSdkAdapter,
    private readonly resolvedModelId: string | undefined,
  ) {}

  async start(): Promise<void> {
    const abortController = new AbortController();
    this.abortController = abortController;
    const resumeSessionId = claudeSessionIdFromConversation(this.context.runtimeConversation);

    try {
      await this.adapter.runOneShot({
        prompt: this.context.prompt,
        cwd: this.context.workDir,
        developerInstructions: this.context.developerInstructions,
        onEvent: this.context.emit,
        abortController,
        ...(this.resolvedModelId ? { modelId: this.resolvedModelId } : {}),
        ...(resumeSessionId ? { resumeSessionId } : {}),
      });
      this.context.onExit(0);
    } catch (error) {
      if (abortController.signal.aborted) {
        this.context.onExit(null);
        return;
      }
      this.context.emit({ type: "error", error: error instanceof Error ? error.message : String(error) });
      this.context.onExit(1);
    } finally {
      this.abortController = undefined;
    }
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    this.abortController = undefined;
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

    const model = resolveApiModel(channel, modelFromRuntimeConfig(this.context.runtimeConfig));
    if (!model) {
      this.context.emit({ type: "error", error: "API agent requires a model." });
      this.context.onExit(1);
      return;
    }

    const controller = new AbortController();
    this.controller = controller;

    try {
      const response = await fetch(apiRequestUrl(channel), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(channel.httpHeaders ?? {}),
        },
        body: JSON.stringify(
          apiRequestBody(channel, model, this.context.prompt, this.context.developerInstructions),
        ),
      });

      const text = await response.text();
      if (!response.ok) {
        this.context.emit({ type: "error", error: `API request failed (${response.status}): ${text.slice(0, 800)}` });
        this.context.onExit(1);
        return;
      }

      const content = extractApiContent(channel, text);
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
      modelId: modelFromRuntimeConfig(this.context.runtimeConfig),
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
