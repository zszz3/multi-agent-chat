import type { AgentChannel, AgentTestEvent } from "../../../shared/types";
import { runtimeModelId } from "../../../shared/models";
import { claudeCliModelForChannel } from "../../agents/claude/claude-env";
import type { ClaudeAgentSdkAdapter } from "../../agents/claude/claude-agent-sdk";
import { codexEnvironmentForChannel } from "../../agents/codex/codex-env";
import { codexAppServerConfigArgs, codexHome } from "../../channels/model-config";
import {
  deleteCodexTestSessions,
  extractCodexSessionId,
  handleCodexTestLine,
  runStreamingCommand,
} from "./agent-hub-cli";

type AgentTestEmit = (event: Omit<AgentTestEvent, "agentId" | "timestamp">) => void;

export async function testCodexAgent(input: {
  executable: string;
  channel: AgentChannel;
  modelId: string;
  workDir: string;
  emit: AgentTestEmit;
  testPrompt: string;
  timeoutMs: number;
}): Promise<string> {
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    ...codexAppServerConfigArgs(input.channel, input.modelId),
    input.testPrompt,
  ];
  input.emit({
    type: "phase",
    content: `Launching codex exec --ephemeral with model ${runtimeModelId(input.modelId) ?? "default"}.`,
  });
  let output = "";
  const sessionIds = new Set<string>();
  const result = await runStreamingCommand({
    executable: input.executable,
    args,
    cwd: input.workDir,
    env: codexEnvironmentForChannel(input.channel),
    timeoutMs: input.timeoutMs,
    onStdoutLine: (line) => {
      const sessionId = extractCodexSessionId(line);
      if (sessionId) sessionIds.add(sessionId);
      const eventOutput = handleCodexTestLine(line, input.emit);
      if (eventOutput) output += eventOutput;
    },
    onStderr: (text) => input.emit({ type: "stderr", content: text }),
  });
  const deletedSessions = await deleteCodexTestSessions(input.executable, codexHome(), sessionIds);
  if (deletedSessions > 0) {
    input.emit({
      type: "phase",
      content: `Deleted ${deletedSessions} Codex test session${deletedSessions === 1 ? "" : "s"}.`,
    });
  }
  if (result.code !== 0) {
    throw new Error(`Codex test exited with ${result.code ?? result.signal ?? "unknown"}: ${result.stderr.trim().slice(0, 800)}`);
  }
  if (output.trim()) return output.trim();
  const stderrText = result.stderr.trim();
  throw new Error(stderrText ? `Codex completed without assistant text. stderr: ${stderrText}` : "Codex completed without assistant text.");
}

export async function testClaudeAgent(input: {
  adapter: Pick<ClaudeAgentSdkAdapter, "runOneShot">;
  channel: AgentChannel;
  modelId: string;
  workDir: string;
  emit: AgentTestEmit;
  testPrompt: string;
}): Promise<string> {
  const sdkModel = claudeCliModelForChannel(input.channel, input.modelId);
  input.emit({ type: "phase", content: `Launching Claude Code with model ${sdkModel ?? "default"}.` });
  input.emit({ type: "user", content: input.testPrompt });

  let output = "";
  let completedContent: string | undefined;
  let emittedAssistant = false;
  let errorMessage: string | undefined;

  try {
    await input.adapter.runOneShot({
      prompt: input.testPrompt,
      cwd: input.workDir,
      ...(sdkModel ? { modelId: sdkModel } : {}),
      onEvent: (event) => {
        if (event.type === "delta") {
          output += event.content;
          input.emit({ type: "assistant_delta", content: event.content });
          return;
        }
        if (event.type === "completed") {
          if (event.content) {
            completedContent = event.content;
            if (!emittedAssistant) {
              input.emit({ type: "assistant", content: event.content });
              emittedAssistant = true;
            }
          }
          return;
        }
        if (event.type === "tool_call" || event.type === "tool_result") {
          input.emit({ type: "tool", content: event.content });
          return;
        }
        if (event.type === "error") {
          errorMessage = event.error;
          input.emit({ type: "error", content: event.error });
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

  const finalOutput = completedContent?.trim() || output.trim();
  if (finalOutput) return finalOutput;
  throw new Error("Claude completed without assistant text.");
}
