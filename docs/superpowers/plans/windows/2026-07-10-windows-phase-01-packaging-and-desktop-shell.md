# Windows Phase 01: Packaging And Desktop Shell

## 2026-07-10

### Status

Proposed. Requires Phase 00 scope and baseline decisions.

## Goal

Produce an installable Windows x64 application that starts, loads Renderer and Preload assets, reads bundled resources, persists application data, and presents a native Windows-compatible window shell.

This phase does not certify Agent Runtime execution or packaged MCP.

## Target Files

Modify:

- `package.json`
- `package-lock.json`
- `electron.vite.config.ts`
- `src/main/app/index.ts`
- `src/main/app/app-paths.ts`
- `src/main/app/app-paths.test.ts`

Add as needed:

- `electron-builder.yml`
- `build/icons/icon.ico`
- `src/main/app/window-options.ts`
- `src/main/app/window-options.test.ts`
- `src/main/platform/app-resource-locator.ts`
- `src/main/platform/app-resource-locator.test.ts`
- `.github/workflows/windows-package-smoke.yml` only if Phase 05 has not yet created the final workflow

## Step 1: Add Packaging Dependencies And Scripts

Use `electron-builder` on top of the existing `electron-vite` output.

Add scripts with distinct responsibilities:

```json
{
  "build": "npm run typecheck && electron-vite build && npm run build:mcp",
  "dist:win:dir": "npm run build && electron-builder --win --x64 --dir",
  "dist:win": "npm run build && electron-builder --win nsis --x64"
}
```

`build:mcp` may be a temporary placeholder until Phase 03, but `dist:win` must not be declared release-ready until the MCP artifact exists.

Do not replace `electron-vite`; it remains responsible for Main, Preload, and Renderer bundles.

## Step 2: Define The Windows Package

Create `electron-builder.yml` with explicit fields:

- `appId` and `productName`;
- `directories.output` separate from `out/`;
- packaged file allowlist for `out/main`, `out/preload`, `out/renderer`, and package metadata;
- `extraResources` for bundled skills, workflows, and later MCP output;
- `asar: true`;
- Windows target `nsis` and architecture `x64`;
- `.ico` icon;
- per-user NSIS installation by default;
- upgrade behavior that preserves Electron `userData`;
- artifact names containing product version and architecture.

Prefer an allowlist over `**/*` so tests, source files, local databases, and developer configuration cannot enter the installer accidentally.

Do not place mutable application data under the installation directory.

## Step 3: Make Window Options Platform-Specific

Extract BrowserWindow presentation options from `src/main/app/index.ts` into a pure function that accepts `NodeJS.Platform`.

Required behavior:

- macOS retains `hiddenInset` and traffic-light positioning;
- Windows initially uses the native frame unless a tested title-bar overlay is deliberately chosen;
- Linux uses its existing/default frame behavior;
- shared security options remain unchanged: context isolation enabled, Node integration disabled;
- min width, min height, background color, and preload path remain shared.

Do not reuse macOS traffic-light CSS offsets on Windows.

Add unit tests that snapshot only platform-specific window option fragments, not the entire Electron object.

## Step 4: Make Bundle Paths Packaging-Aware

Introduce a platform-neutral `AppResourceLocator` and keep `src/main/app/app-paths.ts` as its Electron-facing construction boundary. The locator exposes pure resolvers for:

- Preload bundle;
- Renderer HTML;
- bundled skills;
- bundled workflows;
- resources root;
- future MCP sidecar.

Inputs should include:

- main bundle directory;
- `app.isPackaged`;
- `process.resourcesPath` equivalent supplied by the caller.

Development paths may use the repository layout. Packaged paths must never depend on `process.cwd()`.

Update `src/main/app/index.ts` to construct the locator once and inject it into resource consumers. Keep Electron calls at the application boundary so path tests run without Electron.

The public locator contract must not contain `win32`-specific method names. Phase 02 includes it in `PlatformServices`, and Phase 03 reuses it for the MCP sidecar.

## Step 5: Verify Application-Owned Storage

From an installed build, confirm:

- `app.db` and official catalog database live under `app.getPath("userData")`;
- `mcp-bridge.json` lives under the intended app data directory;
- bundled skills copied into user storage are readable;
- uninstalling the application does not delete user workspaces or third-party Agent directories;
- upgrading the installer preserves databases and configuration.

Add a startup diagnostic that classifies missing packaged resources without revealing user secrets. It should name the missing resource category and resolved path.

## Step 6: Build And Smoke Test The Artifact

On Windows:

```powershell
npm ci
npm run typecheck
npm test
npm run dist:win:dir
npm run dist:win
```

Smoke-test both unpacked and installed forms:

1. launch from Explorer, not a developer terminal;
2. confirm no console window remains visible;
3. verify Renderer and Preload load;
4. create and delete an App Chat without invoking an Agent;
5. close and reopen the app; verify persisted state;
6. install under a user path containing spaces;
7. upgrade from the previous artifact and verify state;
8. uninstall and verify app-owned binaries are removed while user workspace data is untouched.

## Automated Tests

- window option tests for `win32`, `darwin`, and `linux`;
- packaged/development app path resolution tests;
- build manifest test ensuring required output directories exist;
- installer smoke job on `windows-latest` producing an unpacked artifact.

## Failure Classification

- missing Renderer/Preload: Phase 01 blocker;
- missing bundled skills/workflows: Phase 01 blocker;
- Agent CLI not found: defer to Phase 02/04;
- Workflow MCP unavailable: expected until Phase 03;
- SmartScreen warning: expected before Phase 05 signing, but document it.

## Exit Criteria

- an NSIS x64 installer is produced on Windows;
- a non-admin user can install and launch it;
- the window chrome is usable on Windows;
- no app startup path depends on repository cwd;
- Renderer, Preload, databases, bundled skills, and bundled workflows work after installation;
- install, upgrade, restart, and uninstall smoke tests pass;
- macOS development build remains green.

## Handoff

Phase 02 receives a real installed executable and resource layout. Phase 03 uses the final package/resource conventions rather than inventing a separate MCP path model.
