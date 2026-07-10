import type { ChildProcess } from "node:child_process";
import { describe, expect, test } from "vitest";
import { execCli, spawnCli } from "./cli-launcher";
import { createWindowsProcessTreeController } from "./process-tree";

const windowsTest = process.platform === "win32" ? test : test.skip;

function waitForChildPid(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Timed out waiting for child PID.")), 10_000);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
      const line = output.split(/\r?\n/)[0]?.trim();
      if (!line) return;
      const pid = Number(line);
      if (!Number.isSafeInteger(pid) || pid <= 0) {
        clearTimeout(timer);
        reject(new Error(`Invalid child PID: ${line}`));
        return;
      }
      clearTimeout(timer);
      resolve(pid);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}

async function waitUntilGone(pid: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Process ${pid} remained alive.`);
}

describe("Windows process-tree integration", () => {
  windowsTest("terminates a real parent and child for application shutdown", async () => {
    const parent = spawnCli({
      executable: process.execPath,
      args: [
        "-e",
        [
          'const { spawn } = require("node:child_process");',
          'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
          "process.stdout.write(String(child.pid) + '\\n');",
          "setInterval(() => {}, 1000);",
        ].join(" "),
      ],
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const parentPid = parent.pid;
    if (!parentPid) throw new Error("Parent process did not receive a PID.");
    const childPid = await waitForChildPid(parent);
    const controller = createWindowsProcessTreeController(execCli, {
      timings: { protocolGraceMs: 0, terminateGraceMs: 10_000, forceGraceMs: 5_000 },
    });

    try {
      const result = await controller.terminate({
        process: parent,
        reason: "app-shutdown",
      });
      expect(result.reason).toBe("app-shutdown");
      expect(["terminated", "forced"]).toContain(result.stage);
      await Promise.all([waitUntilGone(parentPid), waitUntilGone(childPid)]);
      expect(isAlive(parentPid)).toBe(false);
      expect(isAlive(childPid)).toBe(false);
    } finally {
      for (const pid of [childPid, parentPid]) {
        if (!isAlive(pid)) continue;
        await execCli({
          executable: "taskkill.exe",
          args: ["/PID", String(pid), "/T", "/F"],
          timeout: 5_000,
        }).catch(() => undefined);
      }
    }
  }, 30_000);
});
