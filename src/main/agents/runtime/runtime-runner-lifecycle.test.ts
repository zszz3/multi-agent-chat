import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import { HermesRunner } from "../hermes/hermes-runner";
import { OpenClawRunner } from "../openclaw/openclaw-runner";
import { OpenCodeRunner } from "../opencode/opencode-runner";
import type { PlatformProcessServices } from "../../platform/platform-services";
import type { ProcessTreeTerminationRequest } from "../../platform/process-tree";

interface StoppableRunner {
  stop(): Promise<void>;
}

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as EventEmitter & { pid: number; killed: boolean };
  child.pid = 42;
  child.killed = false;
  return child as unknown as ChildProcess;
}

function processServices(): {
  services: PlatformProcessServices;
  terminate: ReturnType<typeof vi.fn>;
} {
  const terminate = vi.fn(async (request: ProcessTreeTerminationRequest) => ({
    reason: request.reason,
    stage: "terminated" as const,
    protocolCancellation: "not-requested" as const,
  }));
  return {
    services: {
      processLauncher: {
        spawn: () => {
          throw new Error("spawn is not used by the stop contract test");
        },
        exec: vi.fn(async () => ({ stdout: "", stderr: "" })),
      },
      processTreeController: { terminate },
    },
    terminate,
  };
}

const runnerFactories: Array<{
  name: string;
  create: (services: PlatformProcessServices) => StoppableRunner;
}> = [
  {
    name: "Hermes",
    create: (services) => new HermesRunner({
      executable: "hermes",
      cwd: "/workspace",
      prompt: "hello",
      processServices: services,
      onEvent: vi.fn(),
      onExit: vi.fn(),
    }),
  },
  {
    name: "OpenCode",
    create: (services) => new OpenCodeRunner({
      executable: "opencode",
      cwd: "/workspace",
      prompt: "hello",
      processServices: services,
      onEvent: vi.fn(),
      onExit: vi.fn(),
    }),
  },
  {
    name: "OpenClaw",
    create: (services) => new OpenClawRunner({
      executable: "openclaw",
      cwd: "/workspace",
      prompt: "hello",
      sessionKey: "session-test",
      processServices: services,
      onEvent: vi.fn(),
      onExit: vi.fn(),
    }),
  },
];

describe("one-shot Runtime process lifecycle", () => {
  test.each(runnerFactories)("routes $name stop through the shared process tree", async ({ create }) => {
    const lifecycle = processServices();
    const runner = create(lifecycle.services);
    const child = fakeChild();
    (runner as unknown as { proc: ChildProcess }).proc = child;

    await runner.stop();

    expect(lifecycle.terminate).toHaveBeenCalledWith({
      process: child,
      reason: "user-cancel",
    });
  });
});
