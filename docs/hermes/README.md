# Hermes Integration

Last updated: 2026-07-10

Hermes is integrated through its documented public interfaces:

- one-shot task, workflow, and channel-test execution uses `hermes -z <prompt>` and optional `--model`
- interactive chat starts `hermes acp` and speaks the official Agent Client Protocol (ACP) over newline-delimited JSON-RPC on stdio
- session identity returned by ACP is persisted in the opaque runtime conversation envelope and used with `session/resume` after detach or app restart
- interrupt uses ACP `session/cancel`
- tool, thought, plan, and permission updates are normalized into the shared agent event model
- cleanup uses `hermes sessions delete <session-id> --yes`

Hermes also has a built-in `Default` preset. A user can keep the default model selection or provide a model id in the same preset-backed configuration flow used by Codex and Claude.

## Runtime Mapping

| Product surface | Mode | Hermes surface |
| --- | --- | --- |
| Chat | `interactive` | `hermes acp` |
| Task | `oneshot` | `hermes -z` |
| Workflow | `oneshot` | `hermes -z` |
| Channel test | `oneshot` | `hermes -z` |
| Cleanup | app operation | `hermes sessions delete ... --yes` |

Interactive chat supports in-process continuation, resume after detach, resume after app restart, interrupt, continue, and ACP permission requests. Turn-level resume and free-form user-input requests are not declared.

Developer instructions are prepended only to the first prompt of a newly created ACP session. A resumed session receives only the new user prompt so persisted context is not duplicated.

## Verification Boundary

The repository includes protocol-level tests backed by a fake ACP subprocess for session creation, streaming updates, tool calls, permission requests, cancellation, model selection, detach, and resume. Driver and session tests also cover persisted conversation state and cleanup command construction.

The `hermes` executable was not installed on the implementation machine, so a live smoke test against a locally configured Hermes account was not run. The integration is aligned with the official protocol and CLI documentation, but release validation should still include one real `hermes -z` call and one real `hermes acp` conversation.

## References

- [Official integration surfaces](official-integration-surfaces.md)
- [Hermes CLI commands](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- [Hermes programmatic integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
- [Hermes Agent repository](https://github.com/NousResearch/hermes-agent)
