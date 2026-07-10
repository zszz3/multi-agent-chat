# Windows Phase 04: Runtime Certification

## 2026-07-10

### Status

Proposed. Requires Phases 01 through 03.

## Goal

Certify each Agent Runtime independently on an installed Windows application and publish truthful capability/status behavior. This phase does not broaden Runtime capabilities; it proves or narrows the declarations already exposed by each driver.

## Shared Rule

Every Runtime must continue to enter through its `createXxxDriver()` builder. Windows support must not introduce Runtime-specific branches in `AgentHub`, Chat, Task, Workflow, or shared UI orchestration.

General executable, process, and path behavior uses Phase 02 platform adapters. Only official protocol differences remain Runtime-local.

## Target Files

Shared:

- `src/shared/runtime-catalog.ts`
- `src/main/agents/runtime/detect.ts`
- `src/main/agents/runtime/detect.test.ts`
- Runtime availability/configuration renderer components
- `docs/agent-integration-guide.md`

Runtime-local as evidence requires:

- `src/main/agents/<runtime>/`
- `src/main/hub/runtime/executor/<runtime>/`
- `docs/<runtime>/README.md`

Do not edit a Runtime that already passes its matrix row merely to make file structures symmetrical.

## Step 1: Implement A Repeatable Certification Harness

Record for every run:

- app commit and packaged artifact checksum;
- Windows edition/build/architecture;
- Runtime version and resolved executable path;
- install method;
- configured channel and safe model identifier;
- workspace path shape;
- scenario result and elapsed time;
- child PIDs before, during, and after cancellation/shutdown;
- logs with credentials and prompt-sensitive content removed.

Use one workspace under a path containing spaces and one under a non-ASCII user profile. Repeat required scenarios after an application restart.

## Step 2: Certify Common Scenarios

For every Runtime that claims native Windows support:

1. install using the official native method without modifying app code;
2. launch the desktop app from Explorer;
3. refresh Runtime detection;
4. confirm the resolved executable and version;
5. save a default channel;
6. run “test connection”;
7. run one Task and cancel a second Task;
8. run one Workflow node through one-shot execution;
9. open Chat, send two turns, and interrupt an active turn;
10. detach/close and reopen the app;
11. verify resume only if declared;
12. delete the App Chat and verify native cleanup only if declared;
13. confirm no owned child process remains.

An unsupported scenario must fail before process launch with a classified message.

## Step 3: Codex Certification

Verify:

- official Windows installation and resulting `.exe` or npm `.cmd` form;
- `codex --version` detection through the platform locator;
- app-server stdio launch from a path containing spaces;
- channel test through the configured provider;
- Task and Workflow one-shot behavior;
- Chat streaming, approval/user-input requests, interrupt, detach, and restart resume;
- workflow MCP injection using the packaged Phase 03 sidecar;
- session archive/local cleanup behavior against the actual Windows Codex storage location;
- custom `CODEX_PATH` override.

Required tests:

- Codex RPC process exits with no `cmd.exe` child;
- arguments containing Windows metacharacters remain literal;
- cleanup never deletes outside the official Codex session root.

## Step 4: Claude Certification

Verify separately:

- bundled/declared Claude Agent SDK behavior on Windows;
- any CLI dependency used by channel test or one-shot execution;
- SDK interactive Chat attach, streaming, cancellation, approvals, and resume;
- Task and Workflow one-shot execution;
- packaged MCP configuration;
- actual Windows Claude project/session storage path before enabling cleanup;
- provider environment construction without leaking keys;
- custom `CLAUDE_PATH` behavior if a CLI path remains part of the product contract.

Do not assume the macOS `~/.claude/projects/<slug>` cleanup path is correct until observed from the official Windows Runtime.

## Step 5: Hermes Certification

First decide from official upstream evidence whether Hermes has a supported native Windows entrypoint.

If native support exists, verify:

- installation and `HERMES_PATH` override;
- `hermes -z` one-shot Task/Workflow/channel-test behavior;
- `hermes acp` stdio, session creation, two turns, cancel, approval, detach, and restart resume;
- model selection behavior;
- `hermes sessions delete` against the exact persisted session id;
- no shell or Python launcher remains after shutdown.

If native support does not exist:

- mark Hermes `unsupported on Windows` or `WSL-only`;
- block execution before spawn;
- preserve configurations for cross-platform users;
- do not implement automatic WSL bridging in this program.

## Step 6: OpenCode Certification

Verify:

- official native binary/npm installation and `OPENCODE_PATH` override;
- `opencode run` one-shot behavior;
- `opencode acp --cwd <path>` with spaces and Unicode cwd;
- streaming, cancel, approval, detach, and restart resume;
- channel-test model/provider handling;
- `opencode session delete` against the exact session id;
- no orphan `.cmd`, ACP, or tool child process.

Pay special attention to whether the selected distribution is an `.exe` or a package-manager shim; both must pass the shared launcher contract if both are advertised.

## Step 7: OpenClaw Certification

Verify:

- official native installation and `OPENCLAW_PATH` override;
- Gateway installation/startup requirements are detected and explained;
- `openclaw agent --json` Task/Workflow/channel-test behavior;
- `openclaw acp` Chat attach, streaming, cancel, approvals, detach, and restart resume;
- one-shot model configuration remains distinct from Gateway session model behavior;
- deleting an App Chat does not call an unsupported cleanup surface;
- app shutdown does not terminate an independently managed Gateway unless the app started and owns it;
- app-owned bridge/ACP processes do terminate.

OpenClaw remains without exact durable-session cleanup unless upstream introduces a proven equivalent.

## Step 8: Update Capability And UX Truth

For each Runtime, update only evidence-backed fields:

- availability and compatibility status;
- surface support;
- continuation policies;
- cleanup declaration;
- error/remediation text;
- Agent documentation with Windows limitations and tested versions.

Possible statuses:

- `supported-native`;
- `supported-native-with-prerequisite`;
- `unsupported-windows`;
- `wsl-only-not-integrated`;
- `uncertified`.

Do not overload `available: false` with all meanings if the UI needs distinct remediation. Add a typed compatibility reason rather than parsing human-readable error strings.

## Step 9: Run Regression Suites

Run focused suites after each Runtime and the full suite after the matrix is complete:

```powershell
npm run typecheck
npx vitest run src/main/agents src/main/hub/runtime src/main/hub/agent-hub.test.ts
npm test
npm run build
npm run dist:win:dir
```

Then execute the installed smoke matrix. Mock subprocess tests alone cannot certify a Runtime.

## Certification Matrix

Fill this table with evidence links before Phase 05:

| Runtime | Native install | Detect | Test | Task | Workflow | Chat | Cancel | Restart resume | Cleanup | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Codex | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Uncertified |
| Claude | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Uncertified |
| Hermes | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Uncertified |
| OpenCode | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Uncertified |
| OpenClaw | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | N/A | Uncertified |

## Exit Criteria

- every Runtime has a completed evidence row;
- every UI capability matches certified behavior;
- unsupported Runtimes fail before spawn with actionable status;
- installed Chat, Task, Workflow, and channel-test scenarios pass for every supported Runtime;
- cancellation and shutdown leave no app-owned child process;
- restart/cleanup behavior matches declarations;
- Runtime docs record tested versions, installation method, and limitations;
- full automated suite and packaged smoke suite pass.

## Handoff

Phase 05 treats only `supported-native` or approved prerequisite rows as release-blocking. Uncertified Runtimes cannot be advertised as supported in release notes.
