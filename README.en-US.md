# Multi Agent Chat

Multi Agent Chat is a local-first Electron Agent workstation. It brings multi-runtime conversations, reusable Agents, task execution, Workflow V2 orchestration, scheduled runs, Skill management, MCP, and evaluation capabilities into a single desktop application.

The project currently targets local development and validation: core state is managed by the Electron main process, and the Renderer calls capabilities through controlled IPC; Agents can come from a local CLI, native session protocol, or OpenAI / Anthropic compatible API.

## Current Capabilities

| Module | Capability |
| --- | --- |
| Chat | Multi-session conversations, working directory, model and channel selection, streaming events, session resume and stop |
| Tasks | One-shot Agent tasks, status filtering, logs, stop, and result viewing |
| Workflow | Workflow V2 planning, DAG validation, parallel scheduling, interactive nodes, script nodes, human-in-the-loop, resume, and output preview |
| Schedules | Local scheduled task configuration and due Workflow runs |
| Skills | Built-in Skills, user Skill categorization, online retrieval, import, and install to local Agent directory |
| Agent | Reusable Agent runtime, provider, model, prompt, tags, and plugin configuration |
| MCP | Local MCP registry, Agent binding, and Workflow planning tool integration |
| Evaluation | Dataset, Evaluator, and Experiment workbench |
| Config | Runtime detection, Provider preset, model catalog, local config import, and connection test |

Currently registered Runtimes:

- Codex
- Claude Code
- API
- Hermes
- OpenCode
- OpenClaw

Capabilities are declared per Runtime; session resume, cleanup, or model switching capabilities are not fabricated to match the interface. When integrating a new Runtime, refer to the [Agent Integration Guide](docs/agent-integration-guide.md).

## Workflow V2

Workflow uses the main chain of "conversation planning → definition validation → user confirmation → plan freezing → execution and resume."

- The graph contains only executable LLM or Script nodes; no placeholder Start / End nodes are used.
- The Scheduler runs only nodes whose dependencies are satisfied, constrained by parallelism, resource locks, and run status.
- Agent nodes support one-shot and interactive sessions; Script nodes use an independent parameter and execution detail panel.
- Script parameters support Argument, Query, Header, Body, Environment, and stdin, including type validation, enum selection, permissions, and risk confirmation.
- Agent-to-Script binding uses explicit upstream nodes, output fields, and type contracts; values are not implicitly taken from Agent `summary`.
- Run status, node status, events, input requests, and resume information are persisted; old frozen plans retain compatible read capability.
- User-visible files should be written to `outputs/<workflowId>/<runId>/` under the current working directory.

Script permission and risk governance are not equivalent to OS-level sandboxing. Before executing untrusted scripts, still review the code, capability declarations, and working directory permissions. The authoritative documentation entry for Workflow is [docs/workflow-v2/README.md](docs/workflow-v2/README.md).

## Quick Start

### Environment Requirements

- Node.js `>= 22.13.0`
- npm
- Electron development environment on Windows, macOS, or Linux
- Install Runtime CLI as needed:
  - `codex`, or set `CODEX_PATH`
  - `claude`, or set `CLAUDE_PATH`
  - `hermes`, or set `HERMES_PATH`
  - `opencode`, or set `OPENCODE_PATH`
  - `openclaw`, or set `OPENCLAW_PATH`

When using only API Runtimes, none of the above CLIs need to be installed.

### Installation and Startup

```bash
npm install
npm run dev
```

`npm run dev` starts the Electron main process, Preload, and Vite Renderer. If the dev server port is occupied, Vite may choose another available port.

### Start Local MCP Server

Keep the desktop application running first, then execute in another terminal:

```bash
npm run mcp
```

The MCP Server communicates with the client via stdio and connects to the Electron bridge listening only on `127.0.0.1` through a local discovery file.

## Development Commands

```bash
# Type check
npm run typecheck

# Full test suite
npm test

# Watch mode for tests
npm run test:watch

# Production build
npm run build
```

Before committing, run at least `npm run typecheck` and tests related to the changes; for changes involving the main chain or shared contracts, run the full test suite and production build.

## Architecture Entry Points

```text
src/main/app/                 Electron startup, windows, IPC, and local bridge
src/main/hub/                 Business orchestration, persistent state, and runtime assembly
src/main/hub/runtime/         Runtime driver and per-Agent executors
src/main/workflows/v2/        Workflow V2 execution, supervision, resume, and script governance
src/preload/                  Controlled APIs callable by the Renderer
src/renderer/src/             React workstation and feature pages
src/shared/                   Cross-process types, Runtime catalog, and Workflow contracts
src/mcp/                      stdio MCP Server
docs/                         Architecture, specs, plans, research, and integration documents
```

For detailed call chains and module boundaries, see the [Current Architecture Overview](docs/architecture-overview.md).

## Local Data and Security

Application state is primarily saved in the Electron `userData` directory:

- `app.db`: chats, Workflows, run records, and application state
- `official-catalog.db`: official Workflow / Skill catalog
- `model-channels.json`: Runtime channel and provider configuration

The local MCP bridge discovery file is usually located at `multi-agent-chat/mcp-bridge.json` under the application data root, recording only local connection information.

The working directory may also contain:

- `.multi-agent-chat/workflows/<workflowId>/`: Workflow run storage
- `outputs/<workflowId>/<runId>/`: user-visible output files

These local states, databases, output files, and API keys should not be committed to Git. Current provider credentials still belong to local development configuration; before production use, migrate them to the system Keychain or a dedicated secret store.

## Documentation

- [Documentation Entry Point](docs/README.md)
- [Current Architecture Overview](docs/architecture-overview.md)
- [Agent Integration Guide](docs/agent-integration-guide.md)
- [Workflow V2 Documentation Entry](docs/workflow-v2/README.md)
- [Authoritative Specs](docs/superpowers/specs/README.md)
- [Implementation Plans](docs/superpowers/plans/README.md)
- [Hermes Integration Materials](docs/hermes/README.md)
- [OpenCode Integration Materials](docs/opencode/README.md)
- [OpenClaw Integration Materials](docs/openclaw/README.md)

Design goals, current implementation, and historical records in the documentation must be clearly distinguished. When judging current behavior, rely on the code, tests, and specs marked as implemented.
