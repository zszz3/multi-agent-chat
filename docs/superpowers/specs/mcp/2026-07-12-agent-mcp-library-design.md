# Agent-scoped MCP Library Design

## Goal
Provide a dedicated Skill-style MCP library where users select one configured Agent and install, inspect, update, or uninstall curated MCP servers with one click.

## Catalog
- Multi Agent Chat Workflow: bundled local server and `workflow_create` tools.
- Filesystem: official package with explicit allowed roots.
- GitHub: official server with PAT and read-only default.
- Sequential Thinking: official package without credentials.

## Safety
The app edits `~/.codex/config.toml` only after an explicit install/uninstall action. Every mutation creates a timestamped backup. Managed blocks have deterministic Agent-scoped server names and markers, so unrelated user configuration is preserved. Existing unmanaged blocks with the same name cause a conflict instead of silent overwrite.

## UX
Rename the navigation entry to `Skill`. MCP uses the same library/detail visual hierarchy: searchable catalog, category filters, cards, selected item details, Agent selector, parameter inputs, permission summary, install state, install/update/uninstall actions, and restart notice.
