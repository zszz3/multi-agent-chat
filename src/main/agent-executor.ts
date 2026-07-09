import type { Dirent } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentChannel,
  AgentEvent,
  AgentId,
  AgentRuntime,
  RuntimeConversation,
  RuntimeRequest,
  WorkflowAgentResponse,
  WorkflowGraph,
} from "../shared/types";
import { DEFAULT_MODEL_ID, runtimeModelId } from "../shared/models";
import { codexEnvironmentForChannel } from "./agents/codex-env";
import { claudeCliModelForChannel } from "./agents/claude-env";
import { ClaudeAgentSdkAdapter, type ClaudeAgentSdkRunInput } from "./agents/claude-agent-sdk";
import { ClaudeAgentSdkInteractive } from "./agents/claude-agent-sdk-interactive";
import { ClaudeInteractiveSession } from "./agents/claude-interactive-session";
import { CodexInteractiveSession } from "./agents/codex-interactive-session";
import { CodexRpcClient } from "./agents/codex-rpc";
import { HermesRunner } from "./agents/hermes-runner";
import { RuntimeRouter } from "./agents/runtime-router";
import {
  claudeRuntimeStateCodec,
  codexRuntimeStateCodec,
  hermesRuntimeStateCodec,
} from "./agents/runtime-state-codec";
import type {
  RuntimeChannelTestContext,
  RuntimeDriver,
  RuntimeSessionCleanupContext,
  RuntimeSurfaceSupport,
  RuntimeWorkflowRequestContext,
} from "./agents/runtime-driver";
import { RuntimeDriverRegistry } from "./agents/runtime-driver";
import { execCli } from "./cli-launcher";
import { codexAppServerConfigArgs, codexHome } from "./model-config";

export { RuntimeDriverRegistry } from "./agents/runtime-driver";

const HERMES_AGENT_TEST_PROMPT = "Reply with OK only.";
const WORKFLOW_AGENT_IDLE_TIMEOUT_MS = 10 * 60_000;
const WORKFLOW_DEVELOPER_INSTRUCTIONS =
  "You are the workflow builder and main review agent for a lightweight desktop UI. During workflow planning, interview the user one question at a time and include a recommended answer with every question. When the workflow graph is ready, use the MCP workflow_create tool to create the editable workflow DAG. If workflow tools are unavailable, fall back to producing only workflowGraph.upsert code. During completed workflow review, do not create or upsert workflow graphs; write a Markdown Final User Report for the same user conversation and stay ready for follow-up questions.";

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
    options?: CodexServerRequestOptions,
  ) => void;
  codexWorkflowExtraArgs?: () => string[];
  claudeWorkflowMcpServers?: () => ClaudeAgentSdkRunInput["mcpServers"] | undefined;
  runClaudeOneShot?: (input: ClaudeAgentSdkRunInput) => Promise<void>;
  askWorkflowByRuntime?: Partial<Record<AgentId, (input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>>>;
  testChannelByRuntime?: Partial<Record<AgentId, (input: RuntimeChannelTestContext) => Promise<string>>>;
  deleteSessionArtifactsByRuntime?: Partial<Record<AgentId, (input: RuntimeSessionCleanupContext) => Promise<void>>>;
}

interface CodexServerRequestOptions {
  onWorkflowGraph?: (payload: { graph: WorkflowGraph; workflowId?: string; revision?: number }) => void;
}

type WorkflowToolName = "workflow_create" | "workflow_validate" | "workflow_context_append";

function modelFromRuntimeConfig(runtimeConfig: RuntimeRequest["runtimeConfig"]): string {
  return runtimeConfig.model;
}

function codexThreadIdFromConversation(conversation?: RuntimeConversation): string | undefined {
  return codexRuntimeStateCodec.decodeConversation(conversation)?.native.threadId;
}

function claudeSessionIdFromConversation(conversation?: RuntimeConversation): string | undefined {
  return claudeRuntimeStateCodec.decodeConversation(conversation)?.native.sessionId;
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

function cloneCodexRuntimeConversation(conversation: RuntimeConversation): RuntimeConversation {
  const cloned = codexRuntimeStateCodec.cloneConversation(conversation);
  if (!cloned) {
    throw new Error(`Invalid ${conversation.runtimeId} runtime conversation envelope.`);
  }
  return cloned;
}

function cloneClaudeRuntimeConversation(conversation: RuntimeConversation): RuntimeConversation {
  const cloned = claudeRuntimeStateCodec.cloneConversation(conversation);
  if (!cloned) {
    throw new Error(`Invalid ${conversation.runtimeId} runtime conversation envelope.`);
  }
  return cloned;
}

function support(surface: RuntimeSurfaceSupport["surface"], executionModes: RuntimeSurfaceSupport["executionModes"], continuationPolicies: RuntimeSurfaceSupport["continuationPolicies"]): RuntimeSurfaceSupport {
  return { surface, executionModes, continuationPolicies };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const WORKFLOW_TOOL_NAMES = new Set<WorkflowToolName>([
  "workflow_create",
  "workflow_validate",
  "workflow_context_append",
]);

function normalizeWorkflowToolName(value: unknown): WorkflowToolName | undefined {
  if (typeof value !== "string") return undefined;
  const candidates = [
    value,
    ...value.split("__"),
    ...value.split(/[.:/]/),
  ];
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase().replace(/-/g, "_");
    if (WORKFLOW_TOOL_NAMES.has(normalized as WorkflowToolName)) return normalized as WorkflowToolName;
  }
  return undefined;
}

function parseToolInputRecord(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (record) return record;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return asRecord(JSON.parse(value) as unknown);
  } catch {
    return undefined;
  }
}

function asWorkflowGraph(value: unknown): WorkflowGraph | undefined {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.nodes) || !Array.isArray(record.edges)) return undefined;
  return record as unknown as WorkflowGraph;
}

function workflowGraphPayloadFromToolResult(content: string): { graph: WorkflowGraph; workflowId?: string; revision?: number } | undefined {
  const payload = parseToolInputRecord(content);
  if (!payload) return undefined;
  const workflow = asRecord(payload.workflow);
  const graph = asWorkflowGraph(workflow?.graph ?? payload.graph);
  if (!graph) return undefined;
  const result: { graph: WorkflowGraph; workflowId?: string; revision?: number } = { graph };
  const workflowId = asOptionalString(payload.workflowId) ?? asOptionalString(workflow?.workflowId);
  if (workflowId) result.workflowId = workflowId;
  const revision = typeof payload.revision === "number" ? payload.revision : typeof workflow?.revision === "number" ? workflow.revision : undefined;
  if (revision !== undefined) result.revision = revision;
  return result;
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

function claudeProjectStoragePath(workDir: string, sessionId: string): string {
  const slug = workDir.replace(/[:\\/]/g, "-");
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, ".claude", "projects", slug, `${sessionId}.jsonl`);
}

async function deleteCodexSessionFiles(home: string, sessionId: string): Promise<number> {
  const root = path.join(home, "sessions");
  let deleted = 0;
  const visit = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }
        if (!entry.isFile() || !entry.name.includes(sessionId)) return;
        await rm(entryPath, { force: true });
        deleted += 1;
      }),
    );
  };
  await visit(root);
  return deleted;
}

async function deleteCodexSessionArtifacts(executable: string, runtimeConversation?: RuntimeConversation): Promise<void> {
  const sessionId = codexThreadIdFromConversation(runtimeConversation);
  if (!sessionId) return;
  try {
    await execCli({
      executable,
      args: ["archive", sessionId],
      cwd: process.cwd(),
      env: process.env,
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 1024 * 64,
    });
  } catch (error) {
    console.warn(`Failed to archive Codex session ${sessionId}:`, error);
  }
  try {
    await deleteCodexSessionFiles(codexHome(), sessionId);
  } catch (error) {
    console.warn(`Failed to delete local Codex session ${sessionId}:`, error);
  }
}

async function deleteClaudeSessionArtifacts(workDir: string, runtimeConversation?: RuntimeConversation): Promise<void> {
  const sessionId = claudeSessionIdFromConversation(runtimeConversation);
  if (!sessionId) return;
  try {
    await rm(claudeProjectStoragePath(workDir, sessionId), { force: true });
  } catch (error) {
    console.warn(`Failed to delete Claude session ${sessionId}:`, error);
  }
}

async function runHermesWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeAgentExecutorFactoryOptions,
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

async function runCodexWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeAgentExecutorFactoryOptions,
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
      extraArgs: [
        ...codexAppServerConfigArgs(channel, modelFromRuntimeConfig(input.runtimeConfig)),
        ...(options.codexWorkflowExtraArgs?.() ?? []),
      ],
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
          input.onEvent?.({ requestId: input.requestId, type: "completed", content: content.trim(), ...(runtimeConversation ? { runtimeConversation } : {}) });
          settle(() => resolve({ content: content.trim(), ...(runtimeConversation ? { runtimeConversation } : {}) }));
          return;
        }
        if (event.type === "error") {
          input.onEvent?.({ requestId: input.requestId, type: "error", error: event.error });
          settle(() => reject(new Error(event.error)));
        }
      },
      onRequest: (id, method, params) => {
        if (client) {
          options.respondToCodexServerRequest(client, id, method, params, {
            onWorkflowGraph: ({ graph, workflowId, revision }) => {
              const workflowEvent = {
                requestId: input.requestId,
                type: "workflow_graph" as const,
                graph,
                content: "Workflow graph created through MCP.",
                ...(workflowId ? { workflowId } : {}),
                ...(revision !== undefined ? { revision } : {}),
              };
              input.onEvent?.(workflowEvent);
            },
          });
        }
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

async function runClaudeWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeAgentExecutorFactoryOptions,
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
  const emittedWorkflowIds = new Set<string>();
  const mcpServers = options.claudeWorkflowMcpServers?.();

  try {
    await runClaudeOneShot({
      prompt: input.prompt,
      cwd: input.workDir,
      ...(sdkModel ? { modelId: sdkModel } : {}),
      developerInstructions: WORKFLOW_DEVELOPER_INSTRUCTIONS,
      ...(resumeSessionId ? { resumeSessionId } : {}),
      ...(mcpServers ? { mcpServers } : {}),
      onEvent: (event) => {
        if (event.type === "delta") {
          content += event.content;
          input.onEvent?.({ requestId: input.requestId, type: "delta", content: event.content });
          return;
        }
        if (event.type === "tool_result" && normalizeWorkflowToolName(event.name) === "workflow_create") {
          const payload = workflowGraphPayloadFromToolResult(event.content);
          if (!payload) return;
          const dedupeKey = payload.workflowId ?? payload.graph.title;
          if (emittedWorkflowIds.has(dedupeKey)) return;
          emittedWorkflowIds.add(dedupeKey);
          input.onEvent?.({
            requestId: input.requestId,
            type: "workflow_graph",
            graph: payload.graph,
            content: "Workflow graph created through MCP.",
            ...(payload.workflowId ? { workflowId: payload.workflowId } : {}),
            ...(payload.revision !== undefined ? { revision: payload.revision } : {}),
          });
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
  input.onEvent?.({ requestId: input.requestId, type: "completed", content: finalContent, ...(runtimeConversation ? { runtimeConversation } : {}) });
  return { content: finalContent, ...(runtimeConversation ? { runtimeConversation } : {}) };
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
      runtimeId: input.runtime.id,
      executionMode: "oneshot",
      continuationPolicy: "fresh",
      runtimeConfig: { model: input.modelId },
      runtime: input.runtime,
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

export function createRuntimeDriverRegistry(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriverRegistry {
  const askWorkflowByRuntime = options.askWorkflowByRuntime ?? {};
  const testChannelByRuntime = options.testChannelByRuntime ?? {};
  const deleteSessionArtifactsByRuntime = options.deleteSessionArtifactsByRuntime ?? {};
  const claudeSdkAdapter = new ClaudeAgentSdkAdapter();
  const runClaudeOneShot = options.runClaudeOneShot ?? ((input: ClaudeAgentSdkRunInput) => claudeSdkAdapter.runOneShot(input));
  const codexDriver: RuntimeDriver = {
    runtimeId: "codex",
    surfaceSupport: [
      support("chat", ["interactive"], ["fresh", "resume-preferred"]),
      support("task", ["oneshot"], ["fresh", "resume-preferred"]),
      support("workflow", ["oneshot"], ["fresh", "resume-preferred"]),
      support("channel-test", ["oneshot"], ["fresh"]),
      support("cleanup", ["oneshot"], ["fresh", "resume-preferred"]),
    ],
    runtimeStateCodec: codexRuntimeStateCodec,
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
  };
  const claudeDriver: RuntimeDriver = {
    runtimeId: "claude",
    surfaceSupport: [
      support("chat", ["interactive"], ["fresh", "resume-preferred"]),
      support("task", ["oneshot"], ["fresh", "resume-preferred"]),
      support("workflow", ["oneshot"], ["fresh", "resume-preferred"]),
      support("channel-test", ["oneshot"], ["fresh"]),
      support("cleanup", ["oneshot"], ["fresh", "resume-preferred"]),
    ],
    runtimeStateCodec: claudeRuntimeStateCodec,
    getCapabilities: () => ({
      ...defaultInteractiveCapabilities("claude"),
      resume: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: true,
        supportsResumeAfterAppRestart: true,
        supportsTurnResume: false,
      },
    }),
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
  };
  const apiDriver: RuntimeDriver = {
    runtimeId: "api",
    surfaceSupport: [
      support("chat", ["oneshot"], ["fresh"]),
      support("task", ["oneshot"], ["fresh"]),
      support("workflow", ["oneshot"], ["fresh"]),
      support("channel-test", ["oneshot"], ["fresh"]),
      support("cleanup", ["oneshot"], ["fresh"]),
    ],
    getCapabilities: () => defaultOneShotCapabilities("api"),
    createOneShotExecutor: (context) => new ApiAgentExecutor(context, options),
    askWorkflow: askWorkflowByRuntime.api,
    testChannel: testChannelByRuntime.api,
    deleteSessionArtifacts: deleteSessionArtifactsByRuntime.api ?? (async () => undefined),
  };
  const hermesDriver: RuntimeDriver = {
    runtimeId: "hermes",
    surfaceSupport: [
      support("chat", ["oneshot"], ["fresh"]),
      support("task", ["oneshot"], ["fresh"]),
      support("workflow", ["oneshot"], ["fresh"]),
      support("channel-test", ["oneshot"], ["fresh"]),
      support("cleanup", ["oneshot"], ["fresh"]),
    ],
    runtimeStateCodec: hermesRuntimeStateCodec,
    getCapabilities: () => defaultOneShotCapabilities("hermes"),
    createOneShotExecutor: (context) => new HermesAgentExecutor(context, options),
    askWorkflow: (input) => runHermesWorkflow(input, options),
    testChannel: (input) => runHermesChannelTest(input, options),
    deleteSessionArtifacts: async () => undefined,
  };
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

    const model = this.resolveModel(channel);
    if (!model) {
      this.context.emit({ type: "error", error: "API agent requires a model." });
      this.context.onExit(1);
      return;
    }

    const controller = new AbortController();
    this.controller = controller;

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
    const model = runtimeModelId(modelFromRuntimeConfig(this.context.runtimeConfig));
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
