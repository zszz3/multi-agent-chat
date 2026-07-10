# Chat and Workflow Relational Storage Design

## Goal

Replace the single-row `app_state.payload` persistence model for chat, runtime
sessions, and workflows with normalized SQLite tables. Preserve the current
AgentHub API and in-memory behavior while changing the durable representation.

Tasks are explicitly out of scope for this phase. Their persisted records remain
in an auxiliary compatibility payload until the task domain is redesigned.

## Decisions

- Keep SQLite. The current desktop application is single-user and local-first;
  PostgreSQL or MySQL would add deployment and lifecycle costs without solving
  the existing modeling problem.
- Chat and runtime session are different entities. A chat owns messages and may
  own zero or more runtime sessions. Provider-specific conversation payloads are
  opaque JSON on `runtime_sessions`, not on `chats`.
- A workflow is a durable aggregate. Graphs are versioned, nodes and edges are
  rows, and a run references its immutable graph snapshot.
- Core identifiers, state, timestamps, graph topology, and searchable fields are
  columns. JSON is restricted to opaque provider payloads, event metadata, and
  the temporary out-of-scope auxiliary state.
- Every save is transactional. Readers never observe a partially replaced graph
  or a message without its chat.

## Tables

### Application metadata

- `app_settings(key, value_text, updated_at)` stores active selections, workdir,
  and the reconstructed payload version.
- `app_aux_state(id, payload, updated_at)` temporarily stores task, team,
  schedule, channel, and configured-agent state excluded from this phase.
- `schema_migrations(version, applied_at)` records schema migrations.

### Chat

- `chats(id, title, configured_agent_id, model_id, channel_id, last_error,
  created_at, updated_at)`
- `chat_messages(id, chat_id, role, content, is_local, sequence, created_at)`
- `chat_events(id, chat_id, message_id, type, content, agent_id, name,
  from_agent_id, to_agent_id, request_id, request_state, decision,
  metadata_json, sequence, created_at)`
- `runtime_sessions(id, chat_id, runtime_id, state, provider_session_id,
  runtime_state_json, conversation_json, created_at, updated_at)`

The first migration creates one deterministic runtime-session row for each
persisted chat that currently contains runtime state or conversation data.

### Workflow

- `workflows(id, title, status, revision, configured_agent_id, model_id,
  objective, work_dir, graph_ready, reply, error, run_context_document,
  context_document, final_report, runtime_conversation_json, created_at,
  updated_at)`
- `workflow_graphs(id, workflow_id, revision, run_id, title, objective,
  created_at)`
- `workflow_nodes(graph_id, node_id, kind, title, prompt,
  configured_agent_id, model_id, position_x, position_y, sequence)`
- `workflow_edges(graph_id, edge_id, from_node_id, to_node_id, sequence)`
- `workflow_draft_messages(id, workflow_id, role, content, sequence)`
- `workflow_run_progress(workflow_id, node_id, title, status, detail, task_id,
  sequence)` stores the draft's current projected progress.
- `workflow_runs(id, workflow_id, graph_id, status, context_document,
  final_report, started_at, finished_at, last_error)`
- `workflow_run_nodes(run_id, node_id, title, status, detail, task_id,
  sequence)`
- `workflow_events(id, run_id, node_id, type, at, attempt, task_id, detail,
  pass, summary, error, question, answer, sequence)`
- `workflow_event_artifacts(event_id, sequence, kind, title, content, path,
  url)`

Draft graphs use `workflow:<id>:revision:<revision>` IDs. Run snapshots use
`workflow-run:<run-id>`, so historical runs do not change when a draft changes.

## Persistence Flow

`SqliteAppStore.save()` validates the existing V4 envelope, splits selected
domains into rows, and stores out-of-scope fields in `app_aux_state`. It replaces
the selected aggregate tables inside one `BEGIN IMMEDIATE` transaction.

`SqliteAppStore.load()` joins the normalized rows and reconstructs the V4
envelope expected by AgentHub. This compatibility boundary lets storage change
without coupling the migration to renderer or runtime changes.

## Migration

On first open, schema version 2 creates normalized tables. If a legacy
`app_state` V4 row exists and normalized tables are empty, it is imported in one
transaction. The old table is renamed to `legacy_app_state` only after a
successful import and retained as a rollback snapshot. Older payload versions
are not imported, matching the current product decision not to support old data.

## Failure Handling

- `foreign_keys`, WAL, and a busy timeout are enabled for every connection.
- Save rolls back on any statement failure.
- Malformed JSON in opaque columns fails the load instead of silently returning
  a partially restored application state.
- Foreign keys cascade from chat/workflow/run parents to owned records.

