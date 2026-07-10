import type {
  AgentChannel,
  AgentId,
  WorkflowAgentResponse,
} from "../../../../shared/types";
import { codexEnvironmentForChannel } from "../../../agents/codex/codex-env";
import { claudeCliModelForChannel } from "../../../agents/claude/claude-env";
import { ClaudeAgentSdkAdapter, type ClaudeAgentSdkRunInput } from "../../../agents/claude/claude-agent-sdk";
import { ClaudeAgentSdkInteractive } from "../../../agents/claude/claude-agent-sdk-interactive";
import { ClaudeInteractiveSession } from "../../../agents/claude/claude-interactive-session";
import { CodexInteractiveSession } from "../../../agents/codex/codex-interactive-session";
import { CodexRpcClient } from "../../../agents/codex/codex-rpc";
import { RuntimeRouter } from "../../../agents/runtime/runtime-router";
import { claudeRuntimeStateCodec, codexRuntimeStateCodec, hermesRuntimeStateCodec } from "../../../agents/runtime/runtime-state-codec";
import type {
  RuntimeChannelTestContext,
  RuntimeSessionCleanupContext,
  RuntimeWorkflowRequestContext,
} from "../../../agents/runtime/runtime-driver";
import { RuntimeDriverRegistry } from "../../../agents/runtime/runtime-driver";
import { codexAppServerConfigArgs } from "../../../channels/model-config";
import { createInteractiveRuntimeDriver, createOneShotRuntimeDriver } from "./agent-executor-driver-factories";
import { deleteClaudeSessionArtifacts, deleteCodexSessionArtifacts } from "./agent-executor-session-cleanup";
import { ApiAgentExecutor } from "./agent-executor-api";
import { ClaudeAgentExecutor } from "./agent-executor-claude";
import { CodexAgentExecutor } from "./agent-executor-codex";
import { HermesAgentExecutor } from "./agent-executor-hermes";
import type {
  AgentExecutionContext,
  AgentExecutor,
  AgentExecutorFactory,
  RuntimeAgentExecutorFactoryOptions,
} from "./agent-executor-types";
import {
  modelFromRuntimeConfig,
  reasoningEffortFromRuntimeConfig,
} from "./agent-executor-types";
import {
  runClaudeWorkflow,
  runCodexWorkflow,
  runHermesChannelTest,
  runHermesWorkflow,
} from "./workflow/agent-executor-workflow";

export { RuntimeDriverRegistry } from "../../../agents/runtime/runtime-driver";
export type {
  AgentExecutionContext,
  AgentExecutor,
  AgentExecutorFactory,
  RuntimeAgentExecutorFactoryOptions,
} from "./agent-executor-types";
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
            extraArgs: codexAppServerConfigArgs(
              channel,
              modelFromRuntimeConfig(context.runtimeConfig),
              reasoningEffortFromRuntimeConfig(context.runtimeConfig),
            ),
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
