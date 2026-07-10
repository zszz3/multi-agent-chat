import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createNormalizedSchema } from "./sqlite-schema";

const AUX_STATE_ID = 1;
const require = createRequire(import.meta.url);

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

interface StatementSync {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface SqliteModule {
  DatabaseSync: new (path: string) => DatabaseSync;
}

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}

function asArray(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function json(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : undefined;
}

function optional(target: RecordValue, key: string, value: unknown): void {
  if (value !== null && value !== undefined) target[key] = value;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return Boolean(db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name));
}

function rowCount(db: DatabaseSync, table: string): number {
  const row = asRecord(db.prepare(`select count(*) as count from ${table}`).get());
  return asNumber(row.count);
}

export class SqliteAppStore {
  private db: DatabaseSync | undefined;

  constructor(private readonly dbPath: string) {}

  async load(): Promise<unknown | undefined> {
    const db = await this.open();
    const auxRow = asRecord(db.prepare("select payload from app_aux_state where id = ?").get(AUX_STATE_ID));
    if (!auxRow.payload && rowCount(db, "chats") === 0 && rowCount(db, "workflows") === 0) return undefined;

    const payload = asRecord(parseJson(auxRow.payload));
    payload.version = Number(this.readSetting(db, "payload_version") ?? "4");
    payload.activeChatId = this.nullableSetting(db, "active_chat_id");
    payload.workDir = this.readSetting(db, "work_dir") ?? "";
    payload.sessions = this.loadChats(db);
    payload.messages = this.loadChatMessages(db);
    payload.events = this.loadChatEvents(db);
    payload.workflowStore = this.loadWorkflowStore(db);
    return payload;
  }

  async save(payload: unknown): Promise<void> {
    const db = await this.open();
    this.saveNormalized(db, payload);
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  private async open(): Promise<DatabaseSync> {
    if (this.db) return this.db;
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    const { DatabaseSync } = require("node:sqlite") as SqliteModule;
    const db = new DatabaseSync(this.dbPath);
    db.exec("pragma journal_mode = WAL");
    db.exec("pragma foreign_keys = ON");
    db.exec("pragma busy_timeout = 5000");
    createNormalizedSchema(db);
    this.db = db;
    this.migrateLegacyState(db);
    return db;
  }

  private migrateLegacyState(db: DatabaseSync): void {
    if (!tableExists(db, "app_state")) return;
    const row = asRecord(db.prepare("select payload from app_state where id = 1").get());
    const legacy = asRecord(parseJson(row.payload));
    if (legacy.version === 4 && rowCount(db, "chats") === 0 && rowCount(db, "workflows") === 0) {
      this.saveNormalized(db, legacy);
    }
    if (!tableExists(db, "legacy_app_state")) db.exec("alter table app_state rename to legacy_app_state");
  }

  private saveNormalized(db: DatabaseSync, raw: unknown): void {
    const payload = asRecord(raw);
    if (payload.version !== 4) throw new Error("SQLite persistence only supports app state version 4");
    db.exec("begin immediate");
    try {
      this.clearNormalizedState(db);
      const now = Date.now();
      this.writeSetting(db, "payload_version", "4", now);
      this.writeSetting(db, "active_chat_id", typeof payload.activeChatId === "string" ? payload.activeChatId : null, now);
      this.writeSetting(db, "work_dir", asString(payload.workDir), now);
      const workflowStore = asRecord(payload.workflowStore);
      this.writeSetting(
        db,
        "active_workflow_id",
        typeof workflowStore.activeWorkflowId === "string" ? workflowStore.activeWorkflowId : null,
        now,
      );
      this.saveChats(db, payload);
      this.saveWorkflows(db, workflowStore);

      const aux = { ...payload };
      delete aux.version;
      delete aux.activeChatId;
      delete aux.workDir;
      delete aux.sessions;
      delete aux.messages;
      delete aux.events;
      delete aux.workflowStore;
      db.prepare(
        `insert into app_aux_state (id, payload, updated_at) values (?, ?, ?)
         on conflict(id) do update set payload = excluded.payload, updated_at = excluded.updated_at`,
      ).run(AUX_STATE_ID, JSON.stringify(aux), now);
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }

  private clearNormalizedState(db: DatabaseSync): void {
    db.exec(`
      delete from chat_events;
      delete from chat_messages;
      delete from runtime_sessions;
      delete from chats;
      delete from workflow_event_artifacts;
      delete from workflow_events;
      delete from workflow_run_nodes;
      delete from workflow_run_order;
      delete from workflow_runs;
      delete from workflow_run_progress;
      delete from workflow_draft_messages;
      delete from workflow_edges;
      delete from workflow_nodes;
      delete from workflow_graphs;
      delete from workflows;
      delete from app_settings;
    `);
  }

  private writeSetting(db: DatabaseSync, key: string, value: string | null, now: number): void {
    db.prepare("insert into app_settings (key, value_text, updated_at) values (?, ?, ?)").run(key, value, now);
  }

  private readSetting(db: DatabaseSync, key: string): string | undefined {
    const row = asRecord(db.prepare("select value_text from app_settings where key = ?").get(key));
    return asOptionalString(row.value_text);
  }

  private nullableSetting(db: DatabaseSync, key: string): string | null {
    return this.readSetting(db, key) ?? null;
  }

  private saveChats(db: DatabaseSync, payload: RecordValue): void {
    const sessions = asArray(payload.sessions);
    for (const chat of sessions) {
      db.prepare(
        `insert into chats
         (id, title, configured_agent_id, model_id, channel_id, last_error, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        asString(chat.id),
        asString(chat.title),
        asString(chat.configuredAgentId),
        asOptionalString(chat.modelId) ?? null,
        asOptionalString(chat.channelId) ?? null,
        asOptionalString(chat.lastError) ?? null,
        asNumber(chat.createdAt),
        asNumber(chat.updatedAt),
      );
      if (chat.runtimeState !== undefined || chat.runtimeConversation !== undefined) {
        const conversation = asRecord(chat.runtimeConversation);
        const runtimeState = asRecord(chat.runtimeState);
        db.prepare(
          `insert into runtime_sessions
           (id, chat_id, runtime_id, state, provider_session_id, runtime_state_json, conversation_json, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `${asString(chat.id)}:runtime`,
          asString(chat.id),
          asOptionalString(conversation.runtimeId) ?? null,
          asOptionalString(runtimeState.state) ?? null,
          asOptionalString(conversation.sessionId) ?? null,
          json(chat.runtimeState),
          json(chat.runtimeConversation),
          asNumber(chat.createdAt),
          asNumber(chat.updatedAt),
        );
      }
    }

    const messageSequence = new Map<string, number>();
    for (const message of asArray(payload.messages)) {
      const chatId = asString(message.chatId);
      const sequence = messageSequence.get(chatId) ?? 0;
      messageSequence.set(chatId, sequence + 1);
      db.prepare(
        `insert into chat_messages (id, chat_id, role, content, is_local, sequence, created_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        asString(message.id),
        chatId,
        asString(message.role),
        asString(message.content),
        message.local === true ? 1 : 0,
        sequence,
        asNumber(message.timestamp),
      );
    }

    const eventSequence = new Map<string, number>();
    for (const event of asArray(payload.events)) {
      const messageId = asString(event.messageId);
      const sequence = eventSequence.get(messageId) ?? 0;
      eventSequence.set(messageId, sequence + 1);
      db.prepare(
        `insert into chat_events
         (id, chat_id, message_id, type, content, agent_id, name, from_agent_id, to_agent_id,
          request_id, request_state, decision, metadata_json, sequence, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        asString(event.id),
        asString(event.chatId),
        messageId,
        asString(event.type),
        asString(event.content),
        asOptionalString(event.agentId) ?? null,
        asOptionalString(event.name) ?? null,
        asOptionalString(event.fromAgentId) ?? null,
        asOptionalString(event.toAgentId) ?? null,
        asOptionalString(event.requestId) ?? null,
        asOptionalString(event.requestState) ?? null,
        asOptionalString(event.decision) ?? null,
        json(event.metadata),
        sequence,
        asNumber(event.timestamp),
      );
    }
  }

  private saveWorkflows(db: DatabaseSync, rawStore: unknown): void {
    const store = asRecord(rawStore);
    const runs = asArray(store.runs);
    const runsById = new Map(runs.map((run) => [asString(run.runId), run]));
    for (const workflow of asArray(store.workflows)) {
      const workflowId = asString(workflow.workflowId);
      db.prepare(
        `insert into workflows
         (id, source_type, topology_locked, title, status, revision, configured_agent_id, model_id, objective, work_dir, graph_ready,
          reply, error, run_context_document, context_document, final_report, runtime_conversation_json,
          created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        workflowId,
        workflow.sourceType === "official" ? "official" : "user",
        workflow.topologyLocked === true ? 1 : 0,
        asString(workflow.title),
        asString(workflow.status),
        asNumber(workflow.revision),
        asString(workflow.configuredAgentId),
        asString(workflow.modelId),
        asString(workflow.objective),
        asOptionalString(workflow.workDir) ?? null,
        workflow.graphReady === true ? 1 : 0,
        asString(workflow.reply),
        asOptionalString(workflow.error) ?? null,
        asString(workflow.runContextDocument),
        asString(workflow.contextDocument),
        asOptionalString(workflow.finalReport) ?? null,
        json(workflow.runtimeConversation),
        asNumber(workflow.createdAt),
        asNumber(workflow.updatedAt),
      );
      const draftGraphId = `workflow:${workflowId}:revision:${asNumber(workflow.revision)}`;
      this.saveGraph(db, draftGraphId, workflowId, asNumber(workflow.revision), null, workflow.graph, asNumber(workflow.updatedAt));

      asArray(workflow.messages).forEach((message, sequence) => {
        db.prepare(
          "insert into workflow_draft_messages (id, workflow_id, role, content, sequence) values (?, ?, ?, ?, ?)",
        ).run(asString(message.id), workflowId, asString(message.role), asString(message.content), sequence);
      });
      asArray(workflow.runProgress).forEach((item, sequence) => {
        db.prepare(
          `insert into workflow_run_progress
           (workflow_id, node_id, title, status, detail, task_id, sequence) values (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          workflowId,
          asString(item.nodeId),
          asString(item.title),
          asString(item.status),
          asOptionalString(item.detail) ?? null,
          asOptionalString(item.taskId) ?? null,
          sequence,
        );
      });

      const orderedRunIds = Array.isArray(workflow.runIds) ? workflow.runIds.filter((id): id is string => typeof id === "string") : [];
      orderedRunIds.forEach((runId, sequence) => {
        const run = runsById.get(runId);
        if (run) this.saveRun(db, workflowId, run, sequence);
      });
    }
  }

  private saveGraph(
    db: DatabaseSync,
    graphId: string,
    workflowId: string,
    revision: number | null,
    runId: string | null,
    rawGraph: unknown,
    createdAt: number,
  ): void {
    const graph = asRecord(rawGraph);
    db.prepare(
      "insert into workflow_graphs (id, workflow_id, revision, run_id, title, objective, created_at) values (?, ?, ?, ?, ?, ?, ?)",
    ).run(graphId, workflowId, revision, runId, asString(graph.title), asString(graph.objective), createdAt);
    asArray(graph.nodes).forEach((node, sequence) => {
      const position = asRecord(node.position);
      db.prepare(
        `insert into workflow_nodes
         (graph_id, node_id, kind, title, prompt, configured_agent_id, model_id, position_x, position_y, sequence)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        graphId,
        asString(node.id),
        asString(node.kind),
        asString(node.title),
        asString(node.prompt),
        asOptionalString(node.configuredAgentId) ?? null,
        asOptionalString(node.modelId) ?? null,
        asOptionalNumber(position.x) ?? null,
        asOptionalNumber(position.y) ?? null,
        sequence,
      );
    });
    asArray(graph.edges).forEach((edge, sequence) => {
      db.prepare(
        "insert into workflow_edges (graph_id, edge_id, from_node_id, to_node_id, sequence) values (?, ?, ?, ?, ?)",
      ).run(graphId, asString(edge.id), asString(edge.fromNodeId), asString(edge.toNodeId), sequence);
    });
  }

  private saveRun(db: DatabaseSync, workflowId: string, run: RecordValue, sequence: number): void {
    const runId = asString(run.runId);
    const graphId = `workflow-run:${runId}`;
    this.saveGraph(db, graphId, workflowId, null, runId, run.graphSnapshot, asNumber(run.startedAt));
    db.prepare(
      `insert into workflow_runs
       (id, workflow_id, graph_id, status, context_document, final_report, started_at, finished_at, last_error)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId,
      workflowId,
      graphId,
      asString(run.status),
      asString(run.contextDocument),
      asOptionalString(run.finalReport) ?? null,
      asNumber(run.startedAt),
      asOptionalNumber(run.finishedAt) ?? null,
      asOptionalString(run.lastError) ?? null,
    );
    db.prepare("insert into workflow_run_order (workflow_id, run_id, sequence) values (?, ?, ?)").run(workflowId, runId, sequence);
    asArray(run.progress).forEach((item, itemSequence) => {
      db.prepare(
        `insert into workflow_run_nodes
         (run_id, node_id, title, status, detail, task_id, sequence) values (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        runId,
        asString(item.nodeId),
        asString(item.title),
        asString(item.status),
        asOptionalString(item.detail) ?? null,
        asOptionalString(item.taskId) ?? null,
        itemSequence,
      );
    });
    asArray(run.events).forEach((event, eventSequence) => {
      const eventId = `${runId}:event:${eventSequence}`;
      db.prepare(
        `insert into workflow_events
         (id, run_id, node_id, type, at, attempt, task_id, detail, pass, summary, error, question, answer, sequence)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        eventId,
        runId,
        asString(event.nodeId),
        asString(event.type),
        asNumber(event.at),
        asOptionalNumber(event.attempt) ?? null,
        asOptionalString(event.taskId) ?? null,
        asOptionalString(event.detail) ?? null,
        typeof event.pass === "boolean" ? (event.pass ? 1 : 0) : null,
        asOptionalString(event.summary) ?? null,
        asOptionalString(event.error) ?? null,
        asOptionalString(event.question) ?? null,
        asOptionalString(event.answer) ?? null,
        eventSequence,
      );
      asArray(event.artifactRefs).forEach((artifact, artifactSequence) => {
        db.prepare(
          `insert into workflow_event_artifacts
           (event_id, sequence, kind, title, content, path, url) values (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          eventId,
          artifactSequence,
          asString(artifact.kind),
          asString(artifact.title),
          asOptionalString(artifact.content) ?? null,
          asOptionalString(artifact.path) ?? null,
          asOptionalString(artifact.url) ?? null,
        );
      });
    });
  }

  private loadChats(db: DatabaseSync): RecordValue[] {
    const runtimeRows = db.prepare("select * from runtime_sessions order by created_at, id").all().map(asRecord);
    const runtimeByChat = new Map(runtimeRows.map((row) => [asString(row.chat_id), row]));
    return db
      .prepare("select * from chats order by created_at, id")
      .all()
      .map(asRecord)
      .map((row) => {
        const chat: RecordValue = {
          id: row.id,
          title: row.title,
          configuredAgentId: row.configured_agent_id,
          modelId: row.model_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        optional(chat, "channelId", row.channel_id);
        optional(chat, "lastError", row.last_error);
        const runtime = runtimeByChat.get(asString(row.id));
        if (runtime?.runtime_state_json) chat.runtimeState = parseJson(runtime.runtime_state_json);
        if (runtime?.conversation_json) chat.runtimeConversation = parseJson(runtime.conversation_json);
        return chat;
      });
  }

  private loadChatMessages(db: DatabaseSync): RecordValue[] {
    return db
      .prepare("select * from chat_messages order by chat_id, sequence")
      .all()
      .map(asRecord)
      .map((row) => ({
        id: row.id,
        chatId: row.chat_id,
        role: row.role,
        content: row.content,
        timestamp: row.created_at,
        ...(row.is_local === 1 ? { local: true } : {}),
      }));
  }

  private loadChatEvents(db: DatabaseSync): RecordValue[] {
    return db
      .prepare("select * from chat_events order by chat_id, message_id, sequence")
      .all()
      .map(asRecord)
      .map((row) => {
        const event: RecordValue = {
          id: row.id,
          chatId: row.chat_id,
          messageId: row.message_id,
          type: row.type,
          content: row.content,
          timestamp: row.created_at,
        };
        optional(event, "agentId", row.agent_id);
        optional(event, "name", row.name);
        optional(event, "fromAgentId", row.from_agent_id);
        optional(event, "toAgentId", row.to_agent_id);
        optional(event, "requestId", row.request_id);
        optional(event, "requestState", row.request_state);
        optional(event, "decision", row.decision);
        if (row.metadata_json) event.metadata = parseJson(row.metadata_json);
        return event;
      });
  }

  private loadWorkflowStore(db: DatabaseSync): RecordValue {
    const workflows = db
      .prepare("select * from workflows order by created_at, id")
      .all()
      .map(asRecord)
      .map((row) => this.loadWorkflow(db, row));
    const runs = db
      .prepare("select r.* from workflow_runs r join workflow_run_order o on o.run_id = r.id order by o.workflow_id, o.sequence")
      .all()
      .map(asRecord)
      .map((row) => this.loadRun(db, row));
    return {
      activeWorkflowId: this.readSetting(db, "active_workflow_id"),
      workflows,
      runs,
    };
  }

  private loadWorkflow(db: DatabaseSync, row: RecordValue): RecordValue {
    const workflowId = asString(row.id);
    const graphRow = asRecord(
      db.prepare("select * from workflow_graphs where workflow_id = ? and revision = ?").get(workflowId, row.revision),
    );
    const runIds = db
      .prepare("select run_id from workflow_run_order where workflow_id = ? order by sequence")
      .all(workflowId)
      .map((item) => asString(asRecord(item).run_id));
    const workflow: RecordValue = {
      workflowId,
      sourceType: row.source_type === "official" ? "official" : "user",
      topologyLocked: row.topology_locked === 1,
      title: row.title,
      status: row.status,
      revision: row.revision,
      configuredAgentId: row.configured_agent_id,
      modelId: row.model_id,
      objective: row.objective,
      graph: this.loadGraph(db, graphRow),
      graphReady: row.graph_ready === 1,
      messages: db
        .prepare("select id, role, content from workflow_draft_messages where workflow_id = ? order by sequence")
        .all(workflowId)
        .map((message) => {
          const item = asRecord(message);
          return { id: item.id, role: item.role, content: item.content };
        }),
      reply: row.reply,
      runProgress: this.loadProgress(db, "workflow_run_progress", "workflow_id", workflowId),
      runContextDocument: row.run_context_document,
      contextDocument: row.context_document,
      runIds,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    optional(workflow, "workDir", row.work_dir);
    optional(workflow, "error", row.error);
    optional(workflow, "finalReport", row.final_report);
    if (row.runtime_conversation_json) workflow.runtimeConversation = parseJson(row.runtime_conversation_json);
    return workflow;
  }

  private loadRun(db: DatabaseSync, row: RecordValue): RecordValue {
    const runId = asString(row.id);
    const graphRow = asRecord(db.prepare("select * from workflow_graphs where id = ?").get(row.graph_id));
    const run: RecordValue = {
      runId,
      workflowId: row.workflow_id,
      status: row.status,
      graphSnapshot: this.loadGraph(db, graphRow),
      progress: this.loadProgress(db, "workflow_run_nodes", "run_id", runId),
      events: db
        .prepare("select * from workflow_events where run_id = ? order by sequence")
        .all(runId)
        .map(asRecord)
        .map((event) => this.loadWorkflowEvent(db, event)),
      contextDocument: row.context_document,
      startedAt: row.started_at,
    };
    optional(run, "finalReport", row.final_report);
    optional(run, "finishedAt", row.finished_at);
    optional(run, "lastError", row.last_error);
    return run;
  }

  private loadGraph(db: DatabaseSync, graphRow: RecordValue): RecordValue {
    const graphId = asString(graphRow.id);
    const nodes = db
      .prepare("select * from workflow_nodes where graph_id = ? order by sequence")
      .all(graphId)
      .map(asRecord)
      .map((row) => {
        const node: RecordValue = {
          id: row.node_id,
          kind: row.kind,
          title: row.title,
          prompt: row.prompt,
        };
        optional(node, "configuredAgentId", row.configured_agent_id);
        optional(node, "modelId", row.model_id);
        if (row.position_x !== null && row.position_y !== null) node.position = { x: row.position_x, y: row.position_y };
        return node;
      });
    const edges = db
      .prepare("select * from workflow_edges where graph_id = ? order by sequence")
      .all(graphId)
      .map(asRecord)
      .map((row) => ({ id: row.edge_id, fromNodeId: row.from_node_id, toNodeId: row.to_node_id }));
    return { title: graphRow.title, objective: graphRow.objective, nodes, edges };
  }

  private loadProgress(db: DatabaseSync, table: string, ownerColumn: string, ownerId: string): RecordValue[] {
    return db
      .prepare(`select * from ${table} where ${ownerColumn} = ? order by sequence`)
      .all(ownerId)
      .map(asRecord)
      .map((row) => {
        const item: RecordValue = { nodeId: row.node_id, title: row.title, status: row.status };
        optional(item, "detail", row.detail);
        optional(item, "taskId", row.task_id);
        return item;
      });
  }

  private loadWorkflowEvent(db: DatabaseSync, row: RecordValue): RecordValue {
    const event: RecordValue = { type: row.type, nodeId: row.node_id, at: row.at };
    optional(event, "attempt", row.attempt);
    optional(event, "taskId", row.task_id);
    optional(event, "detail", row.detail);
    if (row.pass !== null && row.pass !== undefined) event.pass = row.pass === 1;
    optional(event, "summary", row.summary);
    optional(event, "error", row.error);
    optional(event, "question", row.question);
    optional(event, "answer", row.answer);
    const artifacts = db
      .prepare("select * from workflow_event_artifacts where event_id = ? order by sequence")
      .all(row.id)
      .map(asRecord)
      .map((artifact) => {
        const value: RecordValue = { kind: artifact.kind, title: artifact.title };
        optional(value, "content", artifact.content);
        optional(value, "path", artifact.path);
        optional(value, "url", artifact.url);
        return value;
      });
    if (artifacts.length > 0) event.artifactRefs = artifacts;
    return event;
  }
}
