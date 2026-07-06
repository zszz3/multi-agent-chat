import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { createClaudeStreamState, normalizeClaudeStreamEvent } from "./claude-stream";
import { spawnCli } from "../cli-launcher";

export type ClaudeSdkEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; content: string }
  | { type: "completed"; content?: string }
  | { type: "error"; error: string }
  | { type: "approval_request"; requestId: string; prompt: string; toolName?: string }
  | { type: "approval_response"; requestId: string; decision: "approved" | "rejected"; reason?: string }
  | { type: "user_input_request"; requestId: string; prompt: string }
  | { type: "user_input_response"; requestId: string; content: string };

export interface ClaudeSdkBindingTurnHandle {
  interrupt(): Promise<void>;
  stop(): Promise<void>;
}

export interface ClaudeSdkBindingTurnInput {
  prompt: string;
  cwd: string;
  model: string | undefined;
  env: NodeJS.ProcessEnv;
  resume?: {
    sessionId: string;
    projectKey?: string;
    subpaths?: string[];
  };
  claudeConfigDir?: string;
  sessionStoreRef?: string;
  onSdkEvent: (event: ClaudeSdkEvent) => void;
}

export interface ClaudeSdkBindings {
  startTurn(input: ClaudeSdkBindingTurnInput): Promise<ClaudeSdkBindingTurnHandle>;
}

interface LoadClaudeSdkBindingsOptions {
  executable?: string;
}

export async function loadClaudeSdkBindings(
  options: LoadClaudeSdkBindingsOptions = {},
): Promise<ClaudeSdkBindings> {
  const executable = options.executable?.trim() || "claude";

  return {
    async startTurn(input) {
      const args = [
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-mode",
        "bypassPermissions",
      ];
      if (input.model) {
        args.push("--model", input.model);
      }
      if (input.resume?.sessionId) {
        args.push("--resume", input.resume.sessionId);
      }
      args.push(input.prompt);

      const env = {
        ...input.env,
        ...(input.claudeConfigDir ? { CLAUDE_CONFIG_DIR: input.claudeConfigDir } : {}),
      };

      const proc = spawnCli({
        executable,
        args,
        cwd: input.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!proc.stdout || !proc.stderr) {
        throw new Error("Claude SDK binding failed to create stdout/stderr pipes");
      }

      const state = createClaudeStreamState();
      const rl = createInterface({ input: proc.stdout });
      bindClaudeSdkProcess(proc, proc.stderr, rl, state, input.onSdkEvent);

      return {
        interrupt: async () => {
          proc.kill("SIGINT");
        },
        stop: async () => {
          proc.kill("SIGTERM");
        },
      };
    },
  };
}

function bindClaudeSdkProcess(
  proc: ChildProcess,
  stderr: NodeJS.ReadableStream,
  rl: ReturnType<typeof createInterface>,
  state: ReturnType<typeof createClaudeStreamState>,
  onSdkEvent: (event: ClaudeSdkEvent) => void,
): void {
  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const raw = JSON.parse(line) as unknown;
      const structured = fromRawClaudeSdkEvent(raw);
      if (structured) {
        onSdkEvent(structured);
        return;
      }
      for (const event of normalizeClaudeStreamEvent(raw, state)) {
        const normalized = toClaudeSdkEvent(event);
        if (normalized) onSdkEvent(normalized);
      }
    } catch {
      // Ignore non-JSON noise from the CLI wrapper.
    }
  });

  stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      onSdkEvent({ type: "error", error: text });
    }
  });

  proc.on("error", (error) => {
    onSdkEvent({ type: "error", error: error.message });
    rl.close();
  });

  proc.on("exit", () => {
    rl.close();
  });
}

function toClaudeSdkEvent(
  event: ReturnType<typeof normalizeClaudeStreamEvent>[number],
): ClaudeSdkEvent | undefined {
  if (event.type === "session") {
    return { type: "session", sessionId: event.sessionId };
  }
  if (event.type === "delta") {
    return { type: "delta", content: event.content };
  }
  if (event.type === "completed") {
    return event.content ? { type: "completed", content: event.content } : { type: "completed" };
  }
  if (event.type === "error") {
    return { type: "error", error: event.error };
  }
  return undefined;
}

function fromRawClaudeSdkEvent(raw: unknown): ClaudeSdkEvent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  if (record.type === "approval_request" && typeof record.requestId === "string" && typeof record.prompt === "string") {
    return {
      type: "approval_request",
      requestId: record.requestId,
      prompt: record.prompt,
      ...(typeof record.toolName === "string" ? { toolName: record.toolName } : {}),
    };
  }
  if (
    record.type === "approval_response" &&
    typeof record.requestId === "string" &&
    (record.decision === "approved" || record.decision === "rejected")
  ) {
    return {
      type: "approval_response",
      requestId: record.requestId,
      decision: record.decision,
      ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    };
  }
  if (record.type === "user_input_request" && typeof record.requestId === "string" && typeof record.prompt === "string") {
    return {
      type: "user_input_request",
      requestId: record.requestId,
      prompt: record.prompt,
    };
  }
  if (record.type === "user_input_response" && typeof record.requestId === "string" && typeof record.content === "string") {
    return {
      type: "user_input_response",
      requestId: record.requestId,
      content: record.content,
    };
  }
  return undefined;
}
