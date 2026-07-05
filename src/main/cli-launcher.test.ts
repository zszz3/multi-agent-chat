import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { writeNodeCliLauncher } from "./test-cli-fixtures";
import { ClaudeRunner } from "./agents/claude-runner";
import { resolveCliInvocation } from "./cli-launcher";

async function captureClaudeArgs(options: {
  sessionId?: string;
  modelId?: string;
  fixedArgs?: string[];
}): Promise<string[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-launcher-"));
  const argsFile = path.join(dir, "args.txt");
  const executable = await writeNodeCliLauncher(
    dir,
    "claude-echo",
    `const fs = require("fs");
fs.writeFileSync(${JSON.stringify(argsFile)}, process.argv.slice(2).join("\\n") + "\\n", "utf8");
`,
  );

  await new Promise<void>((resolve, reject) => {
    const runner = new ClaudeRunner({
      executable,
      ...(options.fixedArgs ? { fixedArgs: options.fixedArgs } : {}),
      cwd: dir,
      prompt: "hello",
      modelId: options.modelId,
      sessionId: options.sessionId,
      onEvent: () => undefined,
      onExit: () => resolve(),
    });
    runner.start().catch(reject);
  });

  return (await readFile(argsFile, "utf8")).split("\n").filter(Boolean);
}

describe("resolveCliInvocation", () => {
  test("routes Windows cmd shims through cmd.exe", () => {
    expect(
      resolveCliInvocation(
        "C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd",
        ["exec", "--json", "hello world", 'quote"inside', "has&meta"],
        { platform: "win32", comspec: "C:\\Windows\\System32\\cmd.exe" },
      ),
    ).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        '""C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd" "exec" "--json" "hello world" "quote""inside" "has&meta""',
      ],
      viaWindowsCmd: true,
      windowsVerbatimArguments: true,
    });
  });

  test("routes Windows bare command names through cmd.exe", () => {
    expect(resolveCliInvocation("codex", ["--version"], { platform: "win32", comspec: "cmd.exe" })).toEqual({
      file: "cmd.exe",
      args: ["/d", "/s", "/c", '""codex" "--version""'],
      viaWindowsCmd: true,
      windowsVerbatimArguments: true,
    });
  });

  test("does not shell-wrap non-cmd executables on Windows", () => {
    expect(resolveCliInvocation("C:\\tools\\codex.exe", ["app-server"], { platform: "win32" })).toEqual({
      file: "C:\\tools\\codex.exe",
      args: ["app-server"],
      viaWindowsCmd: false,
    });
  });

  test("does not shell-wrap on non-Windows platforms", () => {
    expect(resolveCliInvocation("/usr/local/bin/codex", ["--version"], { platform: "darwin" })).toEqual({
      file: "/usr/local/bin/codex",
      args: ["--version"],
      viaWindowsCmd: false,
    });
  });

  test("prepends fixed args before native Claude flags", async () => {
    const args = await captureClaudeArgs({ fixedArgs: ["--verbose-json-wrapper"] });

    expect(args.slice(0, 4)).toEqual(["--verbose-json-wrapper", "--print", "--output-format", "stream-json"]);
    expect(args.at(-1)).toBe("hello");
  });
});
