import type {
  AgentChannel,
  AgentId,
  AgentRuntime,
  RuntimeRequest,
  WorkflowAgentResponse,
} from "../../../shared/types";
import { runtimeModelId } from "../../../shared/models";
import { codexEnvironmentForChannel } from "../../agents/codex/codex-env";
import { claudeCliModelForChannel } from "../../agents/claude/claude-env";
import type { ClaudeAgentSdkRunInput } from "../../agents/claude/claude-agent-sdk";
import { CodexRpcClient } from "../../agents/codex/codex-rpc";
import { HermesRunner } from "../../agents/hermes/hermes-runner";
import { codexRuntimeStateCodec } from "../../agents/runtime/runtime-state-codec";
import type {
  RuntimeChannelTestContext,
  RuntimeWorkflowRequestContext,
} from "../../agents/runtime/runtime-driver";
import { codexAppServerConfigArgs } from "../../channels/model-config";
import {
  claudeSessionIdFromConversation,
  cloneClaudeRuntimeConversation,
  cloneCodexRuntimeConversation,
  codexThreadIdFromConversation,
} from "./agent-executor-conversation";

const HERMES_AGENT_TEST_PROMPT = "Reply with OK only.";
const WORKFLOW_AGENT_IDLE_TIMEOUT_MS = 10 * 60_000;
const WORKFLOW_DEVELOPER_INSTRUCTIONS =
  "You are the workflow builder and main review agent for a lightweight desktop UI. During workflow planning, interview the user one question at a time, include a recommended answer with every question, and produce only workflowGraph.upsert code when the workflow graph is ready. During completed workflow review, do not produce workflowGraph.upsert; write a Markdown Final User Report for the same user conversation and stay ready for follow-up questions.";

interface RuntimeWorkflowExecutionOptions {
  executables: Record<AgentId, string>;
  channelById: (channelId: string) => AgentChannel | undefined;
  respondToCodexServerRequest: (
    client: CodexRpcClient,
    id: number,
    method: string,
    params: Record<string, unknown>,
  ) => void;
}

function modelFromRuntimeConfig(runtimeConfig: RuntimeRequest["runtimeConfig"]): string {
  return runtimeConfig.model;
}

function createWorkflowAgentTimeout(input: { timeoutMs: number; onTimeout: () => void }): { refresh: () => void; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  };
  const refresh = (): void => {
    clear();
    timer = setTimeout(input.onTimeout, input.timeoutMs);
  };
  refresh();
  return { refresh, clear };
}

export async function runHermesWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeWorkflowExecutionOptions,
): Promise<WorkflowAgentResponse> {
  let content = "";
  let runtimeConversation = input.runtimeConversation;
  let exitCode: number | null = 0;
  let stderr = "";
  let runnerError: string | undefined;

  const runner = new HermesRunner({
    executable: input.runtime.command || options.executables.hermes,
    cwd: input.workDir,
    prompt: input.prompt,
    modelId: modelFromRuntimeConfig(input.runtimeConfig),
    onEvent: (event) => {
      if (event.type === "runtime_conversation") {
        runtimeConversation = event.runtimeConversation;
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
        input.onEvent?.({
          requestId: input.requestId,
          type: "completed",
          content: completedContent.trim(),
          ...(runtimeConversation ? { runtimeConversation } : {}),
        });
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
  return { content: output, ...(runtimeConversation ? { runtimeConversation } : {}) };
}

export async function runCodexWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeWorkflowExecutionOptions,
): Promise<WorkflowAgentResponse> {
  const executable = input.runtime.command || options.executables.codex;
  const channel = options.channelById(input.channelId);
  const model = runtimeModelId(modelFromRuntimeConfig(input.runtimeConfig));
  let settled = false;
  let content = "";
  let runtimeConversation = input.runtimeConversation ? cloneCodexRuntimeConversation(input.runtimeConversation) : undefined;
  let timeout: ReturnType<typeof createWorkflowAgentTimeout> | undefined;
  let client: CodexRpcClient | undefined;

  return new Promise<WorkflowAgentResponse>((resolve, reject) => {
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      timeout?.clear();
      void client?.shutdown();
      callback();
    };

    timeout = createWorkflowAgentTimeout({
      timeoutMs: WORKFLOW_AGENT_IDLE_TIMEOUT_MS,
      onTimeout: () => settle(() => reject(new Error("Workflow agent timed out after 10 minutes without activity"))),
    });

    client = new CodexRpcClient({
      executable,
      cwd: input.workDir,
      extraArgs: codexAppServerConfigArgs(channel, modelFromRuntimeConfig(input.runtimeConfig)),
      env: codexEnvironmentForChannel(channel),
      onEvent: (event) => {
        timeout?.refresh();
        if (event.type === "delta") {
          content += event.content;
          input.onEvent?.({ requestId: input.requestId, type: "delta", content: event.content });
          return;
        }
        if (event.type === "completed") {
          if (!content && event.content) content = event.content;
          input.onEvent?.({
            requestId: input.requestId,
            type: "completed",
            content: content.trim(),
            ...(runtimeConversation ? { runtimeConversation } : {}),
          });
          settle(() => resolve({ content: content.trim(), ...(runtimeConversation ? { runtimeConversation } : {}) }));
          return;
        }
        if (event.type === "error") {
          input.onEvent?.({ requestId: input.requestId, type: "error", error: event.error });
          settle(() => reject(new Error(event.error)));
        }
      },
      onRequest: (id, method, params) => {
        if (client) options.respondToCodexServerRequest(client, id, method, params);
      },
      onExit: (_code, _signal, stderr) => {
        if (settled) return;
        settle(() => reject(new Error(stderr.trim() || "Workflow Codex agent exited before completing")));
      },
    });

    void (async () => {
      try {
        await client.start();
        const existingThreadId = codexThreadIdFromConversation(runtimeConversation);
        const threadResult = existingThreadId
          ? await client.request("thread/resume", {
              threadId: existingThreadId,
              model,
              modelProvider: null,
              cwd: input.workDir,
              approvalPolicy: "never",
              config: null,
              baseInstructions: null,
              developerInstructions: WORKFLOW_DEVELOPER_INSTRUCTIONS,
            })
          : await client.request("thread/start", {
              model,
              modelProvider: null,
              profile: null,
              cwd: input.workDir,
              approvalPolicy: "never",
              config: null,
              baseInstructions: null,
              developerInstructions: WORKFLOW_DEVELOPER_INSTRUCTIONS,
              compactPrompt: null,
              includeApplyPatchTool: null,
              experimentalRawEvents: true,
              persistExtendedHistory: true,
            });

        const threadId = (threadResult as { thread?: { id?: string } }).thread?.id ?? existingThreadId;
        if (threadId) {
          runtimeConversation = codexRuntimeStateCodec.encodeConversation({
            native: { threadId },
          });
        }
        await client.request("turn/start", {
          threadId,
          input: [{ type: "text", text: input.prompt, text_elements: [] }],
        });
      } catch (error) {
        settle(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    })();
  });
}

export async function runClaudeWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeWorkflowExecutionOptions,
  runClaudeOneShot: (input: ClaudeAgentSdkRunInput) => Promise<void>,
): Promise<WorkflowAgentResponse> {
  const channel = options.channelById(input.channelId);
  const sdkModel =
    claudeCliModelForChannel(channel, modelFromRuntimeConfig(input.runtimeConfig)) ?? modelFromRuntimeConfig(input.runtimeConfig);
  const resumeSessionId = claudeSessionIdFromConversation(input.runtimeConversation);
  let content = "";
  let completedContent: string | undefined;
  let runtimeConversation = input.runtimeConversation ? cloneClaudeRuntimeConversation(input.runtimeConversation) : undefined;
  let errorMessage: string | undefined;

  try {
    await runClaudeOneShot({
      prompt: input.prompt,
      cwd: input.workDir,
      ...(sdkModel ? { modelId: sdkModel } : {}),
      developerInstructions: WORKFLOW_DEVELOPER_INSTRUCTIONS,
      ...(resumeSessionId ? { resumeSessionId } : {}),
      onEvent: (event) => {
        if (event.type === "delta") {
          content += event.content;
          input.onEvent?.({ requestId: input.requestId, type: "delta", content: event.content });
          return;
        }
        if (event.type === "completed" && event.content) {
          completedContent = event.content;
          if (!content) content = event.content;
          return;
        }
        if (event.type === "runtime_conversation") {
          runtimeConversation = cloneClaudeRuntimeConversation(event.runtimeConversation);
          return;
        }
        if (event.type === "error") {
          errorMessage = event.error;
          input.onEvent?.({ requestId: input.requestId, type: "error", error: event.error });
        }
      },
    });
  } catch (error) {
    throw errorMessage
      ? new Error(errorMessage)
      : error instanceof Error
        ? error
        : new Error(String(error));
  }

  const finalContent = completedContent?.trim() || content.trim();
  if (!finalContent) {
    throw new Error(errorMessage ?? "Claude workflow completed without assistant text.");
  }
  input.onEvent?.({
    requestId: input.requestId,
    type: "completed",
    content: finalContent,
    ...(runtimeConversation ? { runtimeConversation } : {}),
  });
  return { content: finalContent, ...(runtimeConversation ? { runtimeConversation } : {}) };
}

export async function runHermesChannelTest(
  input: RuntimeChannelTestContext,
  options: RuntimeWorkflowExecutionOptions,
): Promise<string> {
  input.emit({ type: "phase", content: `Launching Hermes with model ${runtimeModelId(input.modelId) ?? "default"}.` });
  input.emit({ type: "user", content: HERMES_AGENT_TEST_PROMPT });

  const response = await runHermesWorkflow(
    {
      requestId: "agent-test",
      prompt: HERMES_AGENT_TEST_PROMPT,
      runtimeId: input.runtime.id,
      executionMode: "oneshot",
      continuationPolicy: "fresh",
      runtimeConfig: { model: input.modelId },
      runtime: input.runtime as AgentRuntime,
      channelId: input.channelId,
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
