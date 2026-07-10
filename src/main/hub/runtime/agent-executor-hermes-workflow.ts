import type {
  AgentRuntime,
  WorkflowAgentResponse,
} from "../../../shared/types";
import { runtimeModelId } from "../../../shared/models";
import { HermesRunner } from "../../agents/hermes/hermes-runner";
import type {
  RuntimeChannelTestContext,
  RuntimeWorkflowRequestContext,
} from "../../agents/runtime/runtime-driver";
import {
  modelFromRuntimeConfig,
  type RuntimeWorkflowExecutionOptions,
} from "./agent-executor-workflow-shared";

const HERMES_AGENT_TEST_PROMPT = "Reply with OK only.";

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
