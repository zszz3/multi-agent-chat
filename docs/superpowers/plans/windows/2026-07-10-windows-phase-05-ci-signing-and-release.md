# Windows Phase 05: CI, Signing, And Release

## 2026-07-10

### Status

Proposed. Requires all required Phase 04 Runtime rows to pass.

## Goal

Turn the Windows implementation into a repeatable release process with Windows-native CI, signed NSIS artifacts, checksums, upgrade/uninstall proof, and a final clean-machine gate.

## Target Files

Modify:

- `package.json`
- `package-lock.json`
- `electron-builder.yml`
- release documentation and Runtime support notes

Add:

- `.github/workflows/windows-ci.yml`
- `.github/workflows/windows-release.yml` or a Windows job in the existing release workflow
- `scripts/windows/package-smoke.ps1`
- `scripts/windows/installed-app-smoke.ps1`
- `scripts/windows/process-leak-check.ps1`
- Windows release checklist documentation if the repository maintains release docs

## Step 1: Add Pull-Request Windows CI

Use a pinned Node version compatible with the Electron project and `npm ci`.

Required pull-request jobs on `windows-latest`:

1. dependency install;
2. TypeScript check;
3. unit and integration tests;
4. Electron/Vite production build;
5. MCP production build;
6. unpacked Windows package build;
7. package-manifest smoke test;
8. CLI launcher `.cmd` fixture;
9. process-tree termination fixture;
10. Runtime platform-support contract tests;
11. construction of Windows, macOS, and Linux platform strategies from injected fixtures;
12. artifact upload for failed smoke diagnosis when safe.

Cache npm download data, not `node_modules`. Use concurrency cancellation for superseded branch builds.

The Windows job is required; macOS success cannot substitute for it.

## Step 2: Add Installed-App Smoke Automation

`installed-app-smoke.ps1` should:

- install NSIS silently or with deterministic test arguments into a per-user test path;
- start the application without a developer terminal;
- wait for a health signal or inspect a deterministic startup log;
- verify Renderer, Preload, databases, bundled skills/workflows, and MCP sidecar files;
- create a minimal app-owned state record through a supported test seam;
- close the application gracefully;
- assert no app-owned Electron, Agent fixture, `cmd.exe`, or MCP child remains;
- uninstall the application;
- verify application binaries are removed and user workspace data is preserved.

Do not require real third-party Agent credentials in pull-request CI. Real Runtime certification remains a controlled Phase 04/release environment.

## Step 3: Configure Code Signing

Use Authenticode signing supported by the selected packaging tool.

Requirements:

- certificate and password stored only as CI secrets;
- certificate never written to repository artifacts;
- signing occurs only on protected release refs/environments;
- timestamp server configured so signatures survive certificate expiry;
- both executable and installer signature verified after build;
- unsigned pull-request artifacts clearly labeled non-release;
- failed signing fails the release job rather than publishing unsigned binaries.

Support both local certificate-file signing for controlled testing and CI secret-backed signing through configuration, without hardcoding secret names into runtime code.

## Step 4: Lock Installer Semantics

Verify NSIS behavior:

- per-user install does not request admin rights;
- default path supports spaces;
- Start menu shortcut and uninstall entry are correct;
- upgrade preserves `userData` and MCP/config state;
- downgrade behavior is either supported and tested or explicitly blocked;
- uninstall removes app binaries and shortcuts;
- uninstall does not remove third-party Agent configs, user workspaces, or managed skills without explicit product policy;
- running app receives a clear close/retry flow during upgrade.

If uninstall offers optional data removal later, it must enumerate exactly which app-owned directories will be deleted.

## Step 5: Produce Release Artifacts

Required release output:

- signed NSIS x64 installer;
- optional signed portable/unpacked diagnostic artifact if product policy allows;
- SHA-256 checksum file;
- build metadata containing app version, commit, Electron version, architecture, and signing result;
- support matrix summary from Phase 04;
- known limitations and prerequisites.

Artifact names must be deterministic and include product version plus architecture.

## Step 6: Run The Clean-Machine Release Gate

On a fresh Windows 11 x64 VM with a standard user:

1. verify installer signature before execution;
2. install without Node.js and without repository files;
3. launch from Explorer;
4. verify no visible background console;
5. verify app state and packaged MCP;
6. install each release-supported Runtime using its documented method;
7. execute the full Phase 04 matrix for required Runtimes;
8. repeat critical paths with a workspace containing spaces;
9. repeat file/path checks under a non-ASCII profile;
10. restart Windows and repeat app startup plus one Chat/Workflow path;
11. upgrade from the previous signed version;
12. uninstall and inspect retained user data.

Windows 10 compatibility, if retained by Phase 00, runs the same installer/startup/MCP smoke subset.

## Step 7: Publish Truthful Release Notes

Release notes must list:

- supported Windows versions and architecture;
- supported Runtime versions/install methods;
- Runtimes that are unsupported, WSL-only, or require a separately running service;
- where application data is stored;
- how to override CLI paths;
- how to diagnose “not installed” versus “not on PATH”;
- known cleanup/resume limitations such as OpenClaw durable-session cleanup;
- installer checksum and signature verification guidance.

Do not advertise a Runtime based on unit tests alone.

## Rollback Plan

If a release regression appears:

- stop publishing the affected artifact;
- preserve the previous signed installer and checksum;
- do not force-delete newer user data on downgrade;
- document whether schema changes are backward compatible;
- patch from the release tag or disable the affected Runtime capability truthfully;
- never bypass signing or process-cleanup gates to accelerate a replacement release.

## Exit Criteria

- Windows CI is required and green;
- unpacked and NSIS artifacts build reproducibly;
- signed installer and executable signatures verify;
- checksums and build metadata are generated;
- installed-app smoke passes without Node.js/repository files;
- required Phase 04 Runtime rows pass on the signed artifact;
- install, upgrade, restart, and uninstall pass on a clean Windows 11 x64 machine;
- Windows 10 result matches the Phase 00 policy;
- release notes state supported and unsupported behavior accurately;
- cross-platform contract tests prove platform support and local availability are not conflated;
- a test-only platform strategy can be added without changing upper-layer business or Runtime protocol code;
- macOS CI remains green.

## Program Completion

After the first Windows release:

1. update the canonical Windows spec with durable decisions discovered during implementation;
2. move tested Runtime versions and limitations into their Agent docs;
3. remove obsolete phase instructions or mark them completed only while they remain useful for maintenance;
4. open separate programs for arm64, MSIX/Store delivery, auto-update, or WSL integration rather than expanding this release contract silently.
