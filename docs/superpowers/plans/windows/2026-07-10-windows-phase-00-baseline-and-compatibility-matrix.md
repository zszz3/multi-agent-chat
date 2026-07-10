# Windows Phase 00: Baseline And Compatibility Matrix

## 2026-07-10

### Status

Proposed. Execute before changing packaging or platform code.

## Goal

Produce a reproducible Windows baseline and lock the first-release support matrix. This phase prevents implementation from confusing “works in a macOS development checkout” with “supported in an installed Windows application.”

## Preconditions

- An isolated worktree on branch `codex/windows-adaptation`.
- Base: `origin/main` at or after `54c727a`.
- One clean Windows 11 x64 VM or physical test machine.
- One standard, non-administrator Windows account whose profile path contains a space; add a non-ASCII profile test before final release.

## Outputs

1. A completed Runtime compatibility matrix in this document or a linked evidence file.
2. A recorded Windows/Electron/Node/npm version baseline.
3. A list of upstream-supported native Windows installation methods.
4. A known-failure inventory mapped to later phases.
5. A decision on whether Windows 10 22H2 is release-blocking or compatibility-only.

## Step 1: Establish The Clean Machine Baseline

Record the following before installing any Agent Runtime:

```powershell
[System.Environment]::OSVersion.VersionString
$PSVersionTable.PSVersion
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture
where.exe node
where.exe npm
node --version
npm --version
```

Required record fields:

- Windows edition, build, architecture, locale, and code page;
- whether Developer Mode is enabled;
- user privilege level;
- `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%PATH%`, and `%PATHEXT%` shapes with secrets removed;
- repository path and whether it contains spaces;
- default terminal and PowerShell version.

Do not change machine-wide PATH or enable administrator-only features to make the baseline pass.

## Step 2: Prove The Repository Baseline

From a Windows checkout:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Capture:

- failing test names;
- line-ending or path separator failures;
- `node:sqlite` availability;
- copied bundled-skill and bundled-workflow output;
- whether Electron development mode opens without a console error.

The baseline may fail, but failures must be classified before Phase 01:

- packaging-only;
- platform path;
- CLI invocation;
- process lifecycle;
- packaged MCP/resource lookup;
- Runtime-specific;
- unrelated regression.

## Step 3: Inventory Platform-Coupled Code

Review these files and assign each finding to a later phase:

- `package.json`
- `electron.vite.config.ts`
- `src/main/app/index.ts`
- `src/main/app/app-paths.ts`
- `src/main/platform/cli-launcher.ts`
- `src/main/platform/local-file-preview.ts`
- `src/main/skills/skill-installer.ts`
- `src/main/hub/runtime/executor/workflow/workflow-mcp-launch.ts`
- `src/mcp/server.ts`
- every Runtime runner, session, codec, and cleanup implementation

Search commands:

```powershell
rg "process\.platform|process\.cwd|resourcesPath|SIGTERM|SIGINT|\.cmd|\.bat|APPDATA|USERPROFILE|titleBarStyle|trafficLightPosition" src package.json electron.vite.config.ts
rg "spawn\(|execFile\(|shell:" src
```

Every platform-specific behavior must have one owner. Duplicate ownership across Runtime files is a Phase 02 design defect.

## Step 4: Verify Upstream Runtime Entry Points

For each Runtime, use official upstream installation and command documentation. Record exact evidence rather than assuming similarity.

| Runtime | Official native Windows install | Executable form | `--version` | One-shot | Interactive | Cleanup | Initial status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Codex | To verify | To verify | To verify | To verify | To verify | To verify | Uncertified |
| Claude | To verify | SDK/CLI to verify | To verify | To verify | To verify | To verify | Uncertified |
| Hermes | To verify | To verify | To verify | To verify | To verify | To verify | Uncertified |
| OpenCode | To verify | To verify | To verify | To verify | To verify | To verify | Uncertified |
| OpenClaw | To verify | To verify | To verify | To verify | To verify | Not declared by app | Uncertified |

For npm-installed CLIs, record both the shim path returned by `where.exe` and the underlying package version. For binary installers, record the absolute `.exe` path and whether it is added to user or system PATH.

If an upstream Runtime is not native-Windows capable, mark it `unsupported` or `WSL-only`. Do not add an implicit WSL bridge in this program.

## Step 5: Define Product Behavior For Unsupported Runtimes

Lock these UX rules before implementation:

- unavailable Runtime cards remain visible only if useful for configuration discovery;
- status states distinguish `not installed`, `not on PATH`, `unsupported on Windows`, `configuration invalid`, and `connection failed`;
- test connection reports the resolved executable and safe remediation without printing secrets;
- unsupported Runtime selection is blocked before creating a run;
- existing persisted configurations remain readable when opened on Windows.

Expected code owners in later phases:

- Runtime availability model: shared Runtime/catalog types;
- detection and resolution: `src/main/agents/runtime/detect.ts` plus platform locator;
- user-facing status: Runtime/configuration renderer components;
- execution guard: Runtime router or runtime-local capability declaration, not `AgentHub` platform branches.

## Step 6: Create The Acceptance Matrix

Every Runtime row must eventually cover:

| Scenario | Required evidence |
| --- | --- |
| Detect | Fresh app resolves the intended executable without terminal-specific PATH changes |
| Channel test | Configuration page returns success or a classified failure |
| Task | One-shot response, streamed events if applicable, and final exit status |
| Workflow | One node uses the one-shot path and returns a structured result |
| Chat | Attach, first turn, second turn, and event streaming |
| Cancel | Protocol cancel followed by no orphan process |
| Resume | Detach and application restart when declared |
| Cleanup | Exact native session deletion only when declared |
| Paths | Workspace and user profile with spaces and non-ASCII characters |
| Packaging | Same scenario from installed application, not repository dev mode |

Store logs with secrets removed. Record command, app commit, Runtime version, Windows build, and result.

## Tests Added In This Phase

No production behavior needs to change. Add or refine tests only when they capture an already-known portability contract, for example:

- Windows path fixtures in `src/main/platform/*.test.ts`;
- Runtime detection using `.cmd` and `.exe` overrides;
- app path resolution independent of current working directory.

## Exit Criteria

- Windows 11 x64 baseline is reproducible.
- all existing repository failures are classified.
- every Runtime has an upstream-evidence status.
- unsupported Runtime UX behavior is decided.
- the Windows 10 and arm64 scope decision is recorded.
- Phase 01 and Phase 02 have no unresolved product-level choice.

## Handoff

- Phase 01 consumes the OS/installer target and package baseline.
- Phase 02 consumes executable forms, PATH behavior, process findings, and path fixtures.
- Phase 04 consumes the Runtime matrix and upstream evidence.
