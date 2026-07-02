# Claude Interactive Runtime Plan

Date: 2026-07-02
Branch: `feat/claude-interactive-runtime`
Status: Phase 1 implemented on this branch; Phase 2 planned
Scope: Claude chat slash-command routing, renderer hints, and the follow-up boundary for a real interactive runtime

## Goal

Let Claude chat sessions accept native slash commands as normal conversation input unless the user explicitly asks for an app-local command under `/app ...`.

Phase 1 is intentionally limited to chat routing and UX clarity. Phase 2 is the later PTY-backed interactive runtime.

## Phase 1

### Todo

- [x] Add an explicit slash-command routing decision in the main-process chat send path.
- [x] Keep `/app help`, `/app status`, `/app models`, and `/app plugins` as app-local commands.
- [x] Forward non-`/app` slash prompts in Claude chats into the normal Claude conversation flow.
- [x] Keep Codex compatibility aliases `/status`, `/models`, `/plugins`, and `/help`, while also supporting `/app ...`.
- [x] Make renderer slash suggestions runtime-aware so Claude only suggests `/app`.
- [x] Clarify local help text so Claude passthrough behavior and Codex compatibility behavior are explicit.
- [x] Validate the change with `npm run typecheck` and focused vitest coverage.

### Acceptance Criteria

- In Claude chats, `/help`, `/config`, `/clear`, and other non-`/app` slash inputs are forwarded to Claude Code unchanged and participate in the normal session history.
- In Claude chats, `/app help`, `/app status`, `/app models`, and `/app plugins` stay local and produce `local: true` messages only.
- Claude chat passthrough continues to reuse the existing `sessionId + --resume` flow rather than opening a separate interaction backend.
- In Codex chats, `/status`, `/models`, `/plugins`, and `/help` still work as compatibility aliases, while `/app ...` is the stable namespace for app-local commands.
- Renderer slash suggestions return only `/app` for Claude and `/app` plus the Codex compatibility aliases for Codex.
- Focused validation is green for typechecking and the targeted chat-routing tests.

### Out Of Scope

- No PTY or terminal emulation layer.
- No `node-pty` dependency.
- No change to task, workflow, or agent-test Claude execution paths.
- No new shared public types for Phase 1.

## Phase 2

### Todo

- [ ] Introduce a dedicated PTY-backed Claude interactive runner.
- [ ] Stream terminal I/O incrementally instead of relying on the current one-shot runner shape.
- [ ] Support interrupt, continue, and approval or permission prompt handling.
- [ ] Add any required runtime-capability or message-origin metadata only when the PTY boundary is real.
- [ ] Extend verification to interactive-session lifecycle coverage after the backend exists.

### Acceptance Criteria

- Claude chat can hold a real terminal-style interactive session with incremental output and follow-up input.
- Interrupt and continue actions can be issued without losing the underlying Claude session.
- Approval or permission prompts can be surfaced and acted on in-app instead of being dropped by the one-shot runner.
- Phase 2 does not regress Phase 1 slash passthrough behavior or the `/app` local-command namespace.
