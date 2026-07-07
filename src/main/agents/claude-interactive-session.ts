import type { ChatRuntimeSessionState, PersistedResumeState } from "../../shared/types";
import type { InteractiveSession, InteractiveSessionContext } from "./runtime-driver";
import { ClaudeAgentSdkInteractive } from "./claude-agent-sdk-interactive";
import { ProcessLease } from "./process-lease";
import { planSessionReconfigure } from "./session-reconfigure";

type ClaudeInteractiveSdkBinding = Pick<
  ClaudeAgentSdkInteractive,
  "isAttached" | "attach" | "sendUserMessage" | "interrupt" | "detach"
>;

interface ClaudeInteractiveSessionOptions {
  sdkInteractive: ClaudeInteractiveSdkBinding;
  capabilities: ChatRuntimeSessionState["capabilities"];
  resolveModelId?: (context: InteractiveSessionContext) => string | undefined;
  now?: () => number;
}

export class ClaudeInteractiveSession implements InteractiveSession {
  private readonly lease = new ProcessLease();
  private readonly now: () => number;
  private readonly sdkInteractive: ClaudeInteractiveSdkBinding;
  private resumeState: PersistedResumeState | undefined;
  private attachmentState: ChatRuntimeSessionState["attachmentState"] = "detached";
  private attachmentGeneration = 0;
  private activeTurnId: string | undefined;
  private lastMeaningfulActivityAt: number | undefined;
  private pendingContext: InteractiveSessionContext | undefined;

  constructor(
    private context: InteractiveSessionContext,
    private readonly options: ClaudeInteractiveSessionOptions,
  ) {
    this.sdkInteractive = options.sdkInteractive;
    this.now = options.now ?? (() => Date.now());
    this.resumeState = context.resumeState?.runtimeId === "claude" ? { ...context.resumeState } : undefined;
  }

  reconfigure(context: InteractiveSessionContext): void {
    const plan = planSessionReconfigure(this.context, context);
    this.context = { ...this.context, ...plan.applyNow };
    if (plan.invalidateResume) {
      this.resumeState = undefined;
    } else if (context.resumeState?.runtimeId === "claude") {
      this.resumeState = { ...context.resumeState };
    }

    const nextContext = { ...this.context, ...plan.applyOnNextAttach };
    if (
      Object.keys(plan.applyOnNextAttach).length > 0 &&
      (this.attachmentState === "running" || this.sdkInteractive.isAttached())
    ) {
      this.pendingContext = nextContext;
      this.context.syncState?.(this.snapshot());
      return;
    }

    this.context = nextContext;
    this.pendingContext = undefined;
    this.context.syncState?.(this.snapshot());
  }

  async ensureAttached(): Promise<void> {
    if (this.pendingContext && this.attachmentState !== "running") {
      if (this.sdkInteractive.isAttached()) {
        await this.sdkInteractive.detach();
      }
      this.attachmentState = "detached";
      this.applyPendingContextAfterDetach();
    }

    if (this.sdkInteractive.isAttached()) return;
    if (this.attachmentState !== "detached") return;

    const generation = this.lease.nextAttachmentGeneration();
    this.attachmentGeneration = generation;
    this.attachmentState = "idle";
    this.touch();
    this.context.syncState?.(this.snapshot());

    await this.sdkInteractive.attach({
      cwd: this.context.workDir,
      modelId: this.options.resolveModelId?.(this.context) ?? this.context.modelId,
      developerInstructions: this.context.developerInstructions,
      ...(this.resumeState?.runtimeId === "claude" ? { resumeSessionId: this.resumeState.native.sessionId } : {}),
      onEvent: (event) => {
        if (!this.lease.matchesAttachment(generation)) return;
        if (event.type !== "session" && this.activeTurnId === undefined) return;
        this.handleEvent(event);
      },
    });
  }

  async sendPrompt(prompt: string): Promise<void> {
    await this.ensureAttached();
    this.activeTurnId = this.lease.nextTurnId();
    this.attachmentState = "running";
    this.touch();
    this.context.syncState?.(this.snapshot());

    try {
      await this.sdkInteractive.sendUserMessage(prompt);
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
    await this.sdkInteractive.interrupt();
  }

  async detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void> {
    void reason;
    await this.sdkInteractive.detach();
    this.attachmentState = "detached";
    this.activeTurnId = undefined;
    this.applyPendingContextAfterDetach();
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
      this.refreshClaudeResumeState(event.sessionId);
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

  private refreshClaudeResumeState(sessionId: string): void {
    const previousResume =
      this.resumeState?.runtimeId === "claude"
        ? this.resumeState
        : undefined;
    const previousNative = previousResume?.native;
    const previousAppContext = previousResume?.appContext;

    this.resumeState = {
      runtimeId: "claude",
      native: {
        sessionId,
        ...(previousNative?.projectKey !== undefined ? { projectKey: previousNative.projectKey } : {}),
        ...(previousNative?.subpaths !== undefined ? { subpaths: [...previousNative.subpaths] } : {}),
      },
      appContext: {
        cwd: this.context.workDir,
        modelId: this.context.modelId,
        ...(previousAppContext?.claudeConfigDir !== undefined
          ? { claudeConfigDir: previousAppContext.claudeConfigDir }
          : {}),
        ...(previousAppContext?.sessionStoreRef !== undefined
          ? { sessionStoreRef: previousAppContext.sessionStoreRef }
          : {}),
      },
    };
  }

  private applyPendingContextAfterDetach(): void {
    if (!this.pendingContext) return;
    this.context = this.pendingContext;
    this.pendingContext = undefined;
  }
}
