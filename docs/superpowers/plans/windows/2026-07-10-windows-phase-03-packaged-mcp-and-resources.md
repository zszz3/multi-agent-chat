# Windows Phase 03: Packaged MCP And Bundled Resources

## 2026-07-10

### Status

Proposed. Requires the Phase 01 package layout and Phase 02 platform process API.

## Goal

Make Workflow MCP and bundled read-only resources work from an installed application with no repository checkout, `tsx`, or globally installed Node.js.

## Current Failure Mode

`src/main/hub/runtime/executor/workflow/workflow-mcp-launch.ts` currently searches `process.cwd()` for:

- `node_modules/tsx/dist/cli.mjs`;
- `node_modules/.bin/tsx.cmd`;
- `src/mcp/server.ts`;
- `out/mcp/server.js`.

It then returns `command: "node"`. A normal Windows installation provides none of those guarantees. Development success therefore does not prove packaged MCP success.

## Target Files

Modify:

- `package.json`
- `electron.vite.config.ts` or a dedicated MCP Vite config
- `electron-builder.yml`
- `src/main/app/app-paths.ts`
- `src/main/hub/runtime/executor/workflow/workflow-mcp-launch.ts`
- `src/mcp/server.ts`
- `src/mcp/server.test.ts`

Add as needed:

- `vite.mcp.config.ts`
- `src/main/hub/runtime/executor/workflow/workflow-mcp-launch.test.ts`
- `src/main/platform/node-sidecar.ts`
- `src/main/platform/node-sidecar.test.ts`
- `src/main/platform/packaged-sidecar-launcher.ts`
- `src/main/platform/packaged-sidecar-launcher.test.ts`
- packaging manifest assertions for `resources/mcp/server.cjs`

## Step 1: Build MCP As A Dedicated Artifact

Create a production build target for `src/mcp/server.ts`.

Required output:

```text
out/mcp/server.cjs
```

Build constraints:

- Node-compatible CommonJS output to avoid package-level ESM ambiguity in the sidecar;
- no Electron Renderer imports;
- no source TypeScript dependency;
- all runtime dependencies either bundled or explicitly packaged;
- source maps excluded from release unless intentionally published for diagnostics;
- deterministic output path consumed by packaging tests.

A dedicated Vite SSR configuration is preferred over invoking `tsx` in production. Keep the build command explicit, for example `npm run build:mcp`.

## Step 2: Package MCP Outside ASAR

Add the MCP artifact to `electron-builder.yml` through `extraResources`:

```text
resources/
  mcp/
    server.cjs
```

Reasons for keeping it outside ASAR:

- it is launched as a separate process;
- its path must be addressable by an external Runtime configuration;
- Windows process creation and antivirus scanning are more predictable for a real file;
- the app can verify its presence before starting a Workflow run.

Add a package manifest test that fails when the sidecar is missing.

## Step 3: Use The Shipped Runtime

Launch the sidecar with the Electron executable in Node mode:

```text
command: process.execPath
args: [path.join(process.resourcesPath, "mcp", "server.cjs")]
env:
  ELECTRON_RUN_AS_NODE=1
  MULTI_AGENT_CHAT_MCP_BRIDGE=<discovery path>
```

Wrap this in a platform-neutral `PackagedSidecarLauncher` that consumes `PlatformServices`. A focused `node-sidecar.ts` may implement the Electron-as-Node protocol, but Runtime and Workflow code only receive the launcher interface and never know Electron or Windows launch details.

Before locking this choice, prove on the installed Windows artifact that:

- the packaged executable honors `ELECTRON_RUN_AS_NODE`;
- no second desktop window is created;
- stdin/stdout remain available for MCP framing;
- application single-instance handling does not intercept the sidecar;
- exit codes propagate;
- paths containing spaces are passed as structured arguments.

If that proof fails, the fallback is a packaged Node sidecar binary. Do not fall back to a global `node` command.

## Step 4: Remove CWD-Based Production Lookup

Refactor `workflowMcpLaunchConfig` to accept resolved dependencies:

```ts
interface WorkflowMcpLaunchDependencies {
  isPackaged: boolean;
  executablePath: string;
  resourcesPath: string;
  repositoryRoot?: string;
}
```

Behavior:

- packaged: use the resources MCP bundle and shipped runtime;
- development: use the built MCP output first; source/tsx fallback may remain for developer convenience;
- missing packaged bundle: throw a startup/configuration error instead of silently returning no MCP configuration.

The launch config must use the Phase 02 structured invocation API and the Phase 01 `AppResourceLocator`. It must not perform a second platform switch or reconstruct packaged paths independently.

## Step 5: Align Discovery Paths

The desktop bridge writer and MCP reader must resolve the same file:

- Windows default under `%APPDATA%\multi-agent-chat\mcp-bridge.json`, or a single application-owned equivalent selected in the spec;
- override through `MULTI_AGENT_CHAT_MCP_BRIDGE` for tests and explicit integrations;
- parent directory created before writing;
- discovery record written atomically;
- token rotated on each desktop bridge start;
- stale files fail closed when the desktop app is not listening.

Extract a shared pure path contract if Main and MCP currently duplicate logic. Avoid importing Electron from the MCP bundle.

## Step 6: Preserve The Security Boundary

- bridge listens only on loopback;
- every request carries the discovery token;
- token and runner credentials are never logged;
- discovery file permissions are restricted as far as Node/Windows allows;
- sidecar accepts only known tool names and schema-valid input;
- sidecar shutdown closes stdio and does not leave an orphan process;
- a malformed discovery file produces a user-actionable error without exposing its contents.

## Step 7: Test Development And Installed Modes

Unit tests:

- packaged path under `C:\Users\Test User\AppData\Local\Programs\Multi Agent Chat\resources`;
- development path from a repository containing spaces;
- missing MCP artifact;
- environment merge preserves discovery path and does not mutate caller input;
- Windows executable path is not shell-concatenated;
- discovery path resolver parity between desktop and sidecar.

Installed smoke:

1. remove Node.js from PATH for the test process;
2. launch the installed application from Explorer;
3. create a Workflow that invokes an MCP tool;
4. prove sidecar request/response framing;
5. close the app and confirm the sidecar exits;
6. restart and prove a fresh token/discovery record;
7. repeat from a user profile and install path containing spaces.

## Commands

```powershell
npm run build:mcp
npm run build
npm run dist:win:dir
npm run dist:win
npx vitest run src/mcp src/main/hub/runtime/executor/workflow src/main/platform/node-sidecar.test.ts
```

## Exit Criteria

- installed Workflow MCP works with no global Node.js or `tsx`;
- production lookup uses `process.resourcesPath`, not `process.cwd()`;
- sidecar survives install paths with spaces and Unicode;
- desktop and sidecar discovery paths are identical;
- missing or malformed sidecar state fails explicitly;
- application shutdown leaves no MCP child process;
- packaged artifact manifest proves the MCP file exists;
- existing macOS development behavior remains functional.

## Handoff

Phase 04 can now certify Workflow surfaces from the installed application. Phase 05 promotes the MCP sidecar and package-manifest tests into the Windows release gate.
