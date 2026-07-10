# OpenClaw Integration

Last updated: 2026-07-10

OpenClaw is integrated through its documented agent CLI and Gateway-backed ACP bridge.

| Product surface | Mode | OpenClaw surface |
| --- | --- | --- |
| Chat | `interactive` | `openclaw acp` |
| Task | `oneshot` | `openclaw agent --session-key ... --message ... --json` |
| Workflow | `oneshot` | `openclaw agent --session-key ... --message ... --json` |
| Channel test | `oneshot` | `openclaw agent --session-key ... --message ... --json` |

Each one-shot call receives an isolated session key and optionally passes `--model provider/model`. The runner accepts both direct embedded JSON payloads and Gateway-wrapped result payloads, while keeping stdout strict JSON and treating diagnostics as stderr.

Interactive chat starts the official ACP bridge. It supports new and resumed Gateway sessions, streaming messages/thoughts/tools, cancellation, and exec permission requests. The native Gateway-backed session id is persisted in the opaque runtime conversation envelope for detach and app-restart recovery.

OpenClaw ACP currently does not expose model selection. The `openclaw-default` preset therefore uses an optional `provider/model` only for one-shot surfaces; interactive chat uses the model configured on the OpenClaw Gateway session. A running/configured local or remote Gateway is required by the ACP bridge.

The runtime does not declare exact single-session cleanup. OpenClaw documents `sessions cleanup` as store maintenance and ACP `session/close` as bridge-state release; neither is represented as deletion of the selected app chat's durable Gateway session.

## Verification Boundary

Subprocess tests cover one-shot argument construction and response parsing. ACP tests cover creation, streaming, persistence, detach, resume, cancellation through the shared client, approvals, and the deliberate absence of `session/set_model`. The `openclaw` executable was unavailable on the implementation machine, so release validation should still run an authenticated CLI turn and an ACP conversation against a real Gateway.

## Official References

- [OpenClaw agent CLI](https://docs.openclaw.ai/cli/agent)
- [OpenClaw ACP bridge](https://docs.openclaw.ai/cli/acp)
- [OpenClaw Gateway protocol](https://docs.openclaw.ai/gateway/protocol)
- [OpenClaw repository](https://github.com/openclaw/openclaw)
