import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AgentEvent } from "../../../shared/types";
import { execCli, spawnCli } from "../../platform/cli-launcher";
import type { ProcessTreeTerminationRequest } from "../../platform/process-tree";
import { writeNodeCliLauncher } from "../../platform/test-cli-fixtures";
import { AcpInteractiveClient, agentEventsFromAcpUpdate } from "./acp-interactive-client";

async function createFakeAcpRuntime(dir: string): Promise<{ executable: string; callsPath: string }> {
  const callsPath = path.join(dir, "calls.jsonl");
  const executable = await writeNodeCliLauncher(
    dir,
    "fake-acp-runtime",
    `const fs = require("node:fs");
const readline = require("node:readline");
const callsPath = ${JSON.stringify(callsPath)};
let promptRequestId;
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  fs.appendFileSync(callsPath, line + "\\n");
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } });
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "acp-session-1" } });
  } else if (message.method === "session/resume" || message.method === "session/set_model") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
  } else if (message.method === "session/prompt") {
    promptRequestId = message.id;
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: message.params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } } } });
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: message.params.sessionId, update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Read file", kind: "read", status: "in_progress", rawInput: { path: "README.md" } } } });
    send({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: { sessionId: message.params.sessionId, toolCall: { toolCallId: "tool-1", title: "Read file" }, options: [{ optionId: "allow-once", name: "Allow once", kind: "allow_once" }, { optionId: "reject", name: "Reject", kind: "reject_once" }] } });
  } else if (message.id === 900 && message.result) {
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "acp-session-1", update: { sessionUpdate: "tool_call_update", toolCallId: "tool-1", title: "Read file", status: "completed", rawOutput: "contents" } } });
    send({ jsonrpc: "2.0", id: promptRequestId, result: { stopReason: "end_turn" } });
  }
});
`,
  );
  return { executable, callsPath };
}

describe("AcpInteractiveClient", () => {
  test("creates an ACP session, streams updates, approves once, and cancels", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-acp-client-"));
    const fake = await createFakeAcpRuntime(dir);
    const events: AgentEvent[] = [];
    const spawn = vi.fn(spawnCli);
    const terminate = vi.fn(async (request: ProcessTreeTerminationRequest) => {
      request.process.kill("SIGTERM");
      return {
        reason: request.reason,
        stage: "terminated" as const,
        protocolCancellation: "not-requested" as const,
      };
    });
    const client = new AcpInteractiveClient({
      executable: fake.executable,
      args: ["acp"],
      cwd: dir,
      modelId: "custom-model",
      processServices: {
        processLauncher: { spawn, exec: execCli },
        processTreeController: { terminate },
      },
      onEvent: (event) => events.push(event),
    });

    await expect(client.attach()).resolves.toBe("acp-session-1");
    await client.prompt("hello");
    await client.interrupt();
    await client.detach();

    expect(events).toEqual(expect.arrayContaining([
      { type: "delta", content: "Hello" },
      expect.objectContaining({ type: "tool_call", name: "Read file" }),
      expect.objectContaining({ type: "approval_request", requestId: "900" }),
      expect.objectContaining({ type: "approval_response", requestId: "900", decision: "approved" }),
      expect.objectContaining({ type: "tool_result", name: "Read file", content: "contents" }),
      { type: "completed" },
    ]));
    const calls = (await readFile(fake.callsPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, any>);
    expect(calls.some((call) => call.method === "session/new")).toBe(true);
    expect(calls.some((call) => call.method === "session/set_model" && call.params.modelId === "custom-model")).toBe(true);
    expect(calls.some((call) => call.method === "session/prompt" && call.params.prompt[0].text === "hello")).toBe(true);
    expect(calls.some((call) => call.method === "session/cancel")).toBe(true);
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ executable: fake.executable, args: ["acp"] }));
    expect(terminate).toHaveBeenCalledWith(expect.objectContaining({ reason: "app-shutdown" }));
    expect(calls.find((call) => call.id === 900)?.result).toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    });
  }, 15_000);

  test("resumes an existing ACP session without creating a new one", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-acp-resume-"));
    const fake = await createFakeAcpRuntime(dir);
    const client = new AcpInteractiveClient({
      executable: fake.executable,
      args: ["acp"],
      cwd: dir,
      onEvent: vi.fn(),
    });

    await expect(client.attach("existing-session")).resolves.toBe("existing-session");
    await client.detach();

    const calls = (await readFile(fake.callsPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, any>);
    expect(calls.some((call) => call.method === "session/resume" && call.params.sessionId === "existing-session")).toBe(true);
    expect(calls.some((call) => call.method === "session/new")).toBe(false);
  }, 15_000);
});

describe("agentEventsFromAcpUpdate", () => {
  test("maps ACP thought and plan updates into visible metadata", () => {
    expect(agentEventsFromAcpUpdate({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "thinking" },
    })).toEqual([{ type: "meta", content: "thinking" }]);
  });
});
