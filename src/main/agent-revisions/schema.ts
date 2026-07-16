interface AgentRevisionSchemaDatabase { exec(sql: string): void }

export function ensureAgentRevisionSchema(db: AgentRevisionSchemaDatabase): void {
  db.exec(`
    create table if not exists agent_revisions (
      id text primary key, agent_id text not null, agent_type text not null, revision integer not null,
      base_agent_id text, runtime_agent_id text not null, channel_id text not null, model_id text not null,
      reasoning_effort text, instructions text not null, mcp_bindings_json text not null,
      config_hash text not null, created_at integer not null,
      unique(agent_id, revision)
    );
    create index if not exists agent_revisions_agent on agent_revisions(agent_id, revision desc);
  `);
}
