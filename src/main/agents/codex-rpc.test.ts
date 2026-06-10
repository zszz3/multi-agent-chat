import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CodexRpcClient } from "./codex-rpc";

describe("CodexRpcClient", () => {
  test("includes stderr when Codex exits while an RPC is pending", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-rpc-"));
    const executable = path.join(dir, "codex-fail");
    await writeFile(executable, '#!/bin/sh\necho "app-server failed: bad args" >&2\nexit 1\n', "utf8");
    await chmod(executable, 0o755);

    const client = new CodexRpcClient({
      executable,
      cwd: dir,
      onEvent: () => undefined,
    });

    await expect(client.start()).rejects.toThrow("app-server failed: bad args");
  });
});
