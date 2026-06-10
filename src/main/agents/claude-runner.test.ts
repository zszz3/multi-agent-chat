import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ClaudeRunner } from "./claude-runner";

async function captureClaudeArgs(options: { sessionId?: string; modelId?: string }): Promise<string[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-claude-args-"));
  const executable = path.join(dir, "claude-echo");
  const argsFile = path.join(dir, "args.txt");
  // Record each received argument on its own line, then exit cleanly.
  await writeFile(
    executable,
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argsFile)}\nexit 0\n`,
    "utf8",
  );
  await chmod(executable, 0o755);

  await new Promise<void>((resolve, reject) => {
    const runner = new ClaudeRunner({
      executable,
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

describe("ClaudeRunner argument construction", () => {
  test("does not pass the removed --cd flag and requires --verbose for stream-json", async () => {
    const args = await captureClaudeArgs({ modelId: "claude-sonnet-4-6", sessionId: "session-abc" });

    // The current Claude CLI rejects --cd and requires --verbose with stream-json.
    expect(args).not.toContain("--cd");
    expect(args).toContain("--verbose");
    expect(args).toContain("--print");
    expect(args.join(" ")).toContain("--output-format stream-json");
    expect(args[args.length - 1]).toBe("hello");
  });

  test("forwards the model and resumed session id", async () => {
    const args = await captureClaudeArgs({ modelId: "claude-sonnet-4-6", sessionId: "session-abc" });

    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-6");
    expect(args).toContain("--resume");
    expect(args).toContain("session-abc");
  });

  test("omits model and resume flags when not provided", async () => {
    const args = await captureClaudeArgs({});

    expect(args).not.toContain("--model");
    expect(args).not.toContain("--resume");
  });
});
