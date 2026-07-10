# Main Process Development Guide

## Scope

`src/main/` is the backend of the Electron app. It owns lifecycle, persistence, orchestration, process execution, and all business-state mutation.

If a renderer feature changes the actual behavior of chats, tasks, workflows, agents, or schedules, the real implementation usually belongs here.

## Key Files

- `index.ts`: Electron bootstrap, BrowserWindow creation, IPC registration, local bridge startup
- `agent-hub.ts`: central app state container and domain orchestration layer
- `hub/runtime/executor/agent-executor.ts`: runtime registry aggregator that composes one `createXxxDriver()` builder per runtime
- `hub/runtime/executor/codex/`, `claude/`, `api/`, `hermes/`: runtime-local bundles that own executor, workflow, cleanup, session, and capability assembly for each runtime
- `agents/runtime/runtime-driver.ts`: shared runtime capability and interactive session interfaces plus optional workflow/test/cleanup hooks
- `agents/interactive-session-manager.ts`: per-chat queueing and idle-detach orchestration for interactive runtimes
- `agents/codex-interactive-session.ts`: reusable Codex chat attachment
- `agents/claude-agent-sdk.ts`: official Claude Agent SDK one-shot adapter
- `agents/claude-agent-sdk-interactive.ts`: official Claude Agent SDK streaming-input helper
- `agents/claude-interactive-session.ts`: reusable Claude chat attachment backed by the official SDK
- `agents/claude-stream.ts`: shared Claude event normalization helpers
- `agents/hermes-runner.ts`: minimal JSON-line CLI adapter for the Hermes proof runtime
- `model-config.ts`: channel normalization, Codex config generation/import, preset-backed config handling
- `provider-balance.ts`: provider balance queries
- `scheduled-workflow-cloud.ts`: cloud sync for scheduled workflows
- `skill-installer.ts`: bundled-skill installation, imported-skill management
- `sqlite-store.ts`: persistence wrapper over `node:sqlite`
- `mcp-bridge.ts`: local HTTP bridge consumed by the MCP server
- `codex-chat-router.ts`: router service for Codex chat integration

## Architectural Role

The main process does four jobs:

1. Boot the desktop app.
2. Expose app capabilities over IPC.
3. Maintain the authoritative app snapshot.
4. Execute long-running work outside the renderer.

The central pattern is:

- `index.ts` receives an IPC request
- it delegates to `AgentHub`
- `AgentHub` mutates state and persists if needed
- `AgentHub` emits a changed snapshot
- `index.ts` pushes the snapshot back to the renderer

## AgentHub

`AgentHub` is the most important file in the repository.

It is responsible for:

- loading persisted state
- tracking configured agents and model channels
- creating/selecting/deleting chats
- running prompts and streaming events into chat sessions
- restoring interactive chat resume state as detached after app restart
- coordinating idle-sweep recovery for attached interactive sessions
- creating/running/stopping tasks
- creating/updating teams and team runs
- managing workflow store and workflow draft
- running workflows and recording workflow run state
- managing scheduled workflow state and runner configuration

When changing business behavior, start here first. Many UI issues are actually state-shape or orchestration issues in `AgentHub`.

## Execution Layer

Runtime execution is split into two styles:

- `oneshot`: one executor per task, workflow, or stateless API call
- `interactive`: one logical chat session with a lazily attached runtime process

The selection boundary lives in `RuntimeAgentExecutorFactory` plus the runtime driver registry. The registry is now an aggregator: each runtime enters through a runtime-local `createXxxDriver()` builder, and the runtime directory owns the concrete workflow, cleanup, session, executor, and capability wiring.

Backends:

- Codex one-shot and interactive paths use `CodexRpcClient`, with chat reuse managed by `CodexInteractiveSession`
- Claude one-shot uses `ClaudeAgentSdkAdapter`, while interactive chat reuse is managed by `ClaudeInteractiveSession` plus `ClaudeAgentSdkInteractive`
- API runtime uses direct `fetch` and stays one-shot only
- Hermes currently stays one-shot and uses `HermesRunner`

`AgentHub` still owns snapshot state plus app-owned `runtimeState` and opaque `runtimeConversation` persistence, but interactive process lifecycle now sits behind `InteractiveSessionManager` and the runtime-specific session helpers under `src/main/agents/`.
Before crossing into `RuntimeRouter`, upper layers in main now build explicit runtime requests with `runtimeId`, `executionMode`, `continuationPolicy`, and `runtimeConfig.model` instead of relying on generic `sessionId` semantics or runtime-native payload parsing.
Workflow invocation, runtime-channel testing, and session-artifact cleanup now dispatch through `RuntimeDriver` hooks supplied by runtime-local builders, so future runtimes can onboard without adding new product-level `if (runtimeId === "...")` branches in `AgentHub`.

This layer should stay runtime-agnostic from the perspective of higher-level features. Chat, task, and workflow code should not duplicate provider-specific logic.

When adding runtime behavior:

- add or update the runtime-local bundle under `src/main/hub/runtime/executor/<runtime>/`
- register the runtime once from `hub/runtime/executor/agent-executor.ts`
- avoid leaking provider-specific branching into unrelated task or workflow code

## IPC Registration

All desktop commands visible to the renderer are registered in `src/main/index.ts` through `ipcMain.handle(...)`.

Examples:

- `chat:*`
- `task:*`
- `team:*`
- `workflow:*`
- `scheduled-workflows:*`
- `skills:*`
- `model-channels:*`

When adding a new renderer action:

1. define or reuse request/response types in `src/shared/types.ts`
2. add an IPC handler in `src/main/index.ts`
3. implement the behavior in `AgentHub` or another focused main-process module
4. expose the new method from `src/preload/index.ts`

Keep `index.ts` thin. Route logic belongs in helper modules or `AgentHub`, not inside the IPC handler body.

## Persistence

The main process owns persistence loading and saving.

Key persistence points:

- `hub.loadModelChannels(...)`
- `hub.loadPersistedState(...)`
- `SqliteAppStore`

Persistence is snapshot-centric, not relational-domain-centric. That means:

- changing a type in `AppSnapshot` often has persistence impact
- migrations are more about payload compatibility than about many SQL tables

When evolving persisted shapes:

- add backward-tolerant parsing
- preserve optional fields when possible
- avoid breaking older serialized state without a migration path

## Scheduled Workflows

Scheduled workflows are split between local store and cloud synchronization.

`index.ts` handles:

- runner registration defaults
- cloud schedule refresh
- SSE-like event connection callbacks
- event forwarding to the renderer

This is operational code, so robustness matters more than elegance. Changes here should preserve:

- reconnect safety
- status transitions
- snapshot consistency

## Skills and Managed Assets

Bundled and imported skills are operationally managed in the main process.

The main process handles:

- online skill search requests
- importing skills into managed storage
- installing bundled skills into local agent-specific directories
- uninstalling managed links

Renderer pages should stay declarative here. File-system effects belong in `src/main/skill-installer.ts`.

## Testing Focus

Most important tests in this layer are already colocated:

- `agent-hub.test.ts`
- `mcp-bridge.test.ts`
- `model-config.test.ts`
- `provider-balance.test.ts`
- `scheduled-workflow-cloud.test.ts`
- runtime helper tests under `src/main/agents/`

When editing `AgentHub`, prioritize targeted tests around:

- snapshot mutation correctness
- persisted state compatibility
- runtime event handling
- workflow graph and run state transitions

## Development Advice

- treat `AgentHub` as the state authority
- keep IPC handlers shallow
- keep runtime-specific code behind helpers or executor classes
- keep request and response contracts in `src/shared`
- do not move business logic into the renderer just because the trigger starts in the UI
