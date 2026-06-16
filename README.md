# Multi Agent Chat

Local Electron app for chatting with agent runtimes, running tasks, building workflow DAGs, and exposing configured agents through a local MCP bridge.

## Features

- Chat with Codex CLI, Claude Code CLI, or direct API providers.
- Configure reusable agents from provider presets.
- Run one-off tasks with visible execution history.
- Build and run workflow graphs from a chat-first planning flow.
- Preview generated workflow output documents from inside the app.
- Expose configured agents and workflow tools to other local agents through MCP.
- Persist local chats, tasks, teams, workflows, and configured agents in SQLite.

## Runtime Types

The app supports three runtime families:

- `Codex`: starts the local `codex` CLI through its app-server protocol.
- `Claude Code`: starts the local `claude` CLI in streaming JSON mode.
- `API`: calls provider APIs directly from the app. OpenAI-compatible providers use `/chat/completions`; Anthropic uses `/messages`.

Provider presets include OpenAI, Anthropic, DeepSeek, GLM, Kimi, LongCat, MiMo, OpenRouter, GitHub Models, Together, Novita, NVIDIA, SiliconFlow, Bailian, Volcengine, Hunyuan, MiniMax, Azure OpenAI, and custom API endpoints.

Provider keys are configured once per provider preset and reused by agents that select the same preset.

## Requirements

- Node.js 22.13 or newer
- npm
- Optional CLIs:
  - `codex` on `PATH`, or set `CODEX_PATH=/path/to/codex`
  - `claude` on `PATH`, or set `CLAUDE_PATH=/path/to/claude`

The app opens without Codex or Claude installed. CLI-backed chats and tasks require the matching CLI. API-backed agents require a provider key.

## Install

```bash
npm install
```

## Run In Development

```bash
npm run dev
```

This starts Electron through `electron-vite` and opens the desktop app. If the default Vite port is occupied, the dev server automatically picks the next available port.

## Build

```bash
npm run build
```

The built app files are written to `out/`.

## Test

```bash
npm test -- --run
```

For type checking only:

```bash
npm run typecheck
```

## Configure Agents

Open the Config page in the app:

1. Click `New agent`.
2. Choose a CLI/runtime: `Codex`, `Claude Code`, or `API`.
3. Choose a provider preset.
4. Enter the provider key if the preset needs one.
5. Pick a model and write the agent prompt.
6. Open `Advanced provider settings` only when you need to change base URL, headers, provider ID, or model catalog details.

Each configured agent owns its provider/channel settings. Provider credentials are stored once per preset and reused locally.

## Workflows

The Workflow page starts as a conversation. Describe the goal, answer the planning questions, then let the app generate a workflow graph. You can edit the graph, run it, monitor progress, and preview output documents produced under the workflow storage directory.

## Local MCP Server

Start the desktop app first:

```bash
npm run dev
```

Then point an MCP client at:

```bash
npm run mcp
```

The MCP process uses stdio and connects to the running Electron app through a local authenticated bridge on `127.0.0.1`. The bridge port is dynamic; discovery metadata is written under the app data directory while the app is running.

Available MCP-facing capabilities include listing configured agents and operating workflow drafts/runs.

## Local Data

The app stores local chat, task, team, workflow, and configured-agent history in `app.db` under Electron's `userData` directory. Model/provider channel configuration is stored in `model-channels.json`.

On first launch with SQLite enabled, the app imports legacy history from `app-chats.json` if `app.db` is empty. Use the in-app clear button to remove local history when needed.

Provider keys are stored locally by the renderer for development convenience. For production use, move credentials into an OS keychain or another secure secret store.

