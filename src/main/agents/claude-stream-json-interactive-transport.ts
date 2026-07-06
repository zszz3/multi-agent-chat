import type { AgentEvent } from "../../shared/types";
import type {
  ClaudeInteractiveTransport,
  ClaudeInteractiveTransportHandle,
  ClaudeInteractiveTurnInput,
} from "./claude-interactive-transport";
import {
  loadClaudeStreamJsonBindings,
  type ClaudeStreamJsonBindings,
  type ClaudeStreamJsonBindingTurnHandle,
} from "./claude-stream-json-bindings";
import { normalizeClaudeStreamJsonEvent } from "./claude-stream-json-events";

interface ClaudeStreamJsonInteractiveTransportOptions {
  executable: string;
  streamJsonModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
  loadBindings?: (options?: { executable?: string }) => Promise<ClaudeStreamJsonBindings>;
}

export class ClaudeStreamJsonInteractiveTransport implements ClaudeInteractiveTransport {
  readonly kind = "stream-json" as const;
  private handle: ClaudeInteractiveTransportHandle | undefined;
  private bindingHandle: ClaudeStreamJsonBindingTurnHandle | undefined;

  constructor(private readonly options: ClaudeStreamJsonInteractiveTransportOptions) {}

  async startTurn(input: ClaudeInteractiveTurnInput): Promise<ClaudeInteractiveTransportHandle> {
    const bindings = await (this.options.loadBindings ?? loadClaudeStreamJsonBindings)({
      executable: this.options.executable,
    });
    const bindingHandle = await bindings.startTurn({
      prompt: input.prompt,
      cwd: input.cwd,
      model: this.options.streamJsonModelForTurn(input.modelId),
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
            ...(input.resumeState.appContext?.claudeConfigDir !== undefined
              ? { claudeConfigDir: input.resumeState.appContext.claudeConfigDir }
              : {}),
            ...(input.resumeState.appContext?.sessionStoreRef !== undefined
              ? { sessionStoreRef: input.resumeState.appContext.sessionStoreRef }
              : {}),
          }
        : {}),
      onStreamJsonEvent: (event) => {
        const normalized = normalizeClaudeStreamJsonEvent(event);
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
