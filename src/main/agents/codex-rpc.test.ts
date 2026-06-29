import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { writeNodeCliLauncher } from "../test-cli-fixtures";
import { CodexRpcClient } from "./codex-rpc";

describe("CodexRpcClient", () => {
  test("includes stderr when Codex exits while an RPC is pending", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-codex-rpc-"));
    const executable = await writeNodeCliLauncher(
      dir,
      "codex-fail",
      'process.stderr.write("app-server failed: bad args\\n");\nprocess.exit(1);\n',
    );

    const client = new CodexRpcClient({
      executable,
      cwd: dir,
      onEvent: () => undefined,
    });

    await expect(client.start()).rejects.toThrow("app-server failed: bad args");
  });
});
