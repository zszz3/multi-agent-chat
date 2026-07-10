import { stat } from "node:fs/promises";
import type {
  ChildProcess,
  ExecFileOptionsWithStringEncoding,
  SpawnOptions,
} from "node:child_process";
import crossSpawn from "cross-spawn";

const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;

export type CrossSpawnAdapter = (
  executable: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface CliPlatformOptions {
  platform?: NodeJS.Platform;
  spawnAdapter?: CrossSpawnAdapter;
}

export type CliSpawnRequest = Omit<SpawnOptions, "shell" | "windowsVerbatimArguments"> & {
  executable: string;
  args?: string[];
};

export type CliExecRequest = Omit<
  ExecFileOptionsWithStringEncoding,
  "encoding" | "shell" | "windowsVerbatimArguments"
> & {
  executable: string;
  args?: string[];
};

export type CliExecutionFailure =
  | "not-found"
  | "access-denied"
  | "invalid-cwd"
  | "timeout"
  | "aborted"
  | "max-buffer"
  | "command-failed"
  | "spawn-failed";

export class CliExecutionError extends Error {
  constructor(
    readonly failure: CliExecutionFailure,
    readonly executable: string,
    message: string,
    readonly details: {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      stdout?: string;
      stderr?: string;
    } = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CliExecutionError";
  }
}

export type ExecCli = (request: CliExecRequest) => Promise<{ stdout: string; stderr: string }>;
export type SpawnCli = (request: CliSpawnRequest) => ChildProcess;

export interface ProcessLauncher {
  spawn: SpawnCli;
  exec: ExecCli;
}

function executableLabel(executable: string): string {
  return executable.split(/[\\/]/).filter(Boolean).pop() ?? "executable";
}

function spawnFailure(error: unknown): CliExecutionFailure {
  if (typeof error === "object" && error !== null) {
    const code = "code" in error ? error.code : undefined;
    if (code === "ENOENT") return "not-found";
    if (code === "EACCES" || code === "EPERM") return "access-denied";
    if ("name" in error && error.name === "AbortError") return "aborted";
  }
  return "spawn-failed";
}

async function assertValidCwd(executable: string, cwd: CliExecRequest["cwd"]): Promise<void> {
  if (!cwd) return;
  try {
    const info = await stat(cwd);
    if (info.isDirectory()) return;
  } catch (error) {
    throw new CliExecutionError(
      "invalid-cwd",
      executable,
      `Cannot run ${executableLabel(executable)} because its working directory is unavailable.`,
      {},
      { cause: error },
    );
  }
  throw new CliExecutionError(
    "invalid-cwd",
    executable,
    `Cannot run ${executableLabel(executable)} because its working directory is not a directory.`,
  );
}

export function spawnCli(
  request: CliSpawnRequest,
  platformOptions: CliPlatformOptions = {},
): ChildProcess {
  const unsafeRequest = request as CliSpawnRequest & {
    shell?: unknown;
    windowsVerbatimArguments?: unknown;
  };
  if (unsafeRequest.shell || unsafeRequest.windowsVerbatimArguments) {
    throw new CliExecutionError(
      "spawn-failed",
      request.executable,
      "Raw shell execution and caller-supplied Windows command strings are not supported.",
    );
  }
  const { executable, args = [], ...options } = request;
  const platform = platformOptions.platform ?? process.platform;
  const spawnAdapter = platformOptions.spawnAdapter ?? crossSpawn;
  return spawnAdapter(executable, args, {
    ...options,
    windowsHide: options.windowsHide ?? platform === "win32",
  });
}

function bufferedText(chunks: Buffer[], maxBuffer: number): string {
  return Buffer.concat(chunks).subarray(0, maxBuffer).toString("utf8");
}

export async function execCli(
  request: CliExecRequest,
  platformOptions: CliPlatformOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const {
    executable,
    args = [],
    timeout = 0,
    maxBuffer = DEFAULT_MAX_BUFFER_BYTES,
    killSignal = "SIGTERM",
    ...options
  } = request;
  if (!Number.isFinite(maxBuffer) || maxBuffer <= 0) {
    throw new CliExecutionError(
      "max-buffer",
      executable,
      "CLI output limit must be a positive finite number.",
    );
  }
  await assertValidCwd(executable, options.cwd);

  return await new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnCli({
        ...options,
        executable,
        args,
        stdio: ["ignore", "pipe", "pipe"],
      }, platformOptions);
    } catch (error) {
      const failure = error instanceof CliExecutionError ? error.failure : spawnFailure(error);
      reject(error instanceof CliExecutionError
        ? error
        : new CliExecutionError(
          failure,
          executable,
          `Failed to start ${executableLabel(executable)} (${failure}).`,
          {},
          { cause: error },
        ));
      return;
    }
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const output = (): { stdout: string; stderr: string } => ({
      stdout: bufferedText(stdoutChunks, maxBuffer),
      stderr: bufferedText(stderrChunks, maxBuffer),
    });
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback();
    };
    const rejectForBuffer = (): void => {
      child.kill(killSignal);
      const result = output();
      settle(() => reject(new CliExecutionError(
        "max-buffer",
        executable,
        `${executableLabel(executable)} exceeded the ${maxBuffer}-byte output limit.`,
        result,
      )));
    };
    const collect = (target: Buffer[], chunk: Buffer | string, stream: "stdout" | "stderr"): void => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      target.push(buffer);
      if (stream === "stdout") stdoutBytes += buffer.byteLength;
      else stderrBytes += buffer.byteLength;
      if (stdoutBytes > maxBuffer || stderrBytes > maxBuffer) rejectForBuffer();
    };

    child.stdout?.on("data", (chunk: Buffer | string) => collect(stdoutChunks, chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer | string) => collect(stderrChunks, chunk, "stderr"));
    child.once("error", (error) => {
      const failure = spawnFailure(error);
      settle(() => reject(new CliExecutionError(
        failure,
        executable,
        `Failed to start ${executableLabel(executable)} (${failure}).`,
        output(),
        { cause: error },
      )));
    });
    child.once("close", (code, signal) => {
      const result = output();
      if (code === 0) {
        settle(() => resolve(result));
        return;
      }
      settle(() => reject(new CliExecutionError(
        "command-failed",
        executable,
        `${executableLabel(executable)} exited with ${code ?? signal ?? "unknown"}.`,
        { ...result, exitCode: code, signal },
      )));
    });
    if (timeout > 0) {
      timer = setTimeout(() => {
        child.kill(killSignal);
        settle(() => reject(new CliExecutionError(
          "timeout",
          executable,
          `${executableLabel(executable)} timed out after ${timeout}ms.`,
          output(),
        )));
      }, timeout);
    }
  });
}

export function createProcessLauncher(platformOptions: CliPlatformOptions): ProcessLauncher {
  return {
    spawn: (request) => spawnCli(request, platformOptions),
    exec: (request) => execCli(request, platformOptions),
  };
}
