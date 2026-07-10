import { codexEnvironmentForChannel } from "../../../../agents/codex/codex-env";
import { CodexInteractiveSession } from "../../../../agents/codex/codex-interactive-session";
import { CodexRpcClient } from "../../../../agents/codex/codex-rpc";
import type { RuntimeDriver } from "../../../../agents/runtime/runtime-driver";
import { codexRuntimeStateCodec } from "../../../../agents/runtime/runtime-state-codec";
import { codexAppServerConfigArgs } from "../../../../channels/model-config";
import { createInteractiveRuntimeDriver } from "../agent-executor-driver-factories";
import { CodexAgentExecutor } from "../agent-executor-codex";
import { modelFromRuntimeConfig, type RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { deleteCodexSessionArtifacts } from "./codex-cleanup";
import { runCodexWorkflow } from "./codex-workflow";

export function createCodexDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  const askWorkflowByRuntime = options.askWorkflowByRuntime ?? {};
  const testChannelByRuntime = options.testChannelByRuntime ?? {};
  const deleteSessionArtifactsByRuntime = options.deleteSessionArtifactsByRuntime ?? {};

  return createInteractiveRuntimeDriver({
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
      ((input) => deleteCodexSessionArtifacts(options.executables.codex, input)),
  });
}
