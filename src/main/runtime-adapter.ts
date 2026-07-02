import type { Dirent } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentChannel,
  AgentEvent,
  AgentId,
  AgentRuntime,
  AgentTestEvent,
  WorkflowAgentEvent,
  WorkflowAgentResponse,
} from "../shared/types";
import { DEFAULT_MODEL_ID, runtimeModelId } from "../shared/models";
import { claudeCliModelForChannel, claudeEnvironmentForChannel } from "./agents/claude-env";
import { ClaudeRunner } from "./agents/claude-runner";
import { createClaudeStreamState, normalizeClaudeStreamEvent } from "./agents/claude-stream";
import { codexEnvironmentForChannel } from "./agents/codex-env";
import { CodexRpcClient, type CodexRpcClientOptions } from "./agents/codex-rpc";
import { execCli, spawnCli } from "./cli-launcher";
import { codexAppServerConfigArgs, codexHome } from "./model-config";

const WORKFLOW_AGENT_IDLE_TIMEOUT_MS = 10 * 60_000;

export interface RuntimeExecutorContext {
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

export interface RuntimeWorkflowContext {
  requestId: string;
  agentId: AgentId;
  runtime: AgentRuntime;
  channelId: string;
  modelId: string;
  prompt: string;
  sessionId: string | undefined;
  workDir: string;
  developerInstructions: string;
  onEvent?: (event: WorkflowAgentEvent) => void;
}

export type RuntimeAgentTestEmit = (event: Omit<AgentTestEvent, "agentId" | "timestamp">) => void;

export interface RuntimeAgentTestContext {
  agentId: AgentId;
  channelId: string;
  modelId: string;
  workDir: string;
  prompt: string;
  developerInstructions: string;
  timeoutMs: number;
  emit: RuntimeAgentTestEmit;
}

export interface RuntimeExecutor {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface RuntimeAdapter {
  createExecutor(context: RuntimeExecutorContext): RuntimeExecutor;
  runWorkflow(context: RuntimeWorkflowContext): Promise<WorkflowAgentResponse>;
  testAgent(context: RuntimeAgentTestContext): Promise<string>;
}

export interface RuntimeAdapterRegistry {
  createExecutor(context: RuntimeExecutorContext): RuntimeExecutor;
  runWorkflow(context: RuntimeWorkflowContext): Promise<WorkflowAgentResponse>;
  testAgent(context: RuntimeAgentTestContext): Promise<string>;
}

export interface RuntimeAdapterRegistryOptions {
  executables: Record<AgentId, string>;
  channelById: (channelId: string) => AgentChannel | undefined;
  respondToCodexServerRequest: (
    client: CodexRpcClient,
    id: number,
    method: string,
    params: Record<string, unknown>,
  ) => void;
}

export function createWorkflowAgentTimeout(input: { timeoutMs: number; onTimeout: () => void }): { refresh: () => void; clear: () => void } {
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

export function claudeProjectStoragePath(workDir: string, sessionId: string): string {
  const slug = workDir.replace(/[<>:"/\\|?*]/g, "-");
  return path.join(os.homedir(), ".claude", "projects", slug, `${sessionId}.jsonl`);
}

export async function deleteCodexSessionFiles(home: string, sessionId: string): Promise<number> {
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

export function createRuntimeAdapterRegistry(options: RuntimeAdapterRegistryOptions): RuntimeAdapterRegistry {
  const adapters: Record<AgentId, RuntimeAdapter> = {
    codex: new CodexRuntimeAdapter(options),
    claude: new ClaudeRuntimeAdapter(options),
    api: new ApiRuntimeAdapter(options),
  };

  return {
    createExecutor(context) {
      return adapters[context.agentId].createExecutor(context);
    },
    runWorkflow(context) {
      return adapters[context.agentId].runWorkflow(context);
    },
    testAgent(context) {
      return adapters[context.agentId].testAgent(context);
    },
  };
}

function createCodexClient(
  options: RuntimeAdapterRegistryOptions,
  input: {
    runtimeCommand: string | undefined;
    channelId: string;
    modelId: string;
    workDir: string;
    onEvent: (event: AgentEvent) => void;
    onExit?: CodexRpcClientOptions["onExit"];
  },
): CodexRpcClient {
  const executable = input.runtimeCommand || options.executables.codex;
  const channel = options.channelById(input.channelId);
  let client!: CodexRpcClient;
  client = new CodexRpcClient({
    executable,
    cwd: input.workDir,
    extraArgs: codexAppServerConfigArgs(channel, input.modelId),
    env: codexEnvironmentForChannel(channel),
    onEvent: input.onEvent,
    onRequest: (id, method, params) => {
      options.respondToCodexServerRequest(client, id, method, params);
    },
    ...(input.onExit ? { onExit: input.onExit } : {}),
  });
  return client;
}

async function startCodexThreadAndTurn(
  client: CodexRpcClient,
  input: {
    modelId: string;
    sessionId: string | undefined;
    workDir: string;
    developerInstructions: string;
    prompt: string;
    onSession?: (sessionId: string) => void;
  },
): Promise<string | undefined> {
  const model = runtimeModelId(input.modelId);
  const threadResult = input.sessionId
    ? await client.request("thread/resume", {
        threadId: input.sessionId,
        model,
        modelProvider: null,
        cwd: input.workDir,
        approvalPolicy: "never",
        config: null,
        baseInstructions: null,
        developerInstructions: input.developerInstructions,
      })
    : await client.request("thread/start", {
        model,
        modelProvider: null,
        profile: null,
        cwd: input.workDir,
        approvalPolicy: "never",
        config: null,
        baseInstructions: null,
        developerInstructions: input.developerInstructions,
        compactPrompt: null,
        includeApplyPatchTool: null,
        experimentalRawEvents: true,
        persistExtendedHistory: true,
      });

  const threadId = (threadResult as { thread?: { id?: string } }).thread?.id ?? input.sessionId;
  if (threadId) input.onSession?.(threadId);
  await client.request("turn/start", {
    threadId,
    input: [{ type: "text", text: input.prompt, text_elements: [] }],
  });
  return threadId;
}

async function requestApiContent(
  channel: AgentChannel,
  input: {
    model: string;
    prompt: string;
    developerInstructions: string;
    signal?: AbortSignal;
    errorPrefix: string;
  },
): Promise<string> {
  const response = await fetch(apiRequestUrl(channel), {
    method: "POST",
    ...(input.signal ? { signal: input.signal } : {}),
    headers: {
      "content-type": "application/json",
      ...(channel.httpHeaders ?? {}),
    },
    body: JSON.stringify(apiRequestBody(channel, input.model, input.prompt, input.developerInstructions)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${input.errorPrefix} (${response.status}): ${text.slice(0, 800)}`);
  return extractApiContent(channel, text);
}

class CodexRuntimeAdapter implements RuntimeAdapter {
  constructor(private readonly options: RuntimeAdapterRegistryOptions) {}

  createExecutor(context: RuntimeExecutorContext): RuntimeExecutor {
    return new CodexRuntimeExecutor(context, this.options);
  }

  async runWorkflow(context: RuntimeWorkflowContext): Promise<WorkflowAgentResponse> {
    let settled = false;
    let content = "";
    let sessionId = context.sessionId;
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

      client = createCodexClient(this.options, {
        runtimeCommand: context.runtime.command,
        channelId: context.channelId,
        modelId: context.modelId,
        workDir: context.workDir,
        onEvent: (event) => {
          timeout?.refresh();
          if (event.type === "delta") {
            content += event.content;
            context.onEvent?.({ requestId: context.requestId, type: "delta", content: event.content });
            return;
          }
          if (event.type === "completed") {
            if (!content && event.content) content = event.content;
            context.onEvent?.({ requestId: context.requestId, type: "completed", content: content.trim(), sessionId });
            settle(() => resolve({ content: content.trim(), sessionId }));
            return;
          }
          if (event.type === "error") {
            context.onEvent?.({ requestId: context.requestId, type: "error", error: event.error });
            settle(() => reject(new Error(event.error)));
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
          sessionId = await startCodexThreadAndTurn(client, {
            modelId: context.modelId,
            sessionId,
            workDir: context.workDir,
            developerInstructions: context.developerInstructions,
            prompt: context.prompt,
          });
        } catch (error) {
          settle(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
      })();
    });
  }

  async testAgent(context: RuntimeAgentTestContext): Promise<string> {
    const channel = this.options.channelById(context.channelId);
    const args = [
      "exec",
      "--ephemeral",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      ...codexAppServerConfigArgs(channel, context.modelId),
      context.prompt,
    ];
    context.emit({ type: "phase", content: `Launching codex exec --ephemeral with model ${runtimeModelId(context.modelId) ?? "default"}.` });
    let output = "";
    const sessionIds = new Set<string>();
    const result = await runStreamingCommand({
      executable: this.options.executables.codex,
      args,
      cwd: context.workDir,
      env: codexEnvironmentForChannel(channel),
      timeoutMs: context.timeoutMs,
      onStdoutLine: (line) => {
        const sessionId = extractCodexSessionId(line);
        if (sessionId) sessionIds.add(sessionId);
        const eventOutput = handleCodexTestLine(line, context.emit);
        if (eventOutput) output += eventOutput;
      },
      onStderr: (text) => context.emit({ type: "stderr", content: text }),
    });
    const deletedSessions = await deleteCodexTestSessions(this.options.executables.codex, codexHome(), sessionIds);
    if (deletedSessions > 0) {
      context.emit({ type: "phase", content: `Deleted ${deletedSessions} Codex test session${deletedSessions === 1 ? "" : "s"}.` });
    }
    if (result.code !== 0) {
      throw new Error(`Codex test exited with ${result.code ?? result.signal ?? "unknown"}: ${result.stderr.trim().slice(0, 800)}`);
    }
    if (output.trim()) return output.trim();
    const stderrText = result.stderr.trim();
    throw new Error(stderrText ? `Codex completed without assistant text. stderr: ${stderrText}` : "Codex completed without assistant text.");
  }
}

class CodexRuntimeExecutor implements RuntimeExecutor {
  private client: CodexRpcClient | undefined;

  constructor(
    private readonly context: RuntimeExecutorContext,
    private readonly options: RuntimeAdapterRegistryOptions,
  ) {}

  async start(): Promise<void> {
    const client = createCodexClient(this.options, {
      runtimeCommand: this.context.runtime.command,
      channelId: this.context.channelId,
      modelId: this.context.modelId,
      workDir: this.context.workDir,
      onEvent: this.context.emit,
      onExit: (code) => {
        this.context.onExit(code);
      },
    });
    this.client = client;

    await client.start();
    await startCodexThreadAndTurn(client, {
      modelId: this.context.modelId,
      sessionId: this.context.sessionId,
      workDir: this.context.workDir,
      developerInstructions: this.context.developerInstructions,
      prompt: this.context.prompt,
      onSession: (sessionId) => {
        this.context.emit({ type: "session", sessionId });
      },
    });
  }

  async stop(): Promise<void> {
    await this.client?.shutdown();
    this.client = undefined;
  }
}

class ClaudeRuntimeAdapter implements RuntimeAdapter {
  constructor(private readonly options: RuntimeAdapterRegistryOptions) {}

  createExecutor(context: RuntimeExecutorContext): RuntimeExecutor {
    return new ClaudeRuntimeExecutor(context, this.options);
  }

  async runWorkflow(context: RuntimeWorkflowContext): Promise<WorkflowAgentResponse> {
    let content = "";
    let sessionId = context.sessionId;
    let errorMessage: string | undefined;

    return new Promise<WorkflowAgentResponse>((resolve, reject) => {
      let timeout: ReturnType<typeof createWorkflowAgentTimeout> | undefined;
      let runner: ClaudeRunner | undefined;
      let settled = false;
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        timeout?.clear();
        callback();
      };
      timeout = createWorkflowAgentTimeout({
        timeoutMs: WORKFLOW_AGENT_IDLE_TIMEOUT_MS,
        onTimeout: () => {
          void runner?.stop();
          settle(() => reject(new Error("Workflow agent timed out after 10 minutes without activity")));
        },
      });
      const channel = this.options.channelById(context.channelId);
      runner = new ClaudeRunner({
        executable: context.runtime.command || this.options.executables.claude,
        cwd: context.workDir,
        env: claudeEnvironmentForChannel(channel, context.modelId, process.env),
        prompt: context.prompt,
        modelId: claudeCliModelForChannel(channel, context.modelId),
        sessionId,
        onEvent: (event) => {
          timeout?.refresh();
          if (event.type === "delta") {
            content += event.content;
            context.onEvent?.({ requestId: context.requestId, type: "delta", content: event.content });
          }
          if (event.type === "completed" && !content && event.content) content = event.content;
          if (event.type === "session") sessionId = event.sessionId;
          if (event.type === "error") {
            errorMessage = event.error;
            context.onEvent?.({ requestId: context.requestId, type: "error", error: event.error });
          }
        },
        onExit: (code) => {
          if (code !== 0) {
            settle(() => reject(new Error(errorMessage ?? `Claude exited with code ${code}`)));
            return;
          }
          context.onEvent?.({ requestId: context.requestId, type: "completed", content: content.trim(), sessionId });
          settle(() => resolve({ content: content.trim(), sessionId }));
        },
      });
      void runner.start().catch((error) => {
        settle(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
    });
  }

  async testAgent(context: RuntimeAgentTestContext): Promise<string> {
    const channel = this.options.channelById(context.channelId);
    const cliModel = claudeCliModelForChannel(channel, context.modelId);
    const env = claudeEnvironmentForChannel(channel, context.modelId, process.env);
    const envModel = typeof env.ANTHROPIC_MODEL === "string" ? env.ANTHROPIC_MODEL : "default";
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode",
      "bypassPermissions",
      ...(cliModel ? ["--model", cliModel] : []),
      context.prompt,
    ];
    context.emit({ type: "phase", content: `Launching Claude Code with model ${cliModel ?? envModel}.` });
    let output = "";
    const sessionIds = new Set<string>();
    const streamState = createClaudeStreamState();
    const result = await runStreamingCommand({
      executable: this.options.executables.claude,
      args,
      cwd: context.workDir,
      env,
      timeoutMs: context.timeoutMs,
      onStdoutLine: (line) => {
        const sessionId = extractClaudeSessionId(line);
        if (sessionId) sessionIds.add(sessionId);
        for (const event of handleClaudeTestLine(line, streamState, context.emit)) output += event;
      },
      onStderr: (text) => context.emit({ type: "stderr", content: text }),
    });
    const deletedSessions = await deleteClaudeTestSessions(context.workDir, sessionIds);
    if (deletedSessions > 0) {
      context.emit({ type: "phase", content: `Deleted ${deletedSessions} Claude test session${deletedSessions === 1 ? "" : "s"}.` });
    }
    if (result.timedOut) {
      throw new Error(`Claude test timed out after ${formatElapsed(context.timeoutMs)} without producing a final response.`);
    }
    if (result.code !== 0) {
      const detail = (result.stderr.trim() || output.trim() || result.stdout.trim()).slice(0, 800);
      throw new Error(`Claude test exited with ${result.code ?? result.signal ?? "unknown"}: ${detail}`);
    }
    if (output.trim()) return output.trim();
    const stderrText = result.stderr.trim();
    throw new Error(stderrText ? `Claude completed without assistant text. stderr: ${stderrText}` : "Claude completed without assistant text.");
  }
}

class ClaudeRuntimeExecutor implements RuntimeExecutor {
  private runner: ClaudeRunner | undefined;

  constructor(
    private readonly context: RuntimeExecutorContext,
    private readonly options: RuntimeAdapterRegistryOptions,
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

class ApiRuntimeAdapter implements RuntimeAdapter {
  constructor(private readonly options: RuntimeAdapterRegistryOptions) {}

  createExecutor(context: RuntimeExecutorContext): RuntimeExecutor {
    return new ApiRuntimeExecutor(context, this.options);
  }

  async runWorkflow(context: RuntimeWorkflowContext): Promise<WorkflowAgentResponse> {
    const channel = this.options.channelById(context.channelId);
    if (!channel?.baseUrl) throw new Error("API workflow agent requires a provider base URL");
    const model = resolveApiModel(channel, context.modelId);
    if (!model) throw new Error("API workflow agent requires a model");

    const content = (await requestApiContent(channel, {
      model,
      prompt: context.prompt,
      developerInstructions: context.developerInstructions,
      errorPrefix: "API workflow request failed",
    })).trim();
    context.onEvent?.({ requestId: context.requestId, type: "delta", content });
    context.onEvent?.({ requestId: context.requestId, type: "completed", content, sessionId: context.sessionId });
    return { content, sessionId: context.sessionId };
  }

  async testAgent(context: RuntimeAgentTestContext): Promise<string> {
    const channel = this.options.channelById(context.channelId);
    if (!channel?.baseUrl) throw new Error("API agent requires a provider base URL.");
    const model = resolveApiModel(channel, context.modelId);
    if (!model) throw new Error("API agent requires a model.");
    context.emit({ type: "phase", content: `Sending HTTP request to ${apiRequestUrl(channel)} with model ${model}.` });
    const output = (await requestApiContent(channel, {
      model,
      prompt: context.prompt,
      developerInstructions: context.developerInstructions,
      signal: AbortSignal.timeout(context.timeoutMs),
      errorPrefix: "API test failed",
    })).trim();
    if (!output) throw new Error("API returned an empty response.");
    context.emit({ type: "assistant", content: output });
    return output;
  }
}

class ApiRuntimeExecutor implements RuntimeExecutor {
  private controller: AbortController | undefined;

  constructor(
    private readonly context: RuntimeExecutorContext,
    private readonly options: RuntimeAdapterRegistryOptions,
  ) {}

  async start(): Promise<void> {
    const channel = this.options.channelById(this.context.channelId);
    if (!channel?.baseUrl) {
      this.context.emit({ type: "error", error: "API agent requires a provider base URL." });
      this.context.onExit(1);
      return;
    }

    const model = resolveApiModel(channel, this.context.modelId);
    if (!model) {
      this.context.emit({ type: "error", error: "API agent requires a model." });
      this.context.onExit(1);
      return;
    }

    const controller = new AbortController();
    this.controller = controller;
    this.context.emit({ type: "session", sessionId: this.context.sessionId ?? this.context.runId });

    try {
      const content = await requestApiContent(channel, {
        model,
        prompt: this.context.prompt,
        developerInstructions: this.context.developerInstructions,
        signal: controller.signal,
        errorPrefix: "API request failed",
      });
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

function resolveApiModel(channel: AgentChannel, modelId: string): string | undefined {
  const model = runtimeModelId(modelId);
  if (model) return model;
  return channel.models.find((item) => item.id !== DEFAULT_MODEL_ID)?.id;
}

function apiRequestUrl(channel: AgentChannel): string {
  if (channel.modelProvider === "anthropic-api") {
    const normalized = (channel.baseUrl ?? "").replace(/\/+$/, "");
    if (normalized.endsWith("/messages")) return normalized;
    return `${normalized}/messages`;
  }
  return chatCompletionsUrl(channel.baseUrl ?? "");
}

function apiRequestBody(channel: AgentChannel, model: string, prompt: string, system: string): Record<string, unknown> {
  if (channel.modelProvider === "anthropic-api") {
    return {
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    };
  }
  return {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    stream: false,
  };
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  return `${normalized}/chat/completions`;
}

function extractApiContent(channel: AgentChannel, text: string): string {
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
  return typeof content === "string" ? content : JSON.stringify(parsed, null, 2);
}

function handleCodexTestLine(line: string, emit: RuntimeAgentTestEmit): string {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      item?: { type?: string; text?: unknown; message?: unknown; command?: unknown; name?: unknown };
      text?: unknown;
      message?: unknown;
      delta?: unknown;
    };
    if (event.type === "item.completed") {
      if (event.item?.type === "agent_message" && typeof event.item.text === "string") {
        emit({ type: "assistant", content: event.item.text });
        return event.item.text;
      }
      if (event.item?.type === "command_execution") {
        const command = typeof event.item.command === "string" ? event.item.command : JSON.stringify(event.item);
        emit({ type: "tool", content: command });
      }
      if (event.item?.type === "error") {
        const message = typeof event.item.message === "string" ? event.item.message : JSON.stringify(event.item);
        emit({ type: isCodexWarningMessage(message) ? "warning" : "error", content: message });
      }
    }
    if (event.type === "agent_message" && typeof event.text === "string") {
      emit({ type: "assistant", content: event.text });
      return event.text;
    }
    if (typeof event.delta === "string") {
      emit({ type: "assistant_delta", content: event.delta });
      return event.delta;
    }
    if (typeof event.message === "string") {
      emit({ type: "assistant", content: event.message });
      return event.message;
    }
  } catch {
    // Ignore non-JSON noise.
  }
  return "";
}

function extractCodexSessionId(line: string): string | undefined {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    const candidates = [
      raw.session_id,
      raw.sessionId,
      raw.thread_id,
      raw.threadId,
      raw.id,
      asRecord(raw.thread)?.id,
      asRecord(raw.session)?.id,
    ];
    return candidates.find((candidate): candidate is string => typeof candidate === "string" && /^[0-9a-f-]{36}$/i.test(candidate));
  } catch {
    return undefined;
  }
}

function isCodexWarningMessage(message: string): boolean {
  return /skill descriptions were shortened/i.test(message) || /context budget/i.test(message);
}

function handleClaudeTestLine(
  line: string,
  streamState: ReturnType<typeof createClaudeStreamState>,
  emit: RuntimeAgentTestEmit,
): string[] {
  try {
    const raw = JSON.parse(line) as {
      type?: string;
      subtype?: string;
      model?: unknown;
      hook_name?: unknown;
      outcome?: unknown;
      result?: unknown;
    };
    const output: string[] = [];
    if (raw.type === "system") {
      if (raw.subtype === "init") {
        const model = typeof raw.model === "string" ? raw.model : "default";
        emit({ type: "phase", content: `Claude initialized with model ${model}.` });
      } else if (typeof raw.hook_name === "string") {
        const outcome = typeof raw.outcome === "string" ? ` (${raw.outcome})` : "";
        emit({ type: "phase", content: `Claude ${raw.subtype ?? "system"}: ${raw.hook_name}${outcome}.` });
      } else if (raw.subtype) {
        emit({ type: "phase", content: `Claude system: ${raw.subtype}.` });
      }
    }
    if (raw.type === "result" && typeof raw.result === "string") {
      emit({ type: "assistant", content: raw.result });
      output.push(raw.result);
    }
    for (const event of normalizeClaudeStreamEvent(raw, streamState)) {
      if (event.type === "delta") {
        emit({ type: "assistant_delta", content: event.content });
        output.push(event.content);
      }
      if (event.type === "completed" && event.content) {
        emit({ type: "assistant", content: event.content });
        if (output.length === 0) output.push(event.content);
      }
      if (event.type === "tool_call" || event.type === "tool_result") {
        emit({ type: "tool", content: event.content });
      }
      if (event.type === "error") {
        emit({ type: "error", content: event.error });
      }
    }
    return output;
  } catch {
    return [];
  }
}

function extractClaudeSessionId(line: string): string | undefined {
  try {
    const raw = JSON.parse(line) as { session_id?: unknown; sessionId?: unknown };
    const sessionId = typeof raw.session_id === "string" ? raw.session_id : typeof raw.sessionId === "string" ? raw.sessionId : undefined;
    return sessionId && /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : undefined;
  } catch {
    return undefined;
  }
}

async function deleteClaudeTestSessions(workDir: string, sessionIds: Iterable<string>): Promise<number> {
  let deleted = 0;
  for (const sessionId of sessionIds) {
    try {
      await rm(claudeProjectStoragePath(workDir, sessionId), { force: true });
      deleted += 1;
    } catch {
      // Best-effort cleanup only; test result should not depend on local history deletion.
    }
  }
  return deleted;
}

async function deleteCodexTestSessions(executable: string, home: string, sessionIds: Iterable<string>): Promise<number> {
  let deleted = 0;
  for (const sessionId of sessionIds) {
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
    } catch {
      // Ignore archive failures; the local file deletion below is what matters.
    }
    try {
      deleted += await deleteCodexSessionFiles(home, sessionId);
    } catch {
      // Best-effort cleanup only; test result should not depend on local history deletion.
    }
  }
  return deleted;
}

async function runStreamingCommand(input: {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  onStdoutLine: (line: string) => void;
  onStderr: (text: string) => void;
}): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const proc = spawnCli({
      executable: input.executable,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, input.timeoutMs);

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) input.onStdoutLine(line);
        newline = stdoutBuffer.indexOf("\n");
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const trimmed = text.trim();
      if (trimmed) input.onStderr(trimmed);
    });

    proc.on("error", (error) => settle(() => reject(error)));
    proc.on("close", (code, signal) => {
      if (stdoutBuffer.trim()) input.onStdoutLine(stdoutBuffer.trim());
      settle(() => resolve({ code, signal, stdout, stderr, timedOut }));
    });
  });
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
