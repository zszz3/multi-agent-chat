# Official and User Resource Catalogs

## Goal

Separate app-provided workflows and skills from user-owned workflows and skills
in storage, loading, permissions, and presentation. The application must never
flatten both origins into an untyped collection before applying behavior.

This is a clean cut. Existing workflow and imported-skill data does not require
migration or compatibility handling.

## Ownership Model

"Official" means maintained in this open-source repository and shipped by the
application. Contributors may change official workflow JSON and skill files via
normal code changes and pull requests. Runtime immutability only prevents an app
user from mutating those source definitions through the UI or IPC API.

"User" means created or imported through a running application and owned by the
local user.

## Storage Boundary

### `official-catalog.db`

`official-catalog.db` is a generated, read-only build artifact. Its source of
truth remains the Git-tracked files under `src/shared/bundled-workflows` and
`src/shared/bundled-skills`.

Tables:

- `catalog_metadata`
- `workflow_templates`
- `workflow_template_nodes`
- `workflow_template_edges`
- `skill_templates`

The catalog build is deterministic. Development and production builds regenerate
the database from repository assets, so changing an official resource is a code
change rather than an application data migration.

### `app.db`

`app.db` remains writable and contains:

- user workflows, graph versions, nodes, edges, runs, and events;
- user-imported skill metadata and content;
- per-user overrides for official workflow nodes;
- runs created from official workflow templates;
- chats, runtime sessions, and other user state.

New tables:

- `user_skills`
- `official_workflow_node_overrides`

Official workflow runs store an immutable graph snapshot in the existing run
graph tables. They never create mutable copies of official definitions.

## Workflow Behavior

Official workflow topology comes only from `official-catalog.db`:

- nodes cannot be added, removed, renamed, or repositioned;
- edges cannot be added, removed, or rewired;
- workflow title and objective are read-only;
- agent nodes allow overrides for configured agent, model, and prompt;
- start and end nodes have no editable override fields.

Overrides are keyed by `(template_id, node_id)` in `app.db`. Missing overrides
fall back to the official definition. Starting a run resolves the official graph
plus current overrides and persists that resolved graph as the run snapshot.

User workflows continue using the existing mutable workflow tables. Their
topology, positions, agent selection, model selection, and prompts remain fully
editable.

Official and user workflows share the runtime engine and run/event tables, but
have separate catalog-loading APIs and separate UI sections.

## Skill Behavior

Official skills are read from `official-catalog.db`. They are viewable and may be
installed into supported agent skill directories, but cannot be edited, deleted,
or replaced from inside the application.

User skills are imported into `app.db`. They are read-only in the application,
but may be deleted or re-imported. Re-import replaces the matching user skill in
one transaction.

The renderer receives `officialSkills` and `userSkills` separately. It does not
receive a pre-merged `templates` array. Installation commands take both origin
and ID so an official and user skill may safely use the same ID.

## APIs And Services

Main-process boundaries:

- `OfficialCatalog`: read-only access to official workflows and skills.
- `UserWorkflowStore`: mutable user workflow definitions and all workflow runs.
- `UserSkillStore`: import, list, delete, and replace user skills.
- `OfficialWorkflowOverrides`: read and write permitted node overrides.

IPC commands are origin-specific. Mutation commands validate origin in the main
process; hiding a button in the renderer is not considered authorization.

The workflow runtime accepts a resolved workflow definition and remains unaware
of catalog origin. This keeps execution shared while storage and editing rules
remain explicit.

## User Interface

Workflow navigation has two sections:

- Official workflows
- My workflows

Official workflow canvases remain inspectable but do not expose drag, add,
delete, or edge-edit interactions. Agent-node cards expose only Agent, Model, and
Prompt controls. User workflows retain the full editor.

The Skills page has two sections:

- Official skills
- My skills

Official skill detail exposes view, source link, translation, and install.
User-skill detail exposes view, source information, delete, re-import, and local
install. Search/import always targets My skills and never mutates the official
catalog.

## Failure Handling

- Failure to open or validate `official-catalog.db` is a startup error with an
  explicit diagnostic; the app must not silently present an empty official
  catalog.
- A stale override referencing a removed official node is ignored and may be
  cleaned from `app.db`; it never blocks loading the template.
- User-skill import validates required frontmatter and content before replacing
  an existing row.
- Official-resource mutation requests are rejected in the main process.

## Testing

- Catalog build tests compare source asset counts and key fields with generated
  database rows.
- Store tests prove official and user resources come from different databases.
- Workflow tests prove official topology mutations are rejected while agent,
  model, and prompt overrides persist.
- Run tests prove resolved official graphs are snapshotted before execution.
- Skill tests prove official deletion/replacement is rejected and user
  deletion/re-import succeeds.
- Renderer tests prove separate sections and origin-specific controls.

