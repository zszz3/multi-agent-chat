import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { AgentRevision } from "../../shared/agent/types";
import { ensureAgentRevisionSchema } from "./schema";

const require = createRequire(import.meta.url);
type Row = Record<string, unknown>;
interface Statement { all(...params: unknown[]): unknown[]; run(...params: unknown[]): { changes?: number } }
interface Database { exec(sql: string): void; prepare(sql: string): Statement; close(): void }

export class AgentRevisionRepository {
  private db: Database | undefined;
  constructor(private readonly dbPath: string) {}

  async list(agentId?: string): Promise<AgentRevision[]> {
    const db = await this.open();
    const rows = agentId
      ? db.prepare("select * from agent_revisions where agent_id = ? order by revision desc").all(agentId)
      : db.prepare("select * from agent_revisions order by agent_id, revision desc").all();
    return rows.map((row) => this.fromRow(row as Row));
  }

  async save(revision: AgentRevision): Promise<AgentRevision> {
    const db = await this.open();
    db.prepare(`insert into agent_revisions
      (id, agent_id, agent_type, revision, base_agent_id, runtime_agent_id, channel_id, model_id, reasoning_effort, instructions, mcp_bindings_json, config_hash, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do nothing`).run(
      revision.id, revision.agentId, revision.agentType, revision.revision, revision.baseAgentId ?? null,
      revision.runtimeAgentId, revision.channelId, revision.modelId, revision.reasoningEffort ?? null,
      revision.instructions, JSON.stringify(revision.mcpBindings), revision.configHash, revision.createdAt,
    );
    return revision;
  }

  close(): void { this.db?.close(); this.db = undefined; }

  private fromRow(row: Row): AgentRevision {
    return {
      id: String(row.id), agentId: String(row.agent_id), agentType: row.agent_type === "composed" ? "composed" : "execution",
      revision: Number(row.revision), ...(row.base_agent_id ? { baseAgentId: String(row.base_agent_id) } : {}),
      runtimeAgentId: String(row.runtime_agent_id) as AgentRevision["runtimeAgentId"], channelId: String(row.channel_id),
      modelId: String(row.model_id), ...(row.reasoning_effort ? { reasoningEffort: String(row.reasoning_effort) } : {}),
      instructions: String(row.instructions), mcpBindings: JSON.parse(String(row.mcp_bindings_json)) as AgentRevision["mcpBindings"],
      configHash: String(row.config_hash), createdAt: Number(row.created_at),
    };
  }

  private async open(): Promise<Database> {
    if (this.db) return this.db;
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => Database };
    const db = new DatabaseSync(this.dbPath);
    db.exec("pragma journal_mode=WAL; pragma foreign_keys=ON; pragma busy_timeout=5000;");
    ensureAgentRevisionSchema(db);
    this.db = db;
    return db;
  }
}
