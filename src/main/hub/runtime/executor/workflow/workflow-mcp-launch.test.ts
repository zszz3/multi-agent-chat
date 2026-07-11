import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { workflowMcpLaunchConfig } from "./workflow-mcp-launch";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("workflow MCP launch config", () => {
  test("uses the compiled MCP server without requiring source files or tsx", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "workflow-mcp-launch-"));
    roots.push(root);
    const mainBundlePath = path.join(root, "out", "main", "index.js");
    const serverPath = path.join(root, "out", "main", "mcp-server.js");
    await mkdir(path.dirname(serverPath), { recursive: true });
    await writeFile(mainBundlePath, "", "utf8");
    await writeFile(serverPath, "", "utf8");

    expect(workflowMcpLaunchConfig("C:/bridge.json", { mainBundlePath, cwd: path.join(root, "elsewhere") })).toEqual({
      command: process.execPath,
      args: [serverPath],
      env: { MULTI_AGENT_CHAT_MCP_BRIDGE: "C:/bridge.json", ELECTRON_RUN_AS_NODE: "1" },
    });
  });
});
