import type { AgentEvent } from "../../shared/types";
import { ClaudeRunner } from "./claude-runner";

export interface ClaudeInteractiveTransportHandle {
  stop(): Promise<void>;
}

export interface ClaudeInteractiveTransport {
  startTurn(input: {
    prompt: string;
    sessionId: string | undefined;
    modelId: string | undefined;
    cwd: string;
    onEvent: (event: AgentEvent) => void;
  }): Promise<ClaudeInteractiveTransportHandle>;
  interrupt(): Promise<void>;
  detach(): Promise<void>;
}

interface ClaudeCliInteractiveTransportOptions {
  executable: string;
  cliModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
}

export class ClaudeCliInteractiveTransport implements ClaudeInteractiveTransport {
  private runner: ClaudeRunner | undefined;

  constructor(private readonly options: ClaudeCliInteractiveTransportOptions) {}

  async startTurn(input: {
    prompt: string;
    sessionId: string | undefined;
    modelId: string | undefined;
    cwd: string;
    onEvent: (event: AgentEvent) => void;
  }): Promise<ClaudeInteractiveTransportHandle> {
    const runner = new ClaudeRunner({
      executable: this.options.executable,
      cwd: input.cwd,
      env: this.options.envForTurn(input.modelId),
      prompt: input.prompt,
      modelId: this.options.cliModelForTurn(input.modelId),
      sessionId: input.sessionId,
      onEvent: input.onEvent,
      onExit: () => {
        if (this.runner === runner) this.runner = undefined;
      },
    });
    this.runner = runner;
    await runner.start();
    return {
      stop: async () => {
        if (this.runner === runner) this.runner = undefined;
        await runner.stop();
      },
    };
  }

  async interrupt(): Promise<void> {
    await this.runner?.interrupt();
  }

  async detach(): Promise<void> {
    const runner = this.runner;
    this.runner = undefined;
    await runner?.stop();
  }
}
