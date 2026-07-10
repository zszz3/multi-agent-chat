import { ClaudeAgentSdkAdapter, type ClaudeAgentSdkRunInput } from "../../../../agents/claude/claude-agent-sdk";
import { ClaudeAgentSdkInteractive } from "../../../../agents/claude/claude-agent-sdk-interactive";
import { ClaudeInteractiveSession } from "../../../../agents/claude/claude-interactive-session";
import { claudeCliModelForChannel } from "../../../../agents/claude/claude-env";
import type { RuntimeDriver } from "../../../../agents/runtime/runtime-driver";
import { claudeRuntimeStateCodec } from "../../../../agents/runtime/runtime-state-codec";
import { createInteractiveRuntimeDriver } from "../agent-executor-driver-factories";
import { ClaudeAgentExecutor } from "../agent-executor-claude";
import { modelFromRuntimeConfig, type RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { deleteClaudeSessionArtifacts } from "./claude-cleanup";
import { runClaudeWorkflow } from "./claude-workflow";

export function createClaudeDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  const askWorkflowByRuntime = options.askWorkflowByRuntime ?? {};
  const testChannelByRuntime = options.testChannelByRuntime ?? {};
  const deleteSessionArtifactsByRuntime = options.deleteSessionArtifactsByRuntime ?? {};
  const claudeSdkAdapter = new ClaudeAgentSdkAdapter();
  const runClaudeOneShot =
    options.runClaudeOneShot ?? ((input: ClaudeAgentSdkRunInput) => claudeSdkAdapter.runOneShot(input));

  return createInteractiveRuntimeDriver({
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
      ((input) => deleteClaudeSessionArtifacts(input)),
  });
}
