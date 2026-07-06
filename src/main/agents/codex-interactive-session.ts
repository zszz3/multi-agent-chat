import { runtimeModelId } from "../../shared/models";
import type { AgentEvent, ChatRuntimeSessionState, PersistedResumeState } from "../../shared/types";
import type { InteractiveSession, InteractiveSessionContext } from "./runtime-driver";
import { ProcessLease } from "./process-lease";
import { CodexRpcClient } from "./codex-rpc";
import { planSessionReconfigure } from "./session-reconfigure";

interface CodexInteractiveSessionOptions {
  createCodexClient: (input: {
    onEvent: (event: AgentEvent) => void;
    onExit: (code: number | null, signal: NodeJS.Signals | null, stderr: string) => void;
  }) => CodexRpcClient;
  capabilities: ChatRuntimeSessionState["capabilities"];
  now?: () => number;
}

export class CodexInteractiveSession implements InteractiveSession {
  private readonly lease = new ProcessLease();
  private readonly now: () => number;
  private client: CodexRpcClient | undefined;
  private resumeState: PersistedResumeState | undefined;
  private attachmentState: ChatRuntimeSessionState["attachmentState"] = "detached";
  private attachmentGeneration = 0;
  private activeTurnId: string | undefined;
  private lastMeaningfulActivityAt: number | undefined;
  private pendingContext: InteractiveSessionContext | undefined;

  constructor(
    private context: InteractiveSessionContext,
    private readonly options: CodexInteractiveSessionOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.resumeState = context.resumeState?.runtimeId === "codex" ? { ...context.resumeState } : undefined;
  }

  reconfigure(context: InteractiveSessionContext): void {
    const plan = planSessionReconfigure(this.context, context);
    this.context = { ...this.context, ...plan.applyNow };
    if (plan.invalidateResume) {
      this.resumeState = undefined;
    } else if (!this.client && context.resumeState?.runtimeId === "codex") {
      this.resumeState = { ...context.resumeState };
    }

    const nextContext = { ...this.context, ...plan.applyOnNextAttach };
    if (this.attachmentState === "running" && Object.keys(plan.applyOnNextAttach).length > 0) {
      this.pendingContext = nextContext;
      this.context.syncState?.(this.snapshot());
      return;
    }

    this.context = nextContext;
    this.pendingContext = undefined;
    this.context.syncState?.(this.snapshot());
  }

  async ensureAttached(): Promise<void> {
    if (this.client) return;

    const generation = this.lease.nextAttachmentGeneration();
    this.attachmentGeneration = generation;
    const client = this.options.createCodexClient({
      onEvent: (event) => {
        if (!this.lease.matchesAttachment(generation)) return;
        this.handleEvent(event);
      },
      onExit: (_code, _signal, _stderr) => {
        if (!this.lease.matchesAttachment(generation)) return;
        this.client = undefined;
        this.attachmentState = "detached";
        this.activeTurnId = undefined;
        this.touch();
        this.context.syncState?.(this.snapshot());
      },
    });
    this.client = client;

    try {
      await client.start();
      const threadResult = this.resumeState?.runtimeId === "codex"
        ? await client.request("thread/resume", {
            threadId: this.resumeState.native.threadId,
            model: runtimeModelId(this.context.modelId),
            modelProvider: null,
            cwd: this.context.workDir,
            approvalPolicy: "never",
            config: null,
            baseInstructions: null,
            developerInstructions: this.context.developerInstructions,
          })
        : await client.request("thread/start", {
            model: runtimeModelId(this.context.modelId),
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
        this.resumeState = {
          runtimeId: "codex",
          native: { threadId },
          appContext: {
            cwd: this.context.workDir,
            modelId: this.context.modelId,
            approvalPolicy: "never",
          },
        };
        this.context.emit({ type: "session", sessionId: threadId });
      }

      this.attachmentState = "idle";
      this.activeTurnId = undefined;
      this.touch();
      this.context.syncState?.(this.snapshot());
    } catch (error) {
      try {
        await client.shutdown();
      } catch {
        // Best effort cleanup after partial attach failure.
      }
      this.client = undefined;
      this.attachmentState = "detached";
      this.activeTurnId = undefined;
      this.touch();
      this.context.syncState?.(this.snapshot());
      throw error;
    }
  }

  async sendPrompt(prompt: string): Promise<void> {
    await this.ensureAttached();
    const client = this.client;
    if (!client) throw new Error("Codex interactive session is not attached.");

    this.attachmentState = "running";
    this.touch();
    this.context.syncState?.(this.snapshot());

    try {
      const result = await client.request("turn/start", {
        threadId: this.codexThreadId(),
        input: [{ type: "text", text: prompt, text_elements: [] }],
      });
      const turnId = (result as { turn?: { id?: string } }).turn?.id;
      if (this.attachmentState === "running") {
        this.activeTurnId = turnId;
        this.context.syncState?.(this.snapshot());
      }
    } catch (error) {
      this.activeTurnId = undefined;
      this.attachmentState = this.client ? "idle" : "detached";
      this.touch();
      this.context.syncState?.(this.snapshot());
      throw error;
    }
  }

  async interrupt(): Promise<void> {
    if (!this.client) return;
    this.attachmentState = "interrupted";
    this.touch();
    this.context.syncState?.(this.snapshot());
    await this.client.interruptTurn(this.codexThreadId(), this.activeTurnId);
  }

  async detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void> {
    void reason;
    const client = this.client;
    this.client = undefined;
    try {
      await client?.shutdown();
    } finally {
      this.attachmentState = "detached";
      this.activeTurnId = undefined;
      this.applyPendingContextIfIdle();
      this.touch();
      this.context.syncState?.(this.snapshot());
    }
  }

  async detachIfStillExpired(input: {
    expectedGeneration: number;
    expectedLastMeaningfulActivityAt: number;
    reason: "idle_timeout" | "app_shutdown" | "error";
  }): Promise<void> {
    if (!this.lease.matchesAttachment(input.expectedGeneration)) return;
    if (this.lastMeaningfulActivityAt !== input.expectedLastMeaningfulActivityAt) return;
    if (this.attachmentState !== "idle" && this.attachmentState !== "interrupted") return;
    await this.detach(input.reason);
  }

  snapshot(): ChatRuntimeSessionState {
    return {
      executionStyle: "interactive",
      attachmentState: this.attachmentState,
      attachmentGeneration: this.attachmentGeneration,
      ...(this.activeTurnId ? { activeTurnId: this.activeTurnId } : {}),
      ...(this.lastMeaningfulActivityAt !== undefined ? { lastMeaningfulActivityAt: this.lastMeaningfulActivityAt } : {}),
      ...(this.resumeState ? { resumeState: { ...this.resumeState } } : {}),
      capabilities: this.options.capabilities,
    };
  }

  private handleEvent(event: AgentEvent): void {
    if (event.type === "completed") {
      this.attachmentState = "idle";
      this.activeTurnId = undefined;
      this.applyPendingContextIfIdle();
      this.touch();
    } else if (event.type === "error") {
      this.attachmentState = "interrupted";
      this.activeTurnId = undefined;
      this.applyPendingContextIfIdle();
      this.touch();
    } else if (event.type === "delta" || event.type === "meta" || event.type === "system" || event.type === "tool_call" || event.type === "tool_result" || event.type === "handoff") {
      this.touch();
    }

    this.context.emit(event);
    this.context.syncState?.(this.snapshot());
  }

  private codexThreadId(): string {
    if (this.resumeState?.runtimeId !== "codex") {
      throw new Error("Codex interactive session is missing a thread id.");
    }
    return this.resumeState.native.threadId;
  }

  private touch(): void {
    this.lastMeaningfulActivityAt = this.now();
  }

  private applyPendingContextIfIdle(): void {
    if (!this.pendingContext) return;
    if (this.attachmentState === "running") return;
    this.context = this.pendingContext;
    this.pendingContext = undefined;
  }
}
