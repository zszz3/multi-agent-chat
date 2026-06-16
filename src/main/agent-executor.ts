import type { AgentChannel, AgentEvent, AgentId, AgentRuntime } from "../shared/types";
import { DEFAULT_MODEL_ID, runtimeModelId } from "../shared/models";
import { ClaudeRunner } from "./agents/claude-runner";
import { CodexRpcClient } from "./agents/codex-rpc";
import { codexAppServerConfigArgs } from "./model-config";

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
}

export class RuntimeAgentExecutorFactory implements AgentExecutorFactory {
  constructor(private readonly options: RuntimeAgentExecutorFactoryOptions) {}

  create(context: AgentExecutionContext): AgentExecutor {
    if (context.agentId === "codex") {
      return new CodexAgentExecutor(context, this.options);
    }
    if (context.agentId === "api") {
      return new ApiAgentExecutor(context, this.options);
    }
    return new ClaudeAgentExecutor(context, this.options);
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
      env: process.env as Record<string, string>,
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
    this.runner = new ClaudeRunner({
      executable: this.context.runtime.command || this.options.executables.claude,
      cwd: this.context.workDir,
      env: process.env as Record<string, string>,
      prompt: this.context.prompt,
      modelId: runtimeModelId(this.context.modelId) ?? undefined,
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
