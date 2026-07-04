import type { ChatRuntimeSessionState, PersistedResumeState } from "../../shared/types";
import type { InteractiveSession, InteractiveSessionContext } from "./runtime-driver";
import { ProcessLease } from "./process-lease";
import type { ClaudeInteractiveTransport, ClaudeInteractiveTransportHandle } from "./claude-sdk-interactive-transport";

interface ClaudeInteractiveSessionOptions {
  createTransport: () => ClaudeInteractiveTransport;
  capabilities: ChatRuntimeSessionState["capabilities"];
  now?: () => number;
}

export class ClaudeInteractiveSession implements InteractiveSession {
  private readonly lease = new ProcessLease();
  private readonly now: () => number;
  private readonly transport: ClaudeInteractiveTransport;
  private handle: ClaudeInteractiveTransportHandle | undefined;
  private resumeState: PersistedResumeState | undefined;
  private attachmentState: ChatRuntimeSessionState["attachmentState"] = "detached";
  private attachmentGeneration = 0;
  private activeTurnId: string | undefined;
  private lastMeaningfulActivityAt: number | undefined;

  constructor(
    private context: InteractiveSessionContext,
    private readonly options: ClaudeInteractiveSessionOptions,
  ) {
    this.transport = options.createTransport();
    this.now = options.now ?? (() => Date.now());
    this.resumeState = context.resumeState?.runtimeId === "claude" ? { ...context.resumeState } : undefined;
  }

  reconfigure(context: InteractiveSessionContext): void {
    this.context = context;
    if (context.resumeState?.runtimeId === "claude") {
      this.resumeState = { ...context.resumeState };
    }
  }

  async ensureAttached(): Promise<void> {
    if (this.attachmentState !== "detached") return;
    this.attachmentGeneration = this.lease.nextAttachmentGeneration();
    this.attachmentState = "idle";
    this.touch();
    this.context.syncState?.(this.snapshot());
  }

  async sendPrompt(prompt: string): Promise<void> {
    await this.ensureAttached();
    const turnId = this.lease.nextTurnId();
    const generation = this.lease.currentAttachmentGeneration();
    this.activeTurnId = turnId;
    this.attachmentState = "running";
    this.touch();
    this.context.syncState?.(this.snapshot());

    try {
      this.handle = await this.transport.startTurn({
        prompt,
        sessionId: this.resumeState?.runtimeId === "claude" ? this.resumeState.native.sessionId : undefined,
        modelId: this.context.modelId,
        cwd: this.context.workDir,
        onEvent: (event) => {
          if (!this.lease.matchesAttachment(generation)) return;
          if (event.type !== "session" && this.activeTurnId !== turnId) return;
          this.handleEvent(event);
        },
      });
    } catch (error) {
      this.activeTurnId = undefined;
      this.attachmentState = "idle";
      this.touch();
      this.context.syncState?.(this.snapshot());
      throw error;
    }
  }

  async interrupt(): Promise<void> {
    this.attachmentState = "interrupted";
    this.activeTurnId = undefined;
    this.touch();
    this.context.syncState?.(this.snapshot());
    await this.transport.interrupt();
  }

  async detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void> {
    void reason;
    await this.handle?.stop();
    await this.transport.detach();
    this.handle = undefined;
    this.attachmentState = "detached";
    this.activeTurnId = undefined;
    this.touch();
    this.context.syncState?.(this.snapshot());
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

  private handleEvent(event: { type: string } & Record<string, unknown>): void {
    if (event.type === "session" && typeof event.sessionId === "string") {
      this.resumeState = {
        runtimeId: "claude",
        native: { sessionId: event.sessionId },
        appContext: { cwd: this.context.workDir, modelId: this.context.modelId },
      };
      this.touch();
    } else if (event.type === "completed") {
      this.attachmentState = "idle";
      this.activeTurnId = undefined;
      this.touch();
    } else if (event.type === "error") {
      this.attachmentState = "interrupted";
      this.activeTurnId = undefined;
      this.touch();
    } else {
      this.touch();
    }

    this.context.emit(event as never);
    this.context.syncState?.(this.snapshot());
  }

  private touch(): void {
    this.lastMeaningfulActivityAt = this.now();
  }
}
