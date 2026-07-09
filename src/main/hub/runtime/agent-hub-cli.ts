import { rm } from "node:fs/promises";
import { execCli, spawnCli } from "../../platform/cli-launcher";
import { deleteCodexSessionFiles } from "./agent-executor-session-cleanup";

export type AgentTestStreamEmit = (event: {
  type: "assistant" | "tool" | "warning" | "error" | "assistant_delta";
  content: string;
}) => void;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isCodexWarningMessage(message: string): boolean {
  return /skill descriptions were shortened/i.test(message) || /context budget/i.test(message);
}

export function handleCodexTestLine(line: string, emit: AgentTestStreamEmit): string {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      item?: { type?: string; text?: unknown; message?: unknown; command?: unknown };
      text?: unknown;
      message?: unknown;
      delta?: unknown;
    };
    if (event.type === "item.completed") {
      if (event.item?.type === "agent_message" && typeof event.item.text === "string") {
        emit({ type: "assistant", content: event.item.text });
        return event.item.text;
      }
      if (event.item?.type === "command_execution") {
        const command = typeof event.item.command === "string" ? event.item.command : JSON.stringify(event.item);
        emit({ type: "tool", content: command });
      }
      if (event.item?.type === "error") {
        const message = typeof event.item.message === "string" ? event.item.message : JSON.stringify(event.item);
        emit({ type: isCodexWarningMessage(message) ? "warning" : "error", content: message });
      }
    }
    if (event.type === "agent_message" && typeof event.text === "string") {
      emit({ type: "assistant", content: event.text });
      return event.text;
    }
    if (typeof event.delta === "string") {
      emit({ type: "assistant_delta", content: event.delta });
      return event.delta;
    }
    if (typeof event.message === "string") {
      emit({ type: "assistant", content: event.message });
      return event.message;
    }
  } catch {
    // Ignore non-JSON noise.
  }
  return "";
}

export function extractCodexSessionId(line: string): string | undefined {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    const candidates = [
      raw.session_id,
      raw.sessionId,
      raw.thread_id,
      raw.threadId,
      raw.id,
      asRecord(raw.thread)?.id,
      asRecord(raw.session)?.id,
    ];
    return candidates.find((candidate): candidate is string => typeof candidate === "string" && /^[0-9a-f-]{36}$/i.test(candidate));
  } catch {
    return undefined;
  }
}

export async function deleteCodexTestSessions(executable: string, home: string, sessionIds: Iterable<string>): Promise<number> {
  let deleted = 0;
  for (const sessionId of sessionIds) {
    try {
      await execCli({
        executable,
        args: ["archive", sessionId],
        cwd: process.cwd(),
        env: process.env,
        timeout: 10_000,
        windowsHide: true,
        maxBuffer: 1024 * 64,
      });
    } catch {
      // Ignore archive failures; the local file deletion below is what matters.
    }
    try {
      deleted += await deleteCodexSessionFiles(home, sessionId);
    } catch {
      // Best-effort cleanup only; test result should not depend on local history deletion.
    }
  }
  return deleted;
}

export async function runStreamingCommand(input: {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  onStdoutLine: (line: string) => void;
  onStderr: (text: string) => void;
}): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const proc = spawnCli({
      executable: input.executable,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, input.timeoutMs);

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) input.onStdoutLine(line);
        newline = stdoutBuffer.indexOf("\n");
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const trimmed = text.trim();
      if (trimmed) input.onStderr(trimmed);
    });

    proc.on("error", (error) => settle(() => reject(error)));
    proc.on("close", (code, signal) => {
      if (stdoutBuffer.trim()) input.onStdoutLine(stdoutBuffer.trim());
      settle(() => resolve({ code, signal, stdout, stderr, timedOut }));
    });
  });
}

export function sanitizeTestError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 1200);
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
