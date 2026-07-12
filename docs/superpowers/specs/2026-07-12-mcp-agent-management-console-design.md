# MCP Agent Management Console Design

## Goal
Turn the MCP page into an agent-scoped management console. Users select one agent, inspect installed MCP servers, diagnose configuration readiness, manage configuration, and add a server from a contextual library drawer.

## Confirmed UX
- Agent management console is the primary page mode.
- The target agent selector sits in the page header and drives all content.
- The left panel contains only MCP servers installed for that agent, with search and status filters.
- The detail panel defaults to Overview, with Tools, Configuration, and Activity tabs.
- V1 prioritizes install, uninstall, configuration, and diagnostics; it does not start or stop individual stdio processes.
- The MCP library is a right-side drawer opened by Add MCP and remains scoped to the selected agent.

## Data and Status Model
- `Healthy`: managed configuration exists and all catalog-required configuration is present.
- `Needs setup`: a required path or token is absent.
- `Error`: the managed config block is missing, incomplete, or structurally invalid.
- `Unknown`: not yet diagnosed in this view.
- Diagnostics are configuration diagnostics, not a fabricated live stdio health check. The UI states this distinction and tells users that a restarted agent session applies changes.

## Layout
Header: title/description, target-agent select, summary counters, Add MCP.

Main area is a 32/68 split:
- Installed MCP list: search, status filter, compact server cards and a clear empty state.
- Details: identity header, status, connection check/config/uninstall actions, four tabs, contextual status/permission/configuration data.

The Add MCP drawer contains library search, categories, capability prerequisites, setup fields, and an install confirmation action scoped to the selected agent.

## Non-goals
- Real-time MCP process control or a dedicated server process.
- Streaming invocation logs. Activity initially records the most recent client-side configuration diagnostic and install/remove action for the open page session.
- Editing arbitrary unmanaged `config.toml` blocks.