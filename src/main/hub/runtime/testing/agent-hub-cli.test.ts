import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import type { ProcessTreeTerminationRequest } from "../../../platform/process-tree";
import { runStreamingCommand } from "./agent-hub-cli";

function fakeStreamingProcess(): ChildProcess {
  const process = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  process.pid = 42;
  process.killed = false;
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  return process as unknown as ChildProcess;
}

describe("runStreamingCommand", () => {
  test("routes timeout cleanup through injected process services", async () => {
    const child = fakeStreamingProcess();
    const spawn = vi.fn(() => child);
    const terminate = vi.fn(async (request: ProcessTreeTerminationRequest) => {
      request.process.emit("close", null, "SIGTERM");
      return {
        reason: request.reason,
        stage: "terminated" as const,
        protocolCancellation: "not-requested" as const,
      };
    });

    await expect(runStreamingCommand({
      executable: "codex",
      args: ["--version"],
      cwd: "/workspace",
      env: {},
      timeoutMs: 1,
      processServices: {
        processLauncher: {
          spawn,
          exec: vi.fn(async () => ({ stdout: "", stderr: "" })),
        },
        processTreeController: { terminate },
      },
      onStdoutLine: vi.fn(),
      onStderr: vi.fn(),
    })).resolves.toMatchObject({ timedOut: true, signal: "SIGTERM" });
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ executable: "codex" }));
    expect(terminate).toHaveBeenCalledWith(expect.objectContaining({ reason: "timeout" }));
  });
});
