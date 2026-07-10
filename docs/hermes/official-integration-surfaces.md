# Official Hermes Integration Surfaces

Last updated: 2026-07-10

This note summarizes official Hermes Agent integration surfaces relevant to this repository.

## Official Sources

- [CLI Commands Reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- [Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
- [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- [Using Hermes as a Python Library](https://hermes-agent.nousresearch.com/docs/guides/python-library)
- [Hermes Agent GitHub repository](https://github.com/NousResearch/hermes-agent)

## Surface Matrix

| Surface | Best fit | One-shot | Interactive | Transport | Notes |
| --- | --- | --- | --- | --- | --- |
| `hermes -z` | shell scripts, CI, parent-process calls | Yes | No | subprocess stdio | final text only |
| `hermes chat -q` | local one-shot chat calls | Yes | Limited | subprocess stdio | still CLI-oriented |
| Python `AIAgent` | in-process Python embedding | Yes | Multi-turn via history | in-process Python | no external process boundary |
| API server `/v1/responses` | HTTP clients wanting stateful turns | Yes | Pseudo-interactive | HTTP + SSE | stores response chain |
| API server `/v1/runs` | long runs with attach/detach and progress | Yes | Yes | HTTP + SSE | approvals and stop supported |
| API server `/api/sessions/*` | remote session management | Yes | Yes | HTTP + SSE | fork, stream, metadata, history |
| `hermes acp` | IDE/editor integrations | No | Yes | JSON-RPC over stdio | best for ACP-capable editors |
| TUI gateway JSON-RPC | custom hosts needing full feature coverage | Can be used | Yes | JSON-RPC over stdio or WebSocket | richest machine-facing control plane |

## One-Shot Interfaces

### 1. `hermes -z`

The CLI reference documents `hermes -z <prompt>` as the clean scripted one-shot path. It is designed to return only the final answer text without banners, spinners, tool previews, or extra session output.

Implication for this repo:

- Good fit if we only need final assistant text.
- Poor fit if we need token deltas, tool progress, approvals, or structured session state.

### 2. `hermes chat -q`

The CLI reference documents `hermes chat -q` as the one-shot prompt mode under the normal chat command. This is closer to a local chat invocation than `-z`, but it is still a CLI-facing surface rather than a documented JSON protocol.

Implication for this repo:

- Possible subprocess bridge for a transitional one-shot integration.
- We should not assume a stable event protocol unless upstream documents one.

### 3. Python `AIAgent`

The Python library guide documents direct import of `run_agent.AIAgent`, with:

- `chat()` for simple one-shot calls
- `run_conversation()` for full result metadata
- `conversation_history` for multi-turn continuity

Implication for this repo:

- Strong option if we are willing to embed Hermes through Python rather than a CLI or HTTP boundary.
- Not a direct fit for this Electron app unless we want a Python sidecar or service.

## Interactive Interfaces

### 1. ACP

The programmatic integration guide documents `hermes acp` as a stdio JSON-RPC server for ACP-compatible IDE clients. Officially exposed capabilities include session creation, prompt submission, streaming chunks, tool-call events, permission requests, session fork, cancellation, and authentication.

Implication for this repo:

- Best fit if we want Hermes interactive behavior to look like editor-native chat attachments.
- Likely simpler than inventing a custom CLI parser if ACP semantics already match our interactive session contract.

### 2. TUI Gateway JSON-RPC

The programmatic integration guide describes the TUI gateway protocol as the richest custom-host surface. It exposes session methods, interrupt, branch, history, status, approval responses, clarify responses, command dispatch, environment reloads, subagent controls, and streaming lifecycle events.

Notable documented method and event families include:

- methods: `prompt.submit`, `session.create`, `session.interrupt`, `session.history`, `session.branch`, `approval.respond`, `command.dispatch`
- events: `message.delta`, `message.complete`, `tool.start`, `tool.progress`, `tool.complete`, `approval.request`, `clarify.request`

Implication for this repo:

- This is the closest official machine-facing match to our current `interactive` runtime abstraction.
- If we need attach/detach, approvals, interrupts, resume, and richer streaming, this is the most complete non-IDE surface.

### 3. API Server Runs And Sessions

The API server docs describe two interactive-friendly HTTP layers:

- `/v1/runs*`
  - create a run
  - poll status
  - stream events over SSE
  - stop a run
  - answer approval requests
- `/api/sessions/*`
  - create/list/read/delete sessions
  - fork sessions
  - run a synchronous turn
  - stream a single turn over SSE
  - inspect message history

The same docs also expose `GET /v1/capabilities` as a machine-readable discovery endpoint for feature flags and endpoint support.

Implication for this repo:

- Best HTTP-native option.
- Good fit if we want interactive control without building ACP or JSON-RPC plumbing first.
- Likely easier to host behind an existing local Hermes gateway than to reverse-engineer a CLI session protocol.

## Session And Continuation Details

Official docs show several continuation mechanisms:

- `previous_response_id` on `/v1/responses` for stateful chained turns
- named `conversation` values on `/v1/responses`
- optional `session_id` on `/v1/runs`
- `X-Hermes-Session-Id` and `X-Hermes-Session-Key` headers on API surfaces
- Python `conversation_history`
- ACP and TUI gateway session lifecycle methods

Implication for this repo:

- Hermes continuation is richer than the current local payload shape `{ sessionId }`.
- We should expect different state carriers depending on the surface we choose.

## Repository Implementation

The implementation now follows the documented CLI and ACP surfaces:

- `src/main/agents/hermes/hermes-runner.ts` runs `hermes -z <prompt>` and adds `--model` only for a non-default selection.
- `src/main/agents/acp/acp-interactive-client.ts` implements the reusable official ACP client boundary over stdio.
- `src/main/hub/runtime/executor/hermes/hermes-session.ts` owns Hermes attach, prompt, interrupt, detach, and resume lifecycle.
- `src/main/hub/runtime/executor/hermes/create-hermes-driver.ts` assembles one-shot, interactive, workflow, test, codec, and cleanup behavior behind one runtime-local builder.
- `src/main/agents/runtime/runtime-state-codec.ts` validates the persisted ACP session id and app-owned context.
- `src/main/hub/runtime/executor/hermes/hermes-cleanup.ts` deletes native session artifacts with the documented CLI command.

The chosen mapping is intentionally split:

1. Tasks, workflows, and channel tests use `hermes -z` because those surfaces need a bounded final answer, not a durable attachment.
2. Chat uses `hermes acp` because ACP provides session creation/resume, streaming updates, cancellation, tools, and permission requests.
3. The persisted envelope stores the native ACP session id, while transport-specific data remains hidden below the runtime codec/session boundary.

The implementation no longer relies on an undocumented `hermes run --json` command.

## Remaining Release Verification

Automated tests exercise the ACP wire contract with a fake subprocess and cover the runtime driver, session lifecycle, codec, cleanup, and one-shot argument construction. A real Hermes binary was unavailable on the implementation machine, so release validation should still perform a live authenticated one-shot and interactive smoke test.
