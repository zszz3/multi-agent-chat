import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import {
  CliExecutionError,
  execCli,
  spawnCli,
  type CrossSpawnAdapter,
} from "./cli-launcher";

interface FakeChild {
  child: ChildProcess;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return {
    child: child as unknown as ChildProcess,
    stdout: child.stdout,
    stderr: child.stderr,
    kill: child.kill,
  };
}

const specialArguments = [
  "space value",
  "trailing\\",
  'quote"inside',
  "%PATH%",
  "!bang!",
  "^caret",
  "a&b",
  "a|b",
  "<input>",
  "(group)",
  "中文参数",
];

describe("spawnCli", () => {
  test.each([
    "C:\\tools\\agent.exe",
    "C:\\Users\\Demo User\\AppData\\Roaming\\npm\\agent.cmd",
    "C:\\tools\\agent.bat",
    "agent",
  ])("delegates %s and its argument array unchanged to cross-spawn", (executable) => {
    const process = fakeChild();
    const spawnAdapter = vi.fn((_command: string, _args: readonly string[], _options: SpawnOptions) => process.child);

    const child = spawnCli({ executable, args: specialArguments, cwd: "C:\\工作区" }, {
      platform: "win32",
      spawnAdapter,
    });

    expect(child).toBe(process.child);
    expect(spawnAdapter).toHaveBeenCalledWith(
      executable,
      specialArguments,
      expect.objectContaining({ cwd: "C:\\工作区", windowsHide: true }),
    );
    expect(spawnAdapter.mock.calls[0]?.[2]).not.toHaveProperty("shell");
    expect(spawnAdapter.mock.calls[0]?.[2]).not.toHaveProperty("windowsVerbatimArguments");
  });

  test("rejects raw shell and caller-supplied Windows command strings at runtime", () => {
    expect(() => spawnCli({ executable: "agent", shell: true } as never)).toThrow(
      "Raw shell execution",
    );
    expect(() => spawnCli({ executable: "agent", windowsVerbatimArguments: true } as never)).toThrow(
      "Raw shell execution",
    );
  });
});

describe("execCli", () => {
  test("collects CRLF and Unicode output from the shared spawn adapter", async () => {
    const process = fakeChild();
    const spawnAdapter: CrossSpawnAdapter = () => {
      queueMicrotask(() => {
        process.stdout.write("第一行\r\n第二行\r\n");
        process.stderr.write("提示\r\n");
        process.child.emit("close", 0, null);
      });
      return process.child;
    };

    await expect(execCli({ executable: "agent.cmd", args: specialArguments }, {
      platform: "win32",
      spawnAdapter,
    })).resolves.toEqual({
      stdout: "第一行\r\n第二行\r\n",
      stderr: "提示\r\n",
    });
  });

  test("classifies timeout and bounded-buffer failures", async () => {
    const timeoutProcess = fakeChild();
    const timeoutError = await execCli({ executable: "agent", timeout: 1 }, {
      spawnAdapter: () => timeoutProcess.child,
    }).catch((error: unknown) => error);
    expect(timeoutError).toBeInstanceOf(CliExecutionError);
    expect(timeoutError).toMatchObject({ failure: "timeout" });
    expect(timeoutProcess.kill).toHaveBeenCalledWith("SIGTERM");

    const bufferProcess = fakeChild();
    const buffered = execCli({ executable: "agent", maxBuffer: 4 }, {
      spawnAdapter: () => {
        queueMicrotask(() => bufferProcess.stdout.write("12345"));
        return bufferProcess.child;
      },
    });
    await expect(buffered).rejects.toMatchObject({ failure: "max-buffer" });
    expect(bufferProcess.kill).toHaveBeenCalledWith("SIGTERM");
  });

  test("classifies synchronous spawn adapter failures", async () => {
    await expect(execCli({ executable: "missing-agent" }, {
      spawnAdapter: () => {
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
    })).rejects.toMatchObject({ failure: "not-found" });
  });
});

test.skipIf(process.platform !== "win32")(
  "executes a real npm cmd shim with special arguments when COMSPEC is missing",
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "multi-agent-chat-cmd-fixture-"));
    const scriptPath = path.join(dir, "capture-args.mjs");
    const outputPath = path.join(dir, "captured.json");
    await writeFile(
      scriptPath,
      'import { writeFileSync } from "node:fs";\nconst [output, ...args] = process.argv.slice(2);\nwriteFileSync(output, JSON.stringify(args), "utf8");\n',
      "utf8",
    );
    const shimPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");
    const originalComspec = process.env.comspec;
    delete process.env.comspec;
    try {
      await execCli({
        executable: shimPath,
        args: [scriptPath, outputPath, ...specialArguments],
        cwd: dir,
        timeout: 15_000,
      });
    } finally {
      if (originalComspec === undefined) delete process.env.comspec;
      else process.env.comspec = originalComspec;
    }

    await expect(readFile(outputPath, "utf8")).resolves.toBe(JSON.stringify(specialArguments));
  },
  20_000,
);
