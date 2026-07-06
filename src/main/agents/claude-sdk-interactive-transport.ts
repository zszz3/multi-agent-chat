import type { AgentEvent } from "../../shared/types";
import type {
  ClaudeInteractiveTransport,
  ClaudeInteractiveTransportHandle,
  ClaudeInteractiveTurnInput,
} from "./claude-interactive-transport";
import {
  loadClaudeSdkBindings,
  type ClaudeSdkBindings,
  type ClaudeSdkBindingTurnHandle,
  type ClaudeSdkEvent,
} from "./claude-sdk-bindings";

interface ClaudeSdkInteractiveTransportOptions {
  executable: string;
  sdkModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
  loadBindings?: (options?: { executable?: string }) => Promise<ClaudeSdkBindings>;
}

export class ClaudeSdkInteractiveTransport implements ClaudeInteractiveTransport {
  readonly kind = "sdk" as const;
  private handle: ClaudeInteractiveTransportHandle | undefined;
  private bindingHandle: ClaudeSdkBindingTurnHandle | undefined;

  constructor(private readonly options: ClaudeSdkInteractiveTransportOptions) {}

  async startTurn(input: ClaudeInteractiveTurnInput): Promise<ClaudeInteractiveTransportHandle> {
    const bindings = await (this.options.loadBindings ?? loadClaudeSdkBindings)({
      executable: this.options.executable,
    });
    const bindingHandle = await bindings.startTurn({
      prompt: input.prompt,
      cwd: input.cwd,
      model: this.options.sdkModelForTurn(input.modelId),
      env: this.options.envForTurn(input.modelId),
      ...(input.resumeState
        ? {
            resume: {
              sessionId: input.resumeState.native.sessionId,
              ...(input.resumeState.native.projectKey !== undefined
                ? { projectKey: input.resumeState.native.projectKey }
                : {}),
              ...(input.resumeState.native.subpaths !== undefined
                ? { subpaths: [...input.resumeState.native.subpaths] }
                : {}),
            },
            claudeConfigDir: input.resumeState.appContext?.claudeConfigDir,
            sessionStoreRef: input.resumeState.appContext?.sessionStoreRef,
          }
        : {}),
      onSdkEvent: (event) => {
        const normalized = normalizeClaudeSdkEvent(event);
        for (const sharedEvent of normalized) input.onEvent(sharedEvent);
      },
    });

    this.bindingHandle = bindingHandle;
    this.handle = {
      stop: async () => {
        if (this.handle) this.handle = undefined;
        const current = this.bindingHandle;
        this.bindingHandle = undefined;
        await current?.stop();
      },
    };
    return this.handle;
  }

  async interrupt(): Promise<void> {
    await this.bindingHandle?.interrupt();
  }

  async detach(): Promise<void> {
    await this.bindingHandle?.stop();
    this.bindingHandle = undefined;
    this.handle = undefined;
  }
}

function normalizeClaudeSdkEvent(event: ClaudeSdkEvent): AgentEvent[] {
  if (event.type === "session") {
    return [{ type: "session", sessionId: event.sessionId }];
  }
  if (event.type === "delta") {
    return [{ type: "delta", content: event.content }];
  }
  if (event.type === "completed") {
    return event.content ? [{ type: "completed", content: event.content }] : [{ type: "completed" }];
  }
  return [{ type: "error", error: event.error }];
}
