import type { ChildProcess } from "node:child_process";
import type { ExecCli } from "./cli-launcher";

export type ProcessTerminationReason = "user-cancel" | "timeout" | "app-shutdown";
export type ProtocolCancellationStatus = "not-requested" | "completed" | "failed" | "timed-out";
export type ProcessTreeTerminationStage = "already-exited" | "protocol" | "terminated" | "forced";
export type ProcessTreeTerminationErrorCode = "missing-pid" | "force-failed";

export interface ProcessTreeTerminationRequest {
  process: ChildProcess;
  reason: ProcessTerminationReason;
  requestProtocolCancellation?: () => Promise<void> | void;
}

export interface ProcessTreeTerminationResult {
  reason: ProcessTerminationReason;
  stage: ProcessTreeTerminationStage;
  protocolCancellation: ProtocolCancellationStatus;
}

export interface ProcessTreeController {
  terminate(request: ProcessTreeTerminationRequest): Promise<ProcessTreeTerminationResult>;
}

export class ProcessTreeTerminationError extends Error {
  constructor(
    readonly code: ProcessTreeTerminationErrorCode,
    readonly reason: ProcessTerminationReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProcessTreeTerminationError";
  }
}

interface ProcessTreeTimings {
  protocolGraceMs: number;
  terminateGraceMs: number;
  forceGraceMs: number;
}

interface ProcessTreeControllerOptions {
  timings?: Partial<ProcessTreeTimings>;
  killProcess?: (pid: number, signal: NodeJS.Signals) => void;
  now?: () => number;
}

type TerminateTree = (pid: number, force: boolean) => Promise<void>;

const DEFAULT_TIMINGS: ProcessTreeTimings = {
  protocolGraceMs: 1_500,
  terminateGraceMs: 1_500,
  forceGraceMs: 1_000,
};

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function closeProcessStreams(child: ChildProcess): void {
  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true);
  if (timeoutMs <= 0) return Promise.resolve(false);

  return new Promise((resolve) => {
    const finish = (exited: boolean): void => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = (): void => finish(true);
    const timer = setTimeout(() => finish(hasExited(child)), timeoutMs);
    child.once("exit", onExit);
  });
}

async function requestProtocolCancellation(
  cancellation: ProcessTreeTerminationRequest["requestProtocolCancellation"],
  timeoutMs: number,
): Promise<ProtocolCancellationStatus> {
  if (!cancellation) return "not-requested";

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProtocolCancellationStatus>((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), timeoutMs);
  });
  const completion = Promise.resolve()
    .then(cancellation)
    .then<ProtocolCancellationStatus>(() => "completed")
    .catch<ProtocolCancellationStatus>(() => "failed");
  const status = await Promise.race([completion, timeout]);
  if (timer) clearTimeout(timer);
  return status;
}

function createStagedProcessTreeController(
  terminateTree: TerminateTree,
  options: ProcessTreeControllerOptions = {},
): ProcessTreeController {
  const timings = { ...DEFAULT_TIMINGS, ...options.timings };
  const now = options.now ?? Date.now;
  const inFlight = new WeakMap<ChildProcess, Promise<ProcessTreeTerminationResult>>();

  const terminateOnce = async (
    request: ProcessTreeTerminationRequest,
  ): Promise<ProcessTreeTerminationResult> => {
    const child = request.process;
    let protocolCancellation: ProtocolCancellationStatus = "not-requested";
    try {
      if (hasExited(child)) {
        return { reason: request.reason, stage: "already-exited", protocolCancellation };
      }
      const pid = child.pid;
      if (!Number.isSafeInteger(pid) || !pid || pid <= 0) {
        throw new ProcessTreeTerminationError(
          "missing-pid",
          request.reason,
          "Cannot terminate a running process tree without a valid PID.",
        );
      }

      const protocolStartedAt = now();
      protocolCancellation = await requestProtocolCancellation(
        request.requestProtocolCancellation,
        timings.protocolGraceMs,
      );
      const protocolWaitRemaining = Math.max(0, timings.protocolGraceMs - (now() - protocolStartedAt));
      if (await waitForExit(child, protocolWaitRemaining)) {
        return { reason: request.reason, stage: "protocol", protocolCancellation };
      }

      try {
        await terminateTree(pid, false);
      } catch {
        // A graceful OS-level failure still proceeds to the force stage.
      }
      if (await waitForExit(child, timings.terminateGraceMs)) {
        return { reason: request.reason, stage: "terminated", protocolCancellation };
      }

      try {
        await terminateTree(pid, true);
      } catch (error) {
        throw new ProcessTreeTerminationError(
          "force-failed",
          request.reason,
          `Failed to force terminate process tree ${pid}.`,
          { cause: error },
        );
      }
      if (await waitForExit(child, timings.forceGraceMs)) {
        return { reason: request.reason, stage: "forced", protocolCancellation };
      }
      throw new ProcessTreeTerminationError(
        "force-failed",
        request.reason,
        `Process tree ${pid} remained alive after forced termination.`,
      );
    } finally {
      closeProcessStreams(child);
    }
  };

  return {
    terminate(request) {
      const existing = inFlight.get(request.process);
      if (existing) return existing;
      const operation = terminateOnce(request).finally(() => inFlight.delete(request.process));
      inFlight.set(request.process, operation);
      return operation;
    },
  };
}

export function createWindowsProcessTreeController(
  execute: ExecCli,
  options: ProcessTreeControllerOptions = {},
): ProcessTreeController {
  return createStagedProcessTreeController(async (pid, force) => {
    await execute({
      executable: "taskkill.exe",
      args: ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])],
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 1024 * 16,
    });
  }, options);
}

interface ProcessRelationship {
  pid: number;
  parentPid: number;
}

function parseProcessRelationships(stdout: string): ProcessRelationship[] {
  const relationships: ProcessRelationship[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    if (Number.isSafeInteger(pid) && Number.isSafeInteger(parentPid)) {
      relationships.push({ pid, parentPid });
    }
  }
  return relationships;
}

function descendantsDeepestFirst(rootPid: number, relationships: ProcessRelationship[]): number[] {
  const children = new Map<number, number[]>();
  for (const relationship of relationships) {
    const siblings = children.get(relationship.parentPid) ?? [];
    siblings.push(relationship.pid);
    children.set(relationship.parentPid, siblings);
  }

  const descendants: number[] = [];
  const visited = new Set<number>([rootPid]);
  const visit = (parentPid: number): void => {
    for (const childPid of children.get(parentPid) ?? []) {
      if (visited.has(childPid)) continue;
      visited.add(childPid);
      visit(childPid);
      descendants.push(childPid);
    }
  };
  visit(rootPid);
  return descendants;
}

function isMissingProcessError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH";
}

export function createPosixProcessTreeController(
  execute: ExecCli,
  options: ProcessTreeControllerOptions = {},
): ProcessTreeController {
  const killProcess = options.killProcess ?? process.kill.bind(process);
  return createStagedProcessTreeController(async (pid, force) => {
    const { stdout } = await execute({
      executable: "ps",
      args: ["-eo", "pid=,ppid="],
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
    const descendants = descendantsDeepestFirst(pid, parseProcessRelationships(stdout));
    const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";
    let firstError: unknown;
    for (const processId of [...descendants, pid]) {
      try {
        killProcess(processId, signal);
      } catch (error) {
        if (!isMissingProcessError(error) && firstError === undefined) firstError = error;
      }
    }
    if (firstError !== undefined) throw firstError;
  }, options);
}
