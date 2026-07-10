import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { describe, expect, test, vi } from "vitest";
import {
  createPosixProcessTreeController,
  createWindowsProcessTreeController,
  ProcessTreeTerminationError,
} from "./process-tree";

interface FakeChild {
  process: ChildProcess;
  exit(): void;
  streams: PassThrough[];
}

function fakeChild(pid: number | undefined): FakeChild {
  const emitter = new EventEmitter() as EventEmitter & {
    pid?: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const streams = [stdin, stdout, stderr];
  if (pid !== undefined) emitter.pid = pid;
  emitter.exitCode = null;
  emitter.signalCode = null;
  emitter.stdin = stdin;
  emitter.stdout = stdout;
  emitter.stderr = stderr;

  return {
    process: emitter as unknown as ChildProcess,
    streams,
    exit() {
      emitter.exitCode = 0;
      emitter.emit("exit", 0, null);
    },
  };
}

const shortTimings = {
  protocolGraceMs: 2,
  terminateGraceMs: 2,
  forceGraceMs: 2,
};

describe("Windows process tree controller", () => {
  test("lets protocol cancellation exit before invoking taskkill", async () => {
    const child = fakeChild(42);
    const execute = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const controller = createWindowsProcessTreeController(execute, { timings: shortTimings });

    await expect(controller.terminate({
      process: child.process,
      reason: "user-cancel",
      requestProtocolCancellation: () => child.exit(),
    })).resolves.toEqual({
      reason: "user-cancel",
      stage: "protocol",
      protocolCancellation: "completed",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(child.streams.every((stream) => stream.destroyed)).toBe(true);
  });

  test("uses taskkill tree mode and escalates to force exactly once", async () => {
    const child = fakeChild(42);
    const execute = vi.fn(async (request: { args?: string[] }) => {
      if (request.args?.includes("/F")) child.exit();
      return { stdout: "", stderr: "" };
    });
    const controller = createWindowsProcessTreeController(execute, { timings: shortTimings });
    const request = { process: child.process, reason: "timeout" as const };

    const first = controller.terminate(request);
    const second = controller.terminate(request);
    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ stage: "forced", reason: "timeout" });
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      executable: "taskkill.exe",
      args: ["/PID", "42", "/T"],
    }));
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      executable: "taskkill.exe",
      args: ["/PID", "42", "/T", "/F"],
    }));
  });

  test("classifies force termination failures", async () => {
    const child = fakeChild(42);
    const execute = vi.fn(async (request: { args?: string[] }) => {
      if (request.args?.includes("/F")) throw new Error("access denied");
      return { stdout: "", stderr: "" };
    });
    const controller = createWindowsProcessTreeController(execute, { timings: shortTimings });

    const error = await controller.terminate({
      process: child.process,
      reason: "app-shutdown",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProcessTreeTerminationError);
    expect(error).toMatchObject({ code: "force-failed", reason: "app-shutdown" });
  });
});

describe("POSIX process tree controller", () => {
  test("discovers descendants and terminates deepest children before the parent", async () => {
    const child = fakeChild(100);
    const execute = vi.fn(async () => ({
      stdout: "100 1\n101 100\n102 101\n103 100\n",
      stderr: "",
    }));
    const calls: Array<[number, NodeJS.Signals]> = [];
    const killProcess = vi.fn((pid: number, signal: NodeJS.Signals) => {
      calls.push([pid, signal]);
      if (pid === 100) child.exit();
    });
    const controller = createPosixProcessTreeController(execute, { timings: shortTimings, killProcess });

    await expect(controller.terminate({
      process: child.process,
      reason: "user-cancel",
    })).resolves.toMatchObject({ stage: "terminated" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      executable: "ps",
      args: ["-eo", "pid=,ppid="],
    }));
    expect(calls).toEqual([
      [102, "SIGTERM"],
      [101, "SIGTERM"],
      [103, "SIGTERM"],
      [100, "SIGTERM"],
    ]);
  });

  test("rejects a running child without a valid PID", async () => {
    const child = fakeChild(undefined);
    const controller = createPosixProcessTreeController(
      vi.fn(async () => ({ stdout: "", stderr: "" })),
      { timings: shortTimings, killProcess: vi.fn() },
    );

    await expect(controller.terminate({
      process: child.process,
      reason: "timeout",
    })).rejects.toMatchObject({ code: "missing-pid", reason: "timeout" });
  });
});
