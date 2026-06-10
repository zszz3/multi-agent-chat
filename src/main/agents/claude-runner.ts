import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { createClaudeStreamState, normalizeClaudeStreamEvent } from "./claude-stream";
import type { AgentEvent } from "../../shared/types";

export interface ClaudeRunOptions {
  executable: string;
  cwd: string;
  env?: Record<string, string>;
  prompt: string;
  modelId: string | undefined;
  sessionId: string | undefined;
  onEvent: (event: AgentEvent) => void;
  onStderr?: (text: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export class ClaudeRunner {
  private proc: ChildProcess | null = null;

  constructor(private readonly options: ClaudeRunOptions) {}

  async start(): Promise<void> {
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--permission-mode",
      "bypassPermissions",
      "--cd",
      this.options.cwd,
    ];
    if (this.options.modelId) {
      args.push("--model", this.options.modelId);
    }
    if (this.options.sessionId) {
      args.push("--resume", this.options.sessionId);
    }
    args.push(this.options.prompt);

    const proc = spawn(this.options.executable, args, {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = proc;

    if (!proc.stdout || !proc.stderr) {
      throw new Error("Claude runner failed to create stdout/stderr pipes");
    }

    proc.stderr.on("data", (chunk: Buffer) => {
      this.options.onStderr?.(chunk.toString());
    });

    const streamState = createClaudeStreamState();
    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const raw = JSON.parse(line) as unknown;
        for (const event of normalizeClaudeStreamEvent(raw, streamState)) this.options.onEvent(event);
      } catch {
        // Ignore non-JSON noise.
      }
    });

    proc.on("exit", (code, signal) => {
      rl.close();
      this.options.onExit?.(code, signal);
    });

    proc.on("error", (error) => {
      this.options.onEvent({ type: "error", error: error.message });
      rl.close();
      this.options.onExit?.(null, null);
    });
  }

  async stop(): Promise<void> {
    this.proc?.kill("SIGTERM");
    this.proc = null;
  }
}
