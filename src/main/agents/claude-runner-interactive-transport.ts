import { ClaudeRunner } from "./claude-runner";
import type {
  ClaudeInteractiveTransport,
  ClaudeInteractiveTransportHandle,
  ClaudeInteractiveTurnInput,
} from "./claude-interactive-transport";

interface ClaudeRunnerInteractiveTransportOptions {
  executable: string;
  cliModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
}

export class ClaudeRunnerInteractiveTransport implements ClaudeInteractiveTransport {
  readonly kind = "runner" as const;
  private runner: ClaudeRunner | undefined;

  constructor(private readonly options: ClaudeRunnerInteractiveTransportOptions) {}

  async startTurn(input: ClaudeInteractiveTurnInput): Promise<ClaudeInteractiveTransportHandle> {
    const runner = new ClaudeRunner({
      executable: this.options.executable,
      cwd: input.cwd,
      env: this.options.envForTurn(input.modelId),
      prompt: input.prompt,
      modelId: this.options.cliModelForTurn(input.modelId),
      sessionId: input.resumeState?.native.sessionId,
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
