# Multi Agent Chat

Local desktop app for chatting with Codex and Claude Code, running one-off tasks, and coordinating small agent teams.

## Requirements

- Node.js 22.13 or newer
- npm
- Optional agent CLIs:
  - `codex` on `PATH`, or set `CODEX_PATH=/path/to/codex`
  - `claude` on `PATH`, or set `CLAUDE_PATH=/path/to/claude`

The app can open without the CLIs installed, but chat/task execution needs the matching runtime.

## Install

```bash
npm install
```

## Run In Development

```bash
npm run dev
```

This starts Electron through `electron-vite` and opens the desktop app.

## Build

```bash
npm run build
```

The built app files are written to `out/`.

## Test

```bash
npm test -- --run
```

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

## Local Data

The app stores local chat history and model channel configuration in Electron's `userData` directory. Use the in-app clear button to remove local history when needed.
