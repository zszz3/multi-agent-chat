# Windows Adaptation Program

## 2026-07-10

### Status

Proposed. This document is the canonical contract for adding Windows support from the `codex/windows-adaptation` worktree based on `origin/main` at `54c727a`.

## Purpose

Make the Electron desktop application installable, operable, testable, and releasable on Windows without leaking platform behavior into Chat, Task, Workflow, or Runtime routing.

Windows support is not complete when TypeScript compiles on macOS or when a development build runs from a terminal. Completion requires an installed Windows artifact that can locate supported Agent CLIs, run one-shot and interactive sessions, terminate process trees, launch the bundled MCP server, persist state, and survive application restart.

## Required Reading Order

1. This program contract.
2. [Phase 00: Baseline And Compatibility Matrix](../../plans/windows/2026-07-10-windows-phase-00-baseline-and-compatibility-matrix.md).
3. The active phase plan under `docs/superpowers/plans/windows/`.
4. [Different Agent Integration Guide](../../../agent-integration-guide.md) before changing a Runtime driver.

## Target Support Boundary

### Required for the first release

- Windows 11 x64.
- Per-user installation without administrator privileges.
- Installation and application paths containing spaces.
- Windows user profiles containing non-ASCII characters.
- Packaged execution with no repository checkout, `tsx`, or separately installed Node.js requirement.
- Codex plus every other Runtime that passes Phase 04 native-Windows certification.
- Chat, Task, Workflow, channel test, cancellation, persistence, and restart behavior for every declared Runtime surface.

### Compatibility target

- Windows 10 22H2 x64 may remain supported only if the selected Electron and installer versions still run correctly in Phase 00 and Phase 05 validation.
- Windows arm64 is a later target and must not block the first x64 release.

### Non-goals for the first release

- Microsoft Store or MSIX distribution.
- Automatic WSL installation or transparent routing into WSL.
- Automatic installation of third-party Agent CLIs.
- Windows arm64 packaging.
- Auto-update infrastructure beyond producing a signed release artifact.

## Current Baseline

The repository already contains useful Windows seams:

- `src/main/platform/cli-launcher.ts` recognizes `.cmd`, `.bat`, and bare commands.
- CLI launcher tests cover a Windows `cmd.exe` invocation.
- Runtime detection tests include Windows executable overrides.
- application data uses Electron `app.getPath(...)` locations.
- MCP discovery has an `%APPDATA%` path.
- skill installation uses directory junctions on Windows.
- Workflow MCP development lookup recognizes `tsx.cmd`.

The baseline is not release-ready because:

- `electron-vite build` creates bundles but no installer.
- Browser window chrome is configured with macOS-only presentation options.
- `cmd.exe` quoting is hand-written and not proven safe for every Windows metacharacter.
- `SIGINT` and `SIGTERM` do not reliably terminate a Windows process tree.
- CLI discovery assumes the Electron process inherited a useful `PATH`.
- packaged Workflow MCP still depends on `process.cwd()`, repository files, `tsx`, and a `node` command.
- Runtime cleanup and resume paths have not been certified on a real Windows installation.
- there is no Windows CI, signing, installer, upgrade, or uninstall proof.

## Architecture Contract

```text
Renderer / Preload
        |
        v
AgentHub / Chat / Task / Workflow
        |
        v
RuntimeRouter + RuntimeDriverRegistry
        |
        v
Runtime-local driver/session/runner
        |
        v
Platform adapters
  - CLI discovery and invocation
  - process-tree lifecycle
  - filesystem and resource paths
  - packaged MCP launch
        |
        v
Windows OS / installed Agent CLI
```

### Boundary rules

1. `AgentHub`, Chat, Task, Workflow, and shared request contracts must not branch on Windows.
2. General Windows process and path behavior belongs under `src/main/platform/`.
3. Runtime-specific Windows differences remain inside that Runtime's runner, session, codec, or cleanup implementation.
4. Prompts, model ids, working directories, and user configuration must never be interpolated into an unescaped shell command.
5. A Runtime surface is available on Windows only when its official native entrypoint and project integration both pass Phase 04.
6. Unsupported native Runtimes must return an explicit compatibility message, not a generic connection failure.
7. Installed production execution must not depend on the repository root, source TypeScript, development dependencies, or a globally available `node` executable.

## Packaging Decision

Use `electron-builder` with the existing `electron-vite` build output.

The first artifact set is:

- unpacked Windows directory for CI smoke tests;
- NSIS x64 per-user installer for release;
- checksums for published artifacts.

The build must package:

- `out/main`;
- `out/preload`;
- `out/renderer`;
- bundled skills and workflows;
- a separately built MCP server under application resources;
- Windows icons and installer metadata.

## Platform Process Contract

Every external process must use one shared platform API with:

- executable discovery separated from invocation;
- structured argument arrays;
- no `shell: true` for ordinary executables;
- a tested adapter for unavoidable `.cmd` and `.bat` shims;
- `windowsHide: true` for background Agent processes;
- stdout/stderr collection with bounded buffers or streaming;
- explicit timeout and abort behavior;
- protocol-level cancellation before operating-system termination;
- process-tree termination with a bounded graceful period and forced fallback;
- deterministic cleanup on application shutdown.

## Filesystem Contract

- Application-owned mutable files live under Electron `userData` or `appData`.
- Packaged read-only assets resolve from `process.resourcesPath`, never `process.cwd()`.
- Work directories may be drive-letter, UNC, space-containing, or non-ASCII paths.
- both `~/` and `~\` user input are recognized where home expansion is supported.
- containment checks resolve junctions and symbolic links before authorizing local file access.
- no feature assumes case-sensitive paths.
- skill installation must preserve user-owned directories and only remove junctions owned by this application.

## Packaged MCP Contract

The MCP server is a production sidecar, not a development script.

It must:

- be built as a dedicated Node-compatible bundle;
- be copied outside ASAR under application resources;
- start through a runtime shipped with the application;
- receive its discovery file path through environment or structured arguments;
- work when the application is installed under `C:\Program Files` or a per-user path with spaces;
- work when no global `node`, `tsx`, or repository checkout exists;
- preserve the existing localhost token-authenticated bridge boundary.

## Runtime Certification Contract

Each Runtime receives one matrix row covering:

- official Windows installation method;
- resolved executable form (`.exe`, `.cmd`, `.bat`, or unsupported);
- version detection;
- channel test;
- Task one-shot;
- Workflow one-shot;
- interactive Chat attach and two turns;
- cancellation and process cleanup;
- detach and app-restart resume when declared;
- native session cleanup when declared;
- model and environment configuration;
- paths containing spaces and non-ASCII characters.

Certification is evidence-based. A Runtime that lacks a supported native Windows entrypoint is marked unsupported or WSL-only; it is not forced through another Runtime's template.

## Security And Reliability Requirements

- Do not log API keys, Gateway tokens, prompts containing secrets, or complete inherited environments.
- Do not pass untrusted input through raw PowerShell or `cmd.exe` command strings.
- Do not download or install third-party Runtimes silently.
- Installer and release signing secrets exist only in CI secret storage.
- Failure after spawning a child process must close pipes and terminate the complete process tree.
- state changes indicating a run has stopped occur only after cancellation or termination has been requested and observed.
- application uninstall must not delete user workspaces or third-party Agent configuration.

## Phase Dependency Graph

```text
Phase 00: baseline and compatibility decisions
    |
    v
Phase 01: installable Windows shell
    |
    v
Phase 02: reliable platform process and filesystem layer
    |
    v
Phase 03: packaged MCP and resources
    |
    v
Phase 04: Runtime-by-Runtime certification
    |
    v
Phase 05: CI, signing, installer, and release gate
```

Phase 02 may prototype in parallel with Phase 01 after the Phase 00 support boundary is locked. Phase 03 and Phase 04 must validate against packaged paths, not only development mode. Phase 05 signs only artifacts that pass all required Runtime rows.

## Program-Level Acceptance Criteria

Windows adaptation is complete only when:

- a clean Windows machine installs the NSIS artifact without administrator privileges;
- the installed app starts without a terminal window or missing-resource error;
- application data and MCP discovery use the correct Windows user directories;
- every declared Runtime surface passes its Phase 04 row;
- cancelling or closing a run leaves no orphan Agent, `cmd.exe`, or Gateway child process owned by the app;
- Workflow MCP works without global Node.js or repository files;
- paths with spaces and non-ASCII user names pass installation, workspace, artifact, and Runtime tests;
- restart restores only the session capabilities each Runtime declares;
- Windows CI builds and tests on every pull request;
- the release installer is signed and its checksum is published;
- macOS behavior and existing Runtime tests remain green.

## Change Management

- Update this spec only for durable scope or boundary decisions.
- Put file-by-file implementation instructions in the phase plans.
- Record discovered Runtime limitations in the relevant Agent documentation and Phase 04 matrix.
- Remove completed plans after their durable outcomes have been reflected here or in focused specs.
