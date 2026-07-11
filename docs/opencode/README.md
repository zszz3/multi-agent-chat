# OpenCode Integration

Last updated: 2026-07-10

OpenCode is integrated through its documented CLI and Agent Client Protocol surfaces.

| Product surface | Mode | OpenCode surface |
| --- | --- | --- |
| Chat | `interactive` | `opencode acp --cwd <workDir>` |
| Task | `oneshot` | `opencode run --format json` |
| Workflow | `oneshot` | `opencode run --format json` |
| Channel test | `oneshot` | `opencode run --format json` |
| Cleanup | app operation | `opencode session delete <sessionId>` |

The one-shot runner parses OpenCode's documented newline-delimited JSON records for text, reasoning, tool results, steps, and errors. A configured non-default model is passed in OpenCode's `provider/model` format with `--model`.

Interactive chat uses the shared official ACP client and runtime session lifecycle. It supports new and resumed sessions, detach and app-restart recovery, model selection, cancellation, streaming updates, tools, and permission requests. The native OpenCode session id is persisted only inside the opaque runtime conversation envelope.

The built-in `opencode-default` preset appears on fresh installations. Users can leave model selection at `Default` or enter a `provider/model` id in the same preset-backed configuration flow as Codex and Hermes.

## Verification Boundary

Automated tests exercise the CLI NDJSON contract and ACP JSON-RPC lifecycle with subprocess fixtures, including model selection, session persistence/resume, cancellation through the shared ACP client, and native cleanup. The `opencode` executable was not installed on the implementation machine, so release validation should still run one authenticated real CLI call and one real ACP conversation.

## Official References

- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [OpenCode ACP support](https://opencode.ai/docs/acp/)
- [OpenCode repository](https://github.com/anomalyco/opencode)
