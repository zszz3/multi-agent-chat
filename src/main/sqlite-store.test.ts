import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteAppStore } from "./sqlite-store";

const require = createRequire(import.meta.url);
const tempDirs: string[] = [];

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (path: string) => DatabaseSync;
}

async function createDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-store-"));
  tempDirs.push(dir);
  return path.join(dir, "app.db");
}

function sampleState() {
  return {
    version: 4,
    activeChatId: "chat-1",
    activeTaskId: "task-1",
    activeTeamId: null,
    activeTeamRunId: null,
    workDir: "/tmp/project",
    sessions: [
      {
        id: "chat-1",
        title: "Architecture",
        configuredAgentId: "agent-1",
        modelId: "model-1",
        channelId: "channel-1",
        runtimeState: { state: "attached", generation: 2 },
        runtimeConversation: { runtimeId: "codex", sessionId: "native-1", payload: { cursor: 3 } },
        lastError: undefined,
        createdAt: 10,
        updatedAt: 20,
      },
    ],
    messages: [
      { id: "message-1", chatId: "chat-1", role: "user", content: "hello", timestamp: 11 },
      { id: "message-2", chatId: "chat-1", role: "assistant", content: "hi", timestamp: 12, local: true },
    ],
    events: [
      {
        id: "event-1",
        chatId: "chat-1",
        messageId: "message-2",
        type: "tool_call",
        content: "run",
        timestamp: 13,
        agentId: "codex",
        name: "shell",
        requestId: "request-1",
        metadata: { command: "pwd" },
      },
    ],
    tasks: [{ id: "task-1", title: "untouched" }],
    taskMessages: [],
    taskEvents: [],
    teams: [],
    teamRuns: [],
    configuredAgents: [{ id: "agent-1", name: "Agent" }],
    channels: [{ id: "channel-1", name: "Local" }],
    scheduledWorkflowStore: { schedules: [] },
    workflowStore: {
      activeWorkflowId: "workflow-1",
      workflows: [
        {
          workflowId: "workflow-1",
          title: "Release",
          status: "running",
          revision: 3,
          configuredAgentId: "agent-1",
          modelId: "model-1",
          objective: "ship safely",
          workDir: "/tmp/project",
          graph: {
            title: "Release graph",
            objective: "ship safely",
            nodes: [
              { id: "start", kind: "start", title: "Start", prompt: "", position: { x: 1, y: 2 } },
              {
                id: "build",
                kind: "agent",
                title: "Build",
                prompt: "build it",
                configuredAgentId: "agent-1",
                modelId: "model-2",
              },
            ],
            edges: [{ id: "edge-1", fromNodeId: "start", toNodeId: "build" }],
          },
          graphReady: true,
          messages: [{ id: "grill-1", role: "user", content: "go" }],
          reply: "ready",
          error: undefined,
          runProgress: [{ nodeId: "build", title: "Build", status: "running", taskId: "task-1" }],
          runContextDocument: "run context",
          contextDocument: "context",
          finalReport: undefined,
          runIds: ["run-1"],
          runtimeConversation: { runtimeId: "codex", sessionId: "workflow-native", payload: {} },
          createdAt: 30,
          updatedAt: 40,
        },
      ],
      runs: [
        {
          runId: "run-1",
          workflowId: "workflow-1",
          status: "running",
          graphSnapshot: {
            title: "Release graph",
            objective: "ship safely",
            nodes: [{ id: "build", kind: "agent", title: "Build", prompt: "build it" }],
            edges: [],
          },
          progress: [{ nodeId: "build", title: "Build", status: "completed", detail: "done" }],
          events: [
            {
              type: "node_output",
              nodeId: "build",
              at: 35,
              attempt: 1,
              summary: "built",
              artifactRefs: [{ kind: "file", title: "binary", path: "/tmp/app" }],
            },
          ],
          contextDocument: "run context",
          startedAt: 31,
          finishedAt: undefined,
          lastError: undefined,
        },
      ],
    },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SqliteAppStore normalized persistence", () => {
  it("stores chats, runtime sessions, and workflow topology as relational rows", async () => {
    const dbPath = await createDbPath();
    const store = new SqliteAppStore(dbPath);
    await store.save(sampleState());
    store.close();

    const { DatabaseSync } = require("node:sqlite") as SqliteModule;
    const db = new DatabaseSync(dbPath);
    const tables = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "chats",
        "chat_messages",
        "chat_events",
        "runtime_sessions",
        "workflows",
        "workflow_graphs",
        "workflow_nodes",
        "workflow_edges",
        "workflow_runs",
        "workflow_run_nodes",
        "workflow_events",
        "workflow_event_artifacts",
      ]),
    );
    expect(tables.map(({ name }) => name)).not.toContain("app_state");
    expect(db.prepare("select count(*) as count from chats").get()).toEqual({ count: 1 });
    expect(db.prepare("select count(*) as count from runtime_sessions").get()).toEqual({ count: 1 });
    expect(db.prepare("select count(*) as count from workflow_nodes").get()).toEqual({ count: 3 });
    expect(db.prepare("select count(*) as count from workflow_edges").get()).toEqual({ count: 1 });
    expect(db.prepare("select count(*) as count from workflow_runs").get()).toEqual({ count: 1 });
    db.close();
  });

  it("round trips normalized domains and preserves out-of-scope task state", async () => {
    const dbPath = await createDbPath();
    const store = new SqliteAppStore(dbPath);
    const state = sampleState();
    await store.save(state);

    expect(await store.load()).toEqual(JSON.parse(JSON.stringify(state)));
    store.close();
  });

  it("replaces removed aggregate rows on a later save", async () => {
    const dbPath = await createDbPath();
    const store = new SqliteAppStore(dbPath);
    const state = sampleState();
    await store.save(state);
    await store.save({
      ...state,
      activeChatId: null,
      sessions: [],
      messages: [],
      events: [],
      workflowStore: { activeWorkflowId: undefined, workflows: [], runs: [] },
    });
    store.close();

    const { DatabaseSync } = require("node:sqlite") as SqliteModule;
    const db = new DatabaseSync(dbPath);
    expect(db.prepare("select count(*) as count from chats").get()).toEqual({ count: 0 });
    expect(db.prepare("select count(*) as count from workflows").get()).toEqual({ count: 0 });
    db.close();
  });

  it("imports a legacy V4 app_state once and retains it as a backup", async () => {
    const dbPath = await createDbPath();
    const state = sampleState();
    const { DatabaseSync } = require("node:sqlite") as SqliteModule;
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      create table app_state (
        id integer primary key check (id = 1),
        payload text not null,
        updated_at integer not null
      )
    `);
    legacyDb.prepare("insert into app_state (id, payload, updated_at) values (1, ?, ?)").run(JSON.stringify(state), 1);
    legacyDb.close();

    const store = new SqliteAppStore(dbPath);
    expect(await store.load()).toEqual(JSON.parse(JSON.stringify(state)));
    store.close();

    const migratedDb = new DatabaseSync(dbPath);
    const tables = migratedDb.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
    expect(tables.map(({ name }) => name)).not.toContain("app_state");
    expect(tables.map(({ name }) => name)).toContain("legacy_app_state");
    expect(migratedDb.prepare("select count(*) as count from workflow_nodes").get()).toEqual({ count: 3 });
    migratedDb.close();
  });
});
