# Multi Agent Chat Architecture Overview

## 1. Project Positioning

Multi Agent Chat is a local Electron desktop application that puts several agent usage modes into one workstation:

- direct chat with local CLIs such as Codex and Claude Code
- API-based agents backed by OpenAI-compatible or Anthropic-compatible providers
- reusable configured agents
- task execution and tracking
- workflow authoring and workflow execution
- local MCP exposure for external clients

The app is not a thin chat shell. Its center of gravity is orchestration: model channels, persisted app state, workflow graph execution, and desktop-local capability bridging.

## 2. Top-Level Structure

The repository is split into five source modules under `src/`:

```text
src/
  main/      Electron main process, persistence, orchestration, IPC handlers
  preload/   Safe bridge from renderer to main process
  renderer/  React application and feature pages
  shared/    Cross-layer types, presets, graph helpers, skill metadata
  mcp/       Standalone MCP server that talks to the running desktop app
```

Build orchestration lives in `electron.vite.config.ts`:

- `main` builds to `out/main`
- `preload` builds to `out/preload`
- `renderer` builds from `src/renderer` to `out/renderer`
- bundled skills from `src/shared/bundled-skills` are copied to `out/shared/bundled-skills`

## 3. Runtime Architecture

The runtime path is:

1. Electron boots in `src/main/index.ts`.
2. The main process creates an `AgentHub` instance and loads persisted state.
3. The main process registers IPC handlers and creates the browser window.
4. `src/preload/index.ts` exposes a typed `window.multiAgentChat` API.
5. `src/renderer/src/main.tsx` mounts the React app.
6. `src/renderer/src/App.tsx` fetches the initial snapshot and renders feature pages.
7. Renderer actions call preload methods, preload forwards them to IPC, and the main process mutates `AgentHub`.
8. `AgentHub` emits snapshot updates, and the main process pushes them back to the renderer through `snapshot:changed`.

This gives the app a mostly unidirectional state flow:

```text
Renderer UI action
  -> preload API
  -> ipcRenderer.invoke
  -> ipcMain.handle
  -> AgentHub state mutation / execution
  -> snapshot update
  -> BrowserWindow webContents.send("snapshot:changed")
  -> renderer state refresh
```

## 4. Main Architectural Responsibilities

### Main Process

`src/main` owns the operational backend of the desktop app:

- Electron app lifecycle
- BrowserWindow creation
- app-level persistence
- agent execution
- task execution
- workflow management
- scheduled workflow cloud integration
- local MCP bridge hosting
- skill installation and imported-skill management

The key entry files are:

- `src/main/index.ts`: bootstraps Electron, loads state, registers IPC, starts local services
- `src/main/agent-hub.ts`: central in-memory state container plus orchestration logic
- `src/main/agent-executor.ts`: runtime driver registry, one-shot execution bridge, and driver-owned workflow or runtime-test dispatch
- `src/main/agents/runtime-driver.ts`: shared runtime capabilities, interactive session contracts, and optional workflow/test/cleanup hooks
- `src/main/agents/interactive-session-manager.ts`: per-chat interactive queue plus central idle-detach sweep
- `src/main/agents/codex-interactive-session.ts`: long-lived Codex chat attachment boundary
- `src/main/agents/claude-interactive-session.ts`: shared Claude chat attachment boundary
- `src/main/agents/claude-transport-selection.ts`: Claude `stream-json` vs `runner` selection plus the reserved future `sdk` slot
- `src/main/agents/claude-stream-json-bindings.ts`: official Claude package-backed `stream-json` compatibility binding layer
- `src/main/agents/claude-stream-json-events.ts`: normalization of package-backed Claude `stream-json` events into shared chat events
- `src/main/agents/hermes-runner.ts`: minimal JSON-line CLI adapter proving the future-runtime onboarding path
- `src/main/sqlite-store.ts`: small SQLite persistence wrapper

### Preload

`src/preload/index.ts` is a narrow security boundary. It exposes a typed desktop API to the renderer and hides direct Electron IPC from React components.

### Renderer

`src/renderer/src` is the user-facing app. It is a React SPA inside Electron rather than a multi-window desktop UI. `App.tsx` still owns global shell state, but feature pages have already been extracted under `pages/`.

### Shared

`src/shared` contains all contracts that must stay consistent across layers:

- TypeScript interfaces for snapshots, agents, tasks, workflows, and schedules
- model and provider preset helpers
- workflow graph parsing and validation
- bundled skill loading and online skill metadata

### MCP

`src/mcp/server.ts` is a separate Node entry point started with `npm run mcp`. It reads a local discovery file, connects to the desktop app's bridge endpoint, and exposes selected app capabilities as MCP tools.

## 5. State Model

The central state object is an `AppSnapshot`, defined in `src/shared/types.ts` and produced by `AgentHub`.

Important state domains include:

- configured agents
- model channels
- chats
- tasks
- teams
- workflow store and workflow draft
- scheduled workflow store and runner status
- runtime availability
- current working directory

The renderer treats this snapshot as its source of truth. Instead of maintaining a second business-state store in the UI, most mutations go through the main process and return an updated snapshot.

## 6. Persistence Model

Persistence is intentionally simple:

- `app.db`: application state store in SQLite
- `app-chats.json`: chat history persistence path loaded by `AgentHub`
- `model-channels.json`: channel/provider configuration persistence path loaded by `AgentHub`
- `.multi-agent-chat/workflows/...`: workflow run outputs and context stored in the active work directory

`src/main/sqlite-store.ts` uses `node:sqlite` with a single `app_state` table storing a serialized payload. This is pragmatic and easy to evolve, but it means schema-level querying is not the main storage pattern. Most domain changes are serialized through the app snapshot.

## 7. Agent Execution Model

The app supports four runtime families:

- `codex`
- `claude`
- `api`
- `hermes`

Execution is delegated through a thin driver registry in `src/main/agent-executor.ts`.
That registry now owns not only one-shot executors, but also runtime-specific workflow invocation, runtime-channel testing, and session-artifact cleanup hooks.

The main process now supports two execution styles:

- `oneshot`: one request per task, workflow, or stateless API call
- `interactive`: one logical chat session with a lazily attached runtime process

Each runtime still has a different backend:

- Codex: RPC-style interaction through `CodexRpcClient` plus `CodexInteractiveSession` for reusable chat attachment
- Claude: shared `ClaudeInteractiveSession` plus a selectable interactive transport
- default Claude backend: package-backed `stream-json` compatibility transport through `claude-stream-json-bindings.ts`
- conservative Claude fallback: `runner` transport through `ClaudeRunner`
- future Claude backend: a true official programmatic SDK transport is reserved for the `sdk` selector and is not implemented on the current package surface
- API: direct HTTP request to provider-compatible endpoints
- Hermes: minimal one-shot JSON-line CLI runner through `src/main/agents/hermes-runner.ts`

`AgentHub` remains the state authority. It persists logical chat identity, runtime resume metadata, and structured approval or user-input request lifecycles, restores interactive chats in a detached state after app restart, downgrades abandoned live requests to non-live state, and lets `InteractiveSessionManager` own serialized per-chat execution and idle sweeping.

Claude `stream-json` interaction events are normalized in `src/main/agents/claude-stream-json-events.ts` before they reach shared chat history.
Interactive reconfigure classification lives in `src/main/agents/session-reconfigure.ts`, and chat state can persist an optional per-chat `channelId` override instead of treating the configured-agent channel as immutable forever.
The same `RuntimeDriver` contract now proves future-runtime onboarding by letting Hermes plug workflow, test, and cleanup behavior in at the driver layer instead of reopening `AgentHub`.

The same high-level concepts are reused across chat, task, and workflow execution:

- configured agent
- channel
- model
- work directory
- session id
- event stream

This is one of the project’s strongest structural decisions: the runtime abstraction is centralized in main-process code instead of being reimplemented in each feature.

## 8. UI Composition

Renderer structure is currently:

```text
src/renderer/src/
  app/     cross-feature UI helpers
  pages/   feature pages
  ui/      reusable UI blocks
  App.tsx  app shell and cross-page orchestration
```

Main feature pages:

- `pages/chat`
- `pages/config`
- `pages/runtime`
- `pages/skills`
- `pages/tasks`
- `pages/teams`
- `pages/workflow`
- `pages/schedules`
- `pages/settings`

`App.tsx` still contains global shell composition and a large amount of wiring. The repository already reflects an ongoing extraction strategy: page-specific logic is being pulled into page folders and helper modules, while `App.tsx` remains the application composition root.

## 9. MCP Integration

The MCP design is intentionally decoupled from the renderer:

- desktop app runs normally
- main process starts a local HTTP bridge
- `src/mcp/server.ts` exposes MCP tools over stdio
- tool calls are translated into authenticated HTTP requests against the local bridge

This keeps MCP as an integration surface over the app backend, not a UI concern.

## 10. Typical Change Paths

### Add a new renderer feature

Usually touch:

- `src/shared/types.ts` if state contracts change
- `src/main/agent-hub.ts` if business behavior changes
- `src/main/index.ts` if a new IPC endpoint is needed
- `src/preload/index.ts` to expose the endpoint
- `src/renderer/src/pages/...` and `src/renderer/src/App.tsx` for UI integration

### Add a new provider preset

Usually touch:

- `src/shared/provider-presets.ts`
- `src/shared/models.ts` if fallback models should change
- `src/main/model-config.ts` and runtime env helpers if the provider needs special wiring
- `src/renderer/src/pages/runtime` or `pages/config` if the UI needs new configuration rules

### Add a new workflow behavior

Usually touch:

- `src/shared/types.ts`
- `src/shared/workflow-graph.ts`
- `src/shared/workflow-agent.ts`
- `src/main/agent-hub.ts`
- `src/renderer/src/pages/workflow/*`

### Add a new MCP tool

Usually touch:

- main-process bridge code
- `src/mcp/server.ts`
- `src/shared/types.ts` if request or response contracts are reused

## 11. Current Structural Notes

This codebase already shows a transition from a large monolithic renderer file toward feature-oriented page modules. The split is real but incomplete:

- good: page-level modules now exist under `src/renderer/src/pages`
- good: shared UI helpers moved to `app/` and `ui/`
- still heavy: `src/renderer/src/App.tsx` remains the integration hotspot

On the backend side, the main process is intentionally fat. That is acceptable for this app because it acts as the desktop-local backend. The important design rule is not “thin main process”, but “keep orchestration centralized and typed”.

## 12. Recommended Reading Order For New Contributors

1. `README.md`
2. `docs/architecture-overview.md`
3. `src/shared/types.ts`
4. `src/main/index.ts`
5. `src/main/agent-hub.ts`
6. `src/preload/index.ts`
7. `src/renderer/src/App.tsx`
8. the feature page folder you actually need to change
