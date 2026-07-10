# Hermes Integration Notes

Last updated: 2026-07-10

This directory tracks external research for integrating [Hermes Agent](https://hermes-agent.nousresearch.com/docs) into this repository.

## What We Confirmed

Hermes has official external integration docs.

- One-shot entry points are documented through:
  - [`hermes -z`](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) for plain-text scripted calls
  - [`hermes chat -q`](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) for one-shot chat runs
  - the [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) for HTTP and SSE clients
  - the [Python library](https://hermes-agent.nousresearch.com/docs/guides/python-library) for in-process embedding
- Interactive entry points are documented through:
  - [`hermes acp`](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration) for ACP-compatible IDE clients
  - the [TUI gateway JSON-RPC protocol](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration) for custom hosts that need session control, approvals, slash commands, and streaming events
  - the [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) runs and sessions APIs for HTTP-based session control

## Recommended Mapping For This Repo

If we want both `oneshot` and `interactive`, the cleanest mapping is:

- `oneshot`
  - minimal CLI bridge: `hermes -z`
  - richer local subprocess bridge: `hermes chat -q --quiet`
  - more stable external integration surface: API server `/v1/responses` or `/v1/runs`
- `interactive`
  - IDE-style integration: `hermes acp`
  - full custom-host integration: TUI gateway JSON-RPC
  - HTTP fallback for web/native UI control: API sessions and runs endpoints

## Important Gap vs Current Repo

Current repository assumptions still model Hermes as a minimal one-shot CLI proof runtime.

- The code currently detects Hermes via `HERMES_PATH` in [src/main/agents/runtime/detect.ts](/Users/pengjie.zhai/.codex/worktrees/e685/multi-agent-chat/src/main/agents/runtime/detect.ts).
- One-shot execution currently assumes `hermes run --json ...` in [src/main/agents/hermes/hermes-runner.ts](/Users/pengjie.zhai/.codex/worktrees/e685/multi-agent-chat/src/main/agents/hermes/hermes-runner.ts).
- Driver registration still exposes Hermes as one-shot only in [src/main/hub/runtime/executor/agent-executor.ts](/Users/pengjie.zhai/.codex/worktrees/e685/multi-agent-chat/src/main/hub/runtime/executor/agent-executor.ts).

Based on the official docs, that local contract is incomplete:

- The official CLI reference documents `hermes chat`, `hermes -z`, `hermes acp`, and `hermes gateway`, but it does not document a top-level `hermes run` command.
- The official programmatic integration guide says Hermes exposes three supported external protocols: ACP, TUI gateway JSON-RPC, and the API server.
- Interactive Hermes is a first-class concept in official docs, but our repo currently has no Hermes interactive session implementation.

The statement about `hermes run --json` not being an official surface is an inference from the official CLI and integration docs rather than a direct denial page. We should treat the current runner as a local proof adapter until we verify a real machine-facing CLI protocol in upstream source or docs.

## Files In This Folder

- [official-integration-surfaces.md](/Users/pengjie.zhai/.codex/worktrees/e685/multi-agent-chat/docs/hermes/official-integration-surfaces.md): detailed notes on official Hermes interfaces, capabilities, and repo impact
